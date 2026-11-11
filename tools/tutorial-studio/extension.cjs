'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LessonRunner } = require('./runner.cjs');
const { startStudio } = require('./server.cjs');
const { typeSource } = require('./native-editor.cjs');
const { rootedCommand } = require('./terminal-command.cjs');
const lessons = {
  'deno-pilot': require('./lessons/deno-pilot.json'),
  fullstack: require('./lessons/fullstack.json'),
  rehearsal: require('./lessons/rehearsal.json'),
};
let studio;

function makeAdapter(root) {
  let editor, expectedVersion;
  const terminals = new Map();
  const check = () => {
    if (!editor || editor.document.isClosed || editor.document.version !== expectedVersion) throw new Error('The lesson document changed outside playback. Stop and start a new take to preserve your edits.');
  };
  return {
    async prepare(relative) {
      if (!relative.startsWith('tutorial-output/') || relative.split(/[\\/]/).includes('..')) throw new Error('Project must be inside tutorial-output/.');
      const settings = vscode.workspace.getConfiguration('editor');
      for (const [key, value] of Object.entries({ tabSize: 2, insertSpaces: true, autoClosingBrackets: 'languageDefined', autoClosingQuotes: 'languageDefined', autoIndent: 'full', formatOnSave: false, formatOnType: false, acceptSuggestionOnEnter: 'off', acceptSuggestionOnCommitCharacter: false, suggestOnTriggerCharacters: true })) {
        await settings.update(key, value, vscode.ConfigurationTarget.Workspace);
      }
      await vscode.workspace.getConfiguration('deno').update('enablePaths', [relative + '/server', relative + '/scripts', relative + '/tests'], vscode.ConfigurationTarget.Workspace);
      await vscode.workspace.getConfiguration('deno').update('enable', true, vscode.ConfigurationTarget.Workspace);
    },
    async open(relative) {
      const realRoot = await fs.realpath(root);
      const target = path.resolve(realRoot, relative);
      if (!target.startsWith(realRoot + path.sep)) throw new Error('File is outside the workspace.');
      // The entire output tree must resolve inside the workspace, including symlinks.
      let parent = path.dirname(target);
      while (true) {
        try {
          const actual = await fs.realpath(parent);
          if (actual !== realRoot && !actual.startsWith(realRoot + path.sep)) throw new Error('Output directory points outside the workspace.');
          break;
        } catch (error) { if (error.code !== 'ENOENT') throw error; parent = path.dirname(parent); }
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, '', { flag: 'wx' });
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      editor = await vscode.window.showTextDocument(document, { preview: false });
      expectedVersion = document.version;
    },
    async nativeType(text, hooks) {
      check();
      editor = await vscode.window.showTextDocument(editor.document, { preview: false });
      const get = () => {
        check();
        if (vscode.window.activeTextEditor?.document !== editor.document) throw new Error('Editor focus changed during native typing.');
        return vscode.window.activeTextEditor;
      };
      const changed = () => { expectedVersion = editor.document.version; editor = vscode.window.activeTextEditor; };
      const before = editor.document.getText();
      const offset = editor.document.offsetAt(editor.selection.active);
      await typeSource(vscode, get, text, hooks, changed);
      const expected = before.slice(0, offset) + text + before.slice(offset);
      const actual = editor.document.getText();
      if (actual !== expected) {
        let at = 0; while (at < actual.length && actual[at] === expected[at]) at++;
        const position = editor.document.positionAt(at);
        throw new Error(`Native editor verification failed at line ${position.line + 1}: expected ${JSON.stringify(expected.slice(at, at + 60))}, got ${JSON.stringify(actual.slice(at, at + 60))}`);
      }
    },
    async complete(expected, wait) {
      check();
      editor = await vscode.window.showTextDocument(editor.document, { preview: false });
      await vscode.commands.executeCommand('editor.action.triggerSuggest');
      await wait(1300);
      await vscode.commands.executeCommand('acceptSelectedSuggestion');
      expectedVersion = editor.document.version;
      if (!editor.document.getText().trimEnd().endsWith(expected)) throw new Error('IntelliSense did not produce the expected completion.');
      await wait(700);
    },
    async insert(text) {
      check();
      const start = editor.selection.start;
      const range = editor.selection;
      if (!await editor.edit(edit => edit.replace(range, text), { undoStopBefore: false, undoStopAfter: false })) throw new Error('Editor rejected the edit.');
      expectedVersion = editor.document.version;
      const end = editor.document.positionAt(editor.document.offsetAt(start) + text.length);
      editor.selection = new vscode.Selection(end, end);
      editor.revealRange(editor.selection);
    },
    async selectUnique(find) {
      check();
      const text = editor.document.getText();
      const index = text.indexOf(find);
      if (!find || index < 0 || text.indexOf(find, index + find.length) !== -1) throw new Error('Replacement text must match exactly once.');
      editor = await vscode.window.showTextDocument(editor.document, { preview: false });
      editor.selection = new vscode.Selection(editor.document.positionAt(index), editor.document.positionAt(index + find.length));
    },
    async save() { check(); if (!await editor.document.save()) throw new Error('Could not save the lesson file.'); },
    async terminal(id, command, waitForExit, type) {
      command = rootedCommand(command, root);
      let terminal = terminals.get(id);
      if (!terminal || terminal.exitStatus) {
        terminal = vscode.window.createTerminal({ name: `Tutorial: ${id}`, cwd: root });
        terminals.set(id, terminal);
        // Wait for the actual prompt, so startup does not echo half a command.
        for (let attempt = 0; !terminal.shellIntegration && attempt < 50; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      terminal.show(true);
      await type(command, async ch => terminal.sendText(ch, false));
      let finish;
      if (waitForExit) {
        if (!terminal.shellIntegration) throw new Error('Terminal shell integration is required to verify command completion. Enable it and start a new take. The command has not been executed.');
        finish = new Promise((resolve, reject) => {
          const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Command completion timed out after 120 seconds. Inspect the terminal.')); }, 120000);
          const subscription = vscode.window.onDidEndTerminalShellExecution(event => {
            if (event.terminal !== terminal) return;
            clearTimeout(timer); subscription.dispose();
            if (event.exitCode !== 0) reject(new Error(`Command exited with ${event.exitCode ?? 'unknown status'}. Inspect the terminal.`));
            else resolve();
          });
        });
      }
      terminal.sendText('', true);
      if (finish) await finish;
    },
    async interrupt(id) { terminals.get(id)?.sendText('\u0003', false); },
    dispose() { for (const terminal of terminals.values()) terminal.dispose(); }
  };
}

async function activate(context) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return;
  const adapter = makeAdapter(root);
  const runner = new LessonRunner(adapter);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  status.command = 'tutorialStudio.open';
  status.text = '$(record) Tutorial Studio'; status.show();
  runner.on('change', state => {
    status.text = `$(record) Studio: ${state.phase} ${state.step}/${state.total}`;
    status.tooltip = state.error || state.note || state.title;
    if (state.phase === 'error') vscode.window.showErrorMessage(state.error);
    // The recorder shows checkpoint notes; avoid covering the code with toasts.
  });
  const open = async () => {
    const name = vscode.workspace.getConfiguration('tutorialStudio').get('lesson', 'fullstack');
    const lesson = lessons[name] || lessons.fullstack;
    if (!studio) studio = await startStudio({ runner, lesson });
    const uri = await vscode.env.asExternalUri(vscode.Uri.parse(`http://127.0.0.1:${studio.port}/`));
    await vscode.env.openExternal(uri);
  };
  context.subscriptions.push(status, { dispose: () => { runner.stop(); adapter.dispose(); studio?.server.close(); studio = undefined; } });
  const commands = {
    open,
    run: () => runner.run(lessons[vscode.workspace.getConfiguration('tutorialStudio').get('lesson', 'fullstack')] || lessons.fullstack),
    pause: () => runner.pause(),
    next: () => runner.next(),
    stop: () => runner.stop()
  };
  for (const [name, handler] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(`tutorialStudio.${name}`, handler));
}
async function deactivate() {
  if (studio) { await studio.close(); studio = undefined; }
}
module.exports = { activate, deactivate };

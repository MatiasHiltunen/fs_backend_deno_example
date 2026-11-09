'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LessonRunner } = require('./runner.cjs');
const { startStudio } = require('./server.cjs');
const lesson = require('./lessons/deno-pilot.json');
let studio;

function makeAdapter(root) {
  let editor, expectedVersion;
  const terminals = new Map();
  const check = () => {
    if (!editor || editor.document.isClosed || editor.document.version !== expectedVersion) throw new Error('The lesson document changed outside playback. Stop and start a new take to preserve your edits.');
  };
  return {
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
          const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Command completion timed out after 30 seconds. Inspect the terminal.')); }, 30000);
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
    if (state.phase === 'checkpoint') vscode.window.showInformationMessage(`${state.title}: ${state.note}`, 'Continue').then(value => { if (value) runner.next(); });
  });
  const open = async () => {
    if (!studio) studio = await startStudio({ runner, lesson });
    const uri = await vscode.env.asExternalUri(vscode.Uri.parse(`http://127.0.0.1:${studio.port}/`));
    await vscode.env.openExternal(uri);
  };
  context.subscriptions.push(status, { dispose: () => { runner.stop(); adapter.dispose(); studio?.server.close(); studio = undefined; } });
  const commands = {
    open,
    run: () => runner.run(lesson),
    pause: () => runner.pause(),
    next: () => runner.next(),
    stop: () => runner.stop()
  };
  for (const [name, handler] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(`tutorialStudio.${name}`, handler));
}
module.exports = { activate };

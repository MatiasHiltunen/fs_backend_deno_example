'use strict';

// All mutations use VS Code's own typing and cursor commands. Pairing, indentation,
// language servers, diagnostics and suggestions remain active during the take.
async function typeSource(vscode, getEditor, text, hooks, changed) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  let firstBlock = hooks.slowStart;
  const command = async (name, argument) => {
    await hooks.gate();
    await vscode.commands.executeCommand(name, argument);
    changed();
  };
  const editor = () => getEditor();
  const after = () => {
    const e = editor(), p = e.selection.active;
    return e.document.lineAt(p.line).text.slice(p.character);
  };
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row];
    if (row) {
      const e = editor(), p = e.selection.active;
      const next = p.line + 1 < e.document.lineCount ? e.document.lineAt(p.line + 1).text.trim() : '';
      const desired = line.trimStart();
      // Enter between a paired brace creates the closing line. Later we move to
      // that existing line instead of inserting a second closing brace.
      if (!after().trim() && next && /^(?:[}\])]|<\/)/.test(next) && desired.startsWith(next)) {
        await command('cursorDown');
        await command('cursorHome');
      } else {
        await command('type', { text: '\n' });
      }
      await hooks.wait(30 + hooks.random() * 90);
    }
    const indentation = line.match(/^\s*/)[0].length;
    let e = editor(), p = e.selection.active;
    let prefix = e.document.lineAt(p.line).text.slice(0, p.character);
    if (!prefix.trim()) {
      while (prefix.length > indentation) {
        await command('deleteLeft');
        e = editor(); p = e.selection.active;
        prefix = e.document.lineAt(p.line).text.slice(0, p.character);
      }
      if (prefix.length < indentation) await command('type', { text: ' '.repeat(indentation - prefix.length) });
    }
    const content = line.slice(indentation);
    for (let index = 0; index < content.length;) {
      await hooks.gate();
      const rest = content.slice(index), ch = rest[0], tail = after();
      const commentEnd = tail.startsWith('-->') ? '-->' : '';
      if (commentEnd && rest.startsWith(commentEnd)) {
        for (let n = 0; n < commentEnd.length; n++) await command('cursorRight');
        index += commentEnd.length;
        continue;
      }
      const tag = tail.match(/^<\/[^>]+>/)?.[0];
      if (tag && rest.startsWith(tag)) {
        for (let n = 0; n < tag.length; n++) await command('cursorRight');
        index += tag.length;
        continue;
      }
      if ('}])\'"`'.includes(ch) && tail.startsWith(ch) && content[index - 1] !== '\\') {
        await command('cursorRight');
        index++;
        continue;
      }
      // Fast bursts vary in length and timing. Structural keys remain single
      // native keystrokes, so opening braces visibly produce their own partner.
      let word = '';
      for (const candidate of rest) {
        if ('{}[]()\'"`'.includes(candidate)) break;
        word += candidate;
      }
      const commentAt = commentEnd ? word.indexOf(commentEnd) : -1;
      if (commentAt > 0) word = word.slice(0, commentAt);
      const limit = firstBlock ? 1 : 6 + Math.floor(hooks.random() * 14);
      const typed = word ? word.slice(0, limit) : ch;
      await command('type', { text: typed });
      index += typed.length;
      const pause = hooks.pace * (0.35 + hooks.random() * 2.2);
      await hooks.wait(pause + (ch === ',' ? 15 : 0));
      if (firstBlock && ch === '{') {
        await hooks.wait(1000);
        // Leave the first brace pair visible; Enter then opens the body.
      }
    }
    if (firstBlock && line.includes('{')) firstBlock = false;
    if (line.trimStart().startsWith('//') && hooks.random() < .25) await hooks.wait(180);
  }
}

module.exports = { typeSource };

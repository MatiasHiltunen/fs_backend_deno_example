'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { typeSource } = require('../native-editor.cjs');
test('reuses the editor-supplied HTML comment ending before typing following lines', async () => {
  let source = '', offset = 0;
  const position = () => { const before = source.slice(0, offset); return { line: before.split('\n').length - 1, character: before.length - before.lastIndexOf('\n') - 1 }; };
  const editor = { document: { get lineCount() { return source.split('\n').length; }, lineAt(line) { return { text: source.split('\n')[line] }; } }, get selection() { return { active: position() }; } };
  const vscode = { commands: { async executeCommand(name, argument) {
    if (name === 'type') { const text = argument.text; const ending = text.includes('<!--') && !text.includes('-->') ? '-->' : ''; source = source.slice(0, offset) + text + ending + source.slice(offset); offset += text.length; }
    else if (name === 'cursorRight') offset++;
    else if (name === 'cursorHome') offset -= position().character;
    else if (name === 'cursorDown') offset = source.indexOf('\n', offset) + 1;
    else if (name === 'deleteLeft') { source = source.slice(0, offset - 1) + source.slice(offset); offset--; }
    else throw new Error(`Unexpected command: ${name}`);
  } } };
  const wanted = '<!-- Explain why the status message exists before the update. -->\n<p>Ready</p>\n';
  await typeSource(vscode, () => editor, wanted, { gate: async () => {}, wait: async () => {}, random: () => 0, pace: 1, slowStart: false }, () => {});
  assert.equal(source, wanted);
});

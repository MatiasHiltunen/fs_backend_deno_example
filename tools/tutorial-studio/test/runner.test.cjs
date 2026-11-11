const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LessonRunner } = require('../runner.cjs');

function fixture() {
  let text = '', saves = 0;
  const files = [], commands = [];
  const adapter = {
    open: async file => files.push(file),
    insert: async ch => { text += ch; },
    selectUnique: async find => {
      assert.equal(text.split(find).length, 2); text = text.replace(find, '');
    },
    save: async () => { saves++; },
    terminal: async (id, command, wait, type) => { let typed = ''; await type(command, async ch => { typed += ch; }); commands.push({ id, typed, wait }); },
    interrupt: async () => {}
  };
  const runner = new LessonRunner(adapter, { sleep: async () => {}, now: () => 1000, random: () => 0 });
  return { runner, adapter, files, commands, text: () => text, saves: () => saves };
}
test('types real content and expands one consistent take path for file and terminal', async () => {
  const f = fixture();
  const result = await f.runner.run({ steps: [
    { action: 'open', file: 'tutorial-output/{{session}}/main.ts' },
    { action: 'type', text: 'const nimi = "Aino";\n' }, { action: 'save' },
    { action: 'terminal', id: 'checks', command: 'deno check tutorial-output/{{session}}/main.ts', waitForExit: true }
  ] });
  assert.equal(result.phase, 'finished'); assert.equal(f.text(), 'const nimi = "Aino";\n');
  assert.equal(f.saves(), 1); assert.equal(f.files[0], 'tutorial-output/take-1000-0/main.ts');
  assert.equal(f.commands[0].typed, `deno check ${f.files[0]}`); assert.equal(f.commands[0].wait, true);
});
test('cancelling during typing preserves the partial file and never runs subsequent commands', async () => {
  const f = fixture();
  const insert = f.adapter.insert;
  f.adapter.insert = async ch => { await insert(ch); f.runner.stop(); };
  const result = await f.runner.run({ steps: [{ action: 'type', text: 'abcdef' }, { action: 'terminal', id: 'server', command: 'must-not-run' }] });
  assert.equal(result.phase, 'stopped'); assert.equal(f.text(), 'a'); assert.equal(f.commands.length, 0);
});
test('a failed terminal command halts the lesson before the next edit', async () => {
  const f = fixture(); f.adapter.terminal = async () => { throw new Error('Command exited with 7'); };
  const result = await f.runner.run({ steps: [{ action: 'terminal', id: 'checks', command: 'false' }, { action: 'type', text: 'must-not-type' }] });
  assert.equal(result.phase, 'error'); assert.match(result.error, /exited with 7/); assert.equal(f.text(), '');
});
test('rejects path traversal and edits outside the lesson output tree', async () => {
  for (const file of ['../main.ts', '/tmp/main.ts', 'tutorial-output/../../main.ts', 'main.ts']) {
    const f = fixture(); await assert.rejects(f.runner.run({ steps: [{ action: 'open', file }] }), /tutorial-output/); assert.equal(f.files.length, 0);
  }
});
test('checkpoint pauses all subsequent work until explicitly continued', async () => {
  const f = fixture(); f.runner.sleep = ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 2)));
  const pending = f.runner.run({ steps: [{ action: 'checkpoint', title: 'Inspect browser' }, { action: 'type', text: 'x' }] });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.runner.state.phase, 'checkpoint'); assert.equal(f.text(), '');
  await assert.rejects(f.runner.run({ steps: [{ action: 'type', text: 'other' }] }), /already running/);
  f.runner.next(); assert.equal((await pending).phase, 'finished'); assert.equal(f.text(), 'x');
});
test('pause freezes typing and resume continues without skipping characters', async () => {
  const f = fixture(); f.runner.sleep = () => new Promise(resolve => setTimeout(resolve, 2));
  const insert = f.adapter.insert;
  f.adapter.insert = async ch => { await insert(ch); if (ch === 'a') f.runner.pause(); };
  const pending = f.runner.run({ paceMs: 1, steps: [{ action: 'type', text: 'abc' }] });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.text(), 'a'); assert.equal(f.runner.state.phase, 'paused');
  f.runner.pause(); await pending; assert.equal(f.text(), 'abc');
});
test('native playback uses editor commands and stops if source verification fails', async () => {
  const f = fixture();
  let source;
  f.adapter.nativeType = async (text, hooks) => { source = text; await hooks.gate(); throw new Error('Native editor verification failed'); };
  const result = await f.runner.run({ steps: [
    { action: 'native', text: 'function hello() {\n  return "hello"\n}\n' },
    { action: 'terminal', id: 'checks', command: 'must-not-run' }
  ] });
  assert.match(source, /function hello/); assert.equal(result.phase, 'error'); assert.equal(f.commands.length, 0);
});
test('resume starts at the unfinished terminal without opening existing files', async () => {
  const f = fixture();
  const result = await f.runner.run({ resumeStable: true, steps: [
    { action: 'open', file: 'tutorial-output/project/main.ts' },
    { action: 'terminal', id: 'checks', command: 'deno task test', waitForExit: true }
  ] }, 4, 2);
  assert.equal(result.phase, 'finished'); assert.equal(f.files.length, 0);
  assert.equal(f.commands.length, 1); assert.equal(result.markers.length, 1);
});
test('resume rejects an unsafe entry point or a changing output directory', async () => {
  const f = fixture();
  await assert.rejects(f.runner.run({ steps: [{ action: 'wait', ms: 0 }, { action: 'terminal', id: 'checks', command: 'pwd' }] }, 1, 2), /stable project/);
  await assert.rejects(f.runner.run({ resumeStable: true, steps: [{ action: 'wait', ms: 0 }, { action: 'native', text: 'x' }] }, 1, 2), /stable project/);
});

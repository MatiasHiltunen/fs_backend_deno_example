const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startStudio } = require('../server.cjs');

test('recorder serves without dependencies and blocks unauthenticated or arbitrary controls', async t => {
  const studio = await startStudio({ port: 0 }); t.after(() => studio.close());
  const url = `http://127.0.0.1:${studio.port}`;
  const page = await fetch(url); const html = await page.text();
  assert.match(html, /Tutorial Studio/); assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  const key = html.match(/name="studio-key" content="([a-f0-9]+)"/)[1];
  assert.equal((await fetch(`${url}/api/state`)).status, 403);
  assert.equal((await fetch(`${url}/api/state`, { headers: { 'X-Studio-Key': 'bad' } })).status, 403);
  const headers = { 'X-Studio-Key': key, 'Content-Type': 'application/json' };
  const state = await (await fetch(`${url}/api/state`, { headers })).json();
  assert.equal(state.available, false);
  const run = await fetch(`${url}/api/control`, { method: 'POST', headers, body: JSON.stringify({ action: 'run', speed: 1 }) });
  assert.equal(run.status, 409);
  assert.equal((await fetch(`${url}/extension.cjs`)).status, 404);
});
test('only named controls are accepted and oversized or malformed payloads fail', async t => {
  const calls = [];
  const runner = { busy: false, snapshot: () => ({ phase: 'idle' }), run: async (...args) => calls.push(args), update: () => {} };
  const studio = await startStudio({ runner, lesson: { title: 'Pilot' }, port: 0 }); t.after(() => studio.close());
  const url = `http://127.0.0.1:${studio.port}`;
  const html = await (await fetch(url)).text();
  const key = html.match(/name="studio-key" content="([a-f0-9]+)"/)[1];
  const headers = { 'X-Studio-Key': key, 'Content-Type': 'application/json' };
  const post = body => fetch(`${url}/api/control`, { method: 'POST', headers, body });
  assert.equal((await post('not-json')).status, 400);
  assert.equal((await post(JSON.stringify({ action: 'exec', command: 'anything' }))).status, 400);
  assert.equal((await post(JSON.stringify({ action: 'run', speed: 0 }))).status, 400);
  assert.equal((await post('x'.repeat(2100))).status, 413);
  assert.equal(calls.length, 0);
  assert.equal((await post(JSON.stringify({ action: 'run', speed: 1 }))).status, 200);
  assert.equal(calls.length, 1);
});

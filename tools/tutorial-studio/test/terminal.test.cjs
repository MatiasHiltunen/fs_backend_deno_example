const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { rootedCommand } = require('../terminal-command.cjs');

test('the project command works when the reused shell is already inside the project', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutorial root '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'tutorial-output', 'project'); fs.mkdirSync(project, { recursive: true });
  const command = rootedCommand('cd tutorial-output/project && pwd', root);
  assert.equal(execSync(command, { cwd: project, encoding: 'utf8' }).trim(), project);
  assert.equal(execSync(command, { cwd: root, encoding: 'utf8' }).trim(), project);
});

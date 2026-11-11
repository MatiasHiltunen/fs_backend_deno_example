'use strict';
const path = require('node:path');

// A reused terminal keeps its working directory. Resolve authored project changes
// from the workspace, so the same command also works after a previous cd.
function rootedCommand(command, root) {
  return command.replace(/^cd (tutorial-output\/[\w./-]+) && /, (_, relative) => {
    const base = path.resolve(root), target = path.resolve(base, relative);
    if (!target.startsWith(base + path.sep)) throw new Error('Terminal project is outside the workspace.');
    return "cd '" + target.replaceAll("'", "'\"'\"'") + "' && ";
  });
}
module.exports = { rootedCommand };

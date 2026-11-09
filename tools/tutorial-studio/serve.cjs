'use strict';
const { startStudio } = require('./server.cjs');
startStudio().then(({ port }) => console.log(`Recorder: http://127.0.0.1:${port}/ (typing controls require the VS Code extension)`)).catch(error => { console.error(error.message); process.exitCode = 1; });

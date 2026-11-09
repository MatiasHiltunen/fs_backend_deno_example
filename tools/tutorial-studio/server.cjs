'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');

async function startStudio({ runner, lesson, port = 7331, host = '127.0.0.1' } = {}) {
  const key = randomBytes(32).toString('hex');
  const files = { '/': ['index.html', 'text/html'], '/recorder.js': ['recorder.js', 'text/javascript'] };
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && files[url.pathname]) {
        const [file, mime] = files[url.pathname];
        let content = await fs.readFile(path.join(__dirname, 'web', file), 'utf8');
        if (file === 'index.html') content = content.replace('__STUDIO_KEY__', key);
        res.writeHead(200, { 'content-type': `${mime}; charset=utf-8` });
        res.end(content); return;
      }
      if (!url.pathname.startsWith('/api/')) { send(404, { error: 'Not found' }); return; }
      const token = Buffer.from(String(req.headers['x-studio-key'] || ''));
      if (token.length !== key.length || !timingSafeEqual(token, Buffer.from(key))) { send(403, { error: 'Open the recorder page to authorize this request.' }); return; }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        send(200, { available: !!runner, lesson: lesson?.title, ...(runner?.snapshot() || { phase: 'recorder-only', markers: [] }) }); return;
      }
      if (req.method !== 'POST' || url.pathname !== '/api/control') { send(405, { error: 'Method not allowed' }); return; }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2048) { send(413, { error: 'Request too large' }); return; }
      }
      let command;
      try { command = JSON.parse(body); } catch { send(400, { error: 'Invalid JSON' }); return; }
      if (!runner) { send(409, { error: 'Open this recorder through the VS Code extension for paced typing.' }); return; }
      if (command.action === 'run') {
        if (runner.busy) { send(409, { error: 'A lesson is already running.' }); return; }
        if (!(Number(command.speed) >= 0.25 && Number(command.speed) <= 4)) { send(400, { error: 'Invalid speed' }); return; }
        runner.run(lesson, Number(command.speed)).catch(error => runner.update({ phase: 'error', error: error.message }));
      } else if (command.action === 'pause') runner.pause();
      else if (command.action === 'next') runner.next();
      else if (command.action === 'stop') runner.stop();
      else { send(400, { error: 'Unknown control' }); return; }
      send(200, runner.snapshot());
    } catch (error) { if (!res.headersSent) send(500, { error: error.message }); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, port: server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { startStudio };

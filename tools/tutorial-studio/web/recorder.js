'use strict';
const $ = id => document.getElementById(id);
const key = document.querySelector('meta[name="studio-key"]').content;
let recorder, streams = [], chunks = [], bytes = 0, started = 0, pauses = [], pauseStarted = null;
let source = '', sourceSettings = {}, clipURL, notesURL, timer, demoTimer, demoStop, choosing = false;
let state = { available: false, phase: 'idle', markers: [] }, runAnchor = null, runCountdown = null, capturePausedTyping = false;
const setStatus = (message, error = false) => { $('status').textContent = message; $('status').dataset.error = String(error); };
const api = async (action, extra = {}) => {
  const response = await fetch(action ? '/api/control' : '/api/state', {
    method: action ? 'POST' : 'GET',
    headers: { 'X-Studio-Key': key, ...(action ? { 'Content-Type': 'application/json' } : {}) },
    ...(action ? { body: JSON.stringify({ action, ...extra }) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Studio request failed.');
  return result;
};
function clipTime(at = performance.now()) {
  const intervals = [...pauses, ...(pauseStarted === null ? [] : [[pauseStarted, performance.now()]])];
  const paused = intervals.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, at) - Math.max(a, started)), 0);
  return Math.max(0, at - started - paused);
}
function controls() {
  const active = recorder && recorder.state !== 'inactive';
  const busy = ['running', 'paused', 'checkpoint', 'stopping'].includes(state.phase);
  $('run').disabled = !state.available || busy || !!runCountdown;
  $('pauseTyping').disabled = !['running', 'paused'].includes(state.phase);
  $('pauseTyping').textContent = state.phase === 'paused' ? 'Resume typing' : 'Pause typing';
  $('next').disabled = state.phase !== 'checkpoint';
  $('stopTyping').disabled = !busy && !runCountdown;
  $('record').disabled = !!active || choosing;
  $('selfTest').disabled = !!active || choosing;
  $('pauseCapture').disabled = !active;
  $('finish').disabled = !active;
  $('microphone').disabled = !!active; $('tabAudio').disabled = !!active;
}
function download(blob, name, label, id) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.textContent = label; a.id = id;
  $('downloads').append(a); return url;
}
function releaseStreams() { for (const stream of streams) for (const track of stream.getTracks()) track.stop(); streams = []; }
async function finish() {
  if (runCountdown) { clearTimeout(runCountdown); runCountdown = null; }
  if (['running', 'paused', 'checkpoint'].includes(state.phase)) await api('stop').catch(() => {});
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}
function begin(stream, kind) {
  streams.push(stream); chunks = []; bytes = 0; source = kind; pauses = []; pauseStarted = null; runAnchor = null;
  if (clipURL) URL.revokeObjectURL(clipURL);
  if (notesURL) URL.revokeObjectURL(notesURL);
  $('downloads').replaceChildren(); $('preview').hidden = true;
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('This browser cannot encode WebM. Try current Chrome or Edge.');
  sourceSettings = stream.getVideoTracks()[0].getSettings();
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = event => {
    if (!event.data.size) return;
    chunks.push(event.data); bytes += event.data.size;
    if (bytes >= 256 * 1024 * 1024 && recorder.state !== 'inactive') { setStatus('Take limit reached. Finishing the clip.'); finish(); }
  };
  recorder.onerror = event => { setStatus(event.error?.message || 'Recording failed. Finishing available data.', true); finish(); };
  recorder.onstop = () => {
    if (pauseStarted !== null) { pauses.push([pauseStarted, performance.now()]); pauseStarted = null; }
    clearInterval(timer); clearInterval(demoTimer); clearTimeout(demoStop);
    const durationMs = clipTime();
    releaseStreams();
    if (!chunks.length) { setStatus('No video data was captured. Choose a source and try again.', true); controls(); return; }
    const name = `${source === 'self-test' ? 'recorder-self-test' : 'fullstack-lesson'}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const blob = new Blob(chunks, { type: recorder.mimeType });
    clipURL = download(blob, `${name}.webm`, 'Download video (.webm)', 'downloadVideo');
    const notes = { source, durationMs, width: sourceSettings.width, height: sourceSettings.height, frameRate: sourceSettings.frameRate,
      chapters: runAnchor === null ? [] : (state.markers || []).map(marker => ({ ...marker, atMs: clipTime(runAnchor + marker.atMs) })),
      lessonPhase: state.phase, error: state.error || null };
    notesURL = download(new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' }), `${name}.json`, 'Download chapter notes', 'downloadNotes');
    $('preview').src = clipURL; $('preview').hidden = false;
    setStatus(`${source === 'self-test' ? 'Animation self-test' : 'Recording'} ready: ${(bytes / 1024 / 1024).toFixed(1)} MiB. Download before closing this tab.`);
    $('pauseCapture').textContent = 'Pause capture'; controls();
  };
  stream.getVideoTracks()[0].addEventListener('ended', () => finish(), { once: true });
  recorder.start(1000); started = performance.now();
  timer = setInterval(() => {
    const seconds = Math.floor(clipTime() / 1000);
    $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 200);
  setStatus(kind === 'self-test' ? 'Recording animation self-test (3 seconds)…' : 'Recording. Switch to the editor or start the pilot.'); controls();
}
$('record').onclick = async () => {
  if (choosing || (recorder && recorder.state !== 'inactive')) return;
  choosing = true; controls();
  try {
    if ($('tabAudio').checked && $('microphone').checked) throw new Error('Choose microphone narration or shared audio for this take.');
    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture needs HTTPS or localhost and a browser with screen sharing.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: $('tabAudio').checked, surfaceSwitching: 'include', selfBrowserSurface: 'exclude' });
    streams.push(stream);
    if ($('microphone').checked) {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true }); streams.push(microphone);
      if (stream.getAudioTracks().length) throw new Error('For this version, choose microphone narration or shared audio, not both.');
      for (const track of microphone.getAudioTracks()) stream.addTrack(track);
    }
    begin(stream, 'screen');
  } catch (error) { releaseStreams(); setStatus(`Capture did not start: ${error.message}`, true); }
  finally { choosing = false; controls(); }
};
$('pauseCapture').onclick = async () => {
  if (!recorder || recorder.state === 'inactive') return;
  if (recorder.state === 'recording') {
    recorder.pause(); pauseStarted = performance.now(); capturePausedTyping = state.phase === 'running';
    if (capturePausedTyping) await api('pause').catch(error => setStatus(error.message, true));
    $('pauseCapture').textContent = 'Resume capture'; setStatus('Capture paused.');
  } else {
    recorder.resume(); pauses.push([pauseStarted, performance.now()]); pauseStarted = null;
    if (capturePausedTyping && state.phase === 'paused') await api('pause').catch(error => setStatus(error.message, true));
    capturePausedTyping = false; $('pauseCapture').textContent = 'Pause capture'; setStatus('Recording resumed.');
  }
};
$('finish').onclick = finish;
$('run').onclick = () => {
  if (runCountdown) return;
  $('lessonStatus').textContent = 'Starting in 5 seconds. Switch to the editor.';
  runCountdown = setTimeout(async () => {
    runCountdown = null; runAnchor = performance.now();
    try { await api('run', { speed: Number($('speed').value) }); } catch (error) { $('lessonStatus').textContent = error.message; }
    controls();
  }, 5000); controls();
};
$('pauseTyping').onclick = () => api('pause').catch(error => setStatus(error.message, true));
$('next').onclick = () => api('next').catch(error => setStatus(error.message, true));
$('stopTyping').onclick = () => { clearTimeout(runCountdown); runCountdown = null; api('stop').catch(error => setStatus(error.message, true)); controls(); };
$('selfTest').onclick = () => {
  const canvas = $('fixture'), ctx = canvas.getContext('2d'); let frame = 0;
  const draw = () => {
    ctx.fillStyle = '#10191f'; ctx.fillRect(0, 0, 1280, 720); ctx.fillStyle = '#8bdfc6'; ctx.font = 'bold 48px sans-serif';
    ctx.fillText('RECORDER SELF-TEST', 70, 140); ctx.fillStyle = '#e9f0f2'; ctx.font = '30px monospace';
    ctx.fillText('Animation fixture — not a coding lesson', 70, 210); ctx.fillText(`Frame ${frame++}`, 70, 300);
    ctx.fillStyle = '#8bdfc6'; ctx.fillRect(70, 400, 20 + (frame * 9) % 1100, 30);
  };
  draw(); demoTimer = setInterval(draw, 1000 / 30);
  try { begin(canvas.captureStream(30), 'self-test'); demoStop = setTimeout(finish, 3000); }
  catch (error) { clearInterval(demoTimer); releaseStreams(); setStatus(error.message, true); }
};
async function poll() {
  try {
    state = await api();
    if (!runCountdown) $('lessonStatus').textContent = state.available ? `${state.phase} · ${state.step}/${state.total} · ${state.title}` : 'Recorder ready. Open via the VS Code extension to enable typing.';
    if (state.error) $('lessonStatus').textContent = state.error;
    $('note').hidden = !state.note; $('note').textContent = state.note || '';
    $('progress').max = state.total || 1; $('progress').value = state.step || 0; controls();
  } catch (error) { $('lessonStatus').textContent = `Typing connection unavailable: ${error.message}`; }
}
setInterval(poll, 700); poll();
window.addEventListener('beforeunload', event => { if (recorder && recorder.state !== 'inactive') { event.preventDefault(); event.returnValue = ''; } });

import { spawn } from 'node:child_process';
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) {
  console.error('Usage: npm run convert -- recording.webm lesson.mp4'); process.exit(1);
}
const child = spawn('ffmpeg', ['-n', '-i', input, '-map', '0:v:0', '-map', '0:a?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', output], { stdio: 'inherit' });
child.on('error', error => { console.error(`Could not launch ffmpeg: ${error.message}`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

# Full Stack Tutorial Studio

A recorder and a VS Code extension for producing the course's hands-on Deno lessons. The extension makes actual document edits and sends commands to actual terminals. The recorder captures the screen, window, or tab selected in the browser's sharing dialog.

## Start in Codespaces

1. Open this repository in a Codespace, then switch to `tutorial/recording-studio` or extract the supplied kit into the workspace. Deno 2.9.6 and Node 20 or newer are the tested tools.
2. In the Codespace terminal, build and install the extension:

   ```sh
   cd tools/tutorial-studio
   npm ci
   npm run package
   code --install-extension fullstack-tutorial-studio.vsix --force
   ```

3. Open the Command Palette and run **Developer: Reload Window** if the extension is not yet available.
4. Run **Tutorial Studio: Open Recorder**. VS Code opens its private forwarded URL on port 7331. Keep the port private.
5. Choose **Choose screen & record**. The browser asks which surface to share. Choose the editor tab for code only, or a browser window to include switching to the live app. For window capture, place the recorder in a separate window.
6. Choose **Run pilot in 5 seconds**, then switch to the editor. Use **Continue** at the pilot's browser checkpoints.
7. Choose **Finish recording** and download the WebM clip and chapter notes. Review the video before using it in the course.

You must select the capture surface for each recording. A browser's sharing permission cannot be pre-granted by the tool. This also depends on the browser exposing a usable capture surface; an isolated cloud browser may not do so.

To use only the recorder, run `npm run recorder` from this directory, then open `http://127.0.0.1:7331/` locally or its private Codespaces forwarded URL. The VS Code extension enables the typing controls.

## Rehearse and control playback

The normal speed adds small variations and longer pauses at line endings and punctuation. Choose **Slow** for an explanation or **Rehearsal** for a quick check. The extension never invents mistakes or fabricated terminal output.

Each take creates a fresh `tutorial-output/take-…/main.ts`. The existing course examples remain available. **Stop typing** preserves the partial file; manual edits during playback stop subsequent automated edits. Stopping typing does not terminate commands already running in a terminal; use Ctrl+C there when needed.

| Command Palette action | Purpose |
| --- | --- |
| Tutorial Studio: Run Deno Pilot | Start a rehearsal directly in the editor |
| Tutorial Studio: Pause or Resume Typing | Pause between characters or continue |
| Tutorial Studio: Continue from Checkpoint | Proceed after inspecting the browser |
| Tutorial Studio: Stop Typing | End playback and preserve progress |

The pilot follows chapter 04 / T3 of the supplied course material: `/`, `/api/health`, a changed JSON message, and an unknown route returning 404. A final `curl` command waits for the real terminal exit status through VS Code shell integration. If that integration is unavailable, playback stops and explains the missing requirement.

Make sure another server is not already using port 8000. The pilot ends by sending Ctrl+C to its server terminal.

## Recording controls and exports

- Video defaults to a requested 1920×1080 at 30 fps and 8 Mbps. The chosen capture surface determines the actual size and frame rate; chapter notes report those settings.
- Microphone narration and shared audio are optional alternatives. Both are off by default. There is no generated narration.
- Pausing capture also pauses typing when the tool started that pause. The clock and exported chapter times exclude capture pauses. Chapter timing is approximate because control requests cross the network.
- Switching from the captured **tab** to another tab does not capture the new tab. Choose a **window** for the editor → browser workflow, or use separate clips.
- The tool finishes a take at 256 MiB. Download each take before closing or starting another; clips are held in browser memory and are not uploaded automatically.
- **Test recorder with animation** produces a three-second, clearly labelled self-test. It checks encoding, playback, and export. It does not establish that screen sharing is available.

Convert a downloaded clip to MP4 on a machine with FFmpeg:

```sh
npm run convert -- /path/to/recording.webm /path/to/lesson.mp4
```

The converter produces 30 fps H.264 video, preserves available audio, and refuses to overwrite an existing output. FFmpeg is available in the coding agent's environment.

## Customize a lesson

Edit `lessons/deno-pilot.json` before packaging. `paceMs` sets the base character delay. Steps support `open`, `type`, `replace`, `save`, `wait`, `terminal`, `checkpoint`, and `interrupt`. Files must be new files below `tutorial-output/`; `{{session}}` becomes a fresh take identifier. A replacement must match exactly once. Terminal commands are explicitly authored in the lesson file; the web controls cannot submit arbitrary commands.

## Validate

```sh
npm test
npm run package
```

The unit tests cover cancellation, pause/resume, checkpoint behavior, path boundaries, failed commands, and the recorder's control boundary. Also run the animation self-test in a real browser and review an exported clip. The recorder server binds to loopback and requires a session key for playback controls. No passwords, browser cookies, or account tokens are needed by this extension.

# T3 Pet

An Electron desktop companion using your LFG Pet animations that reacts to local T3 Code activity across providers.

## First version

- Drag the pet or its thin white outline to move it; transparent pixels outside let clicks through.
- Hover over the pet for a scrollable list of unsettled chats and their statuses. Requests for approval or input appear first, followed by errors and active work. Completed and idle chats remain listed until marked settled in T3 Code. Snoozed chats are omitted unless they have live work or pending input. The white rounded list fits its contents, opens after 150 ms, and closes about 200 ms after you leave it or immediately when dragging. Click a row to open that exact chat in the local T3 Code browser interface. The browser may need pairing on first use; click the row again after pairing. The installed T3 desktop protocol currently only focuses its window and cannot navigate to a chat. No panel appears when all chats are settled.
- Right-click the pet or use the tray icon for settings, previews, hiding, and quitting.
- Follow every local chat or choose one.
- Resting, working, approval/input needed, finished, error, and offline poses.
- Change size, use still poses, or enable login startup. The pet has no status label or menu button; right-click it for controls.
- Connection automatically resumes when T3 Code opens.
- On Windows, automatically hides when the foreground window covers its monitor, including borderless fullscreen, and returns afterward. Manual hiding stays in effect.
- Original LFG typing, needs-input, ready, broken, and jumping animations. Dragging freezes the current pose; the animation resumes when released.

## Integration

The local adapter opens `~/.t3/userdata/state.sqlite` with SQLite's read-only option and `query_only` enabled. It reads only metadata from the thread, project, session, and latest-turn projections. It never reads messages, tool payloads, provider credentials, or authentication tables. It does not write to T3 Code or call any model. It checks the local runtime file and listening port before reporting connected.

This is an internal database adapter, **not an official T3 Code plugin API**. It was initially verified against T3 Code `0.0.43-nightly.20260926.2282`, commit `6530de0339d2`. A schema change may require an adapter update. Unsupported schemas appear as a connection error. Remote T3 Code environments are outside this version's scope. The folder is configurable for custom local installations.

Attention requests take priority, then recent errors, a brief new-completion pose, and working chats. Historical completions are baselined on launch or reconnection. Stopped sessions do not stay working because of an old running turn. Polling is every 1.5 seconds; a complete approval/request lifecycle shorter than that can be missed.

## Build

Requires Node 24 and npm. No development server is needed or provided.

```sh
npm ci
npm run check
npm test
npm run build
npm run package:win
```

The Windows per-user installer is written to `release/T3-Pet-Setup-0.2.14.exe`. It creates desktop and Start menu shortcuts. Uninstall through Windows Installed Apps. Login startup is off by default.

For local renderer/integration smoke tests, launch the built app with `node_modules/.bin/electron . --smoke-test <absolute-output-folder>`. The app writes six state screenshots, a settings screenshot, and a metadata-only report, then exits. This mode uses a separate preferences folder and never changes login startup.

macOS and Linux packaging targets are included as `package:mac` and `package:linux`; build on the corresponding OS. Only Windows has been tested. Linux login startup and Wayland behavior are not supported in this first version. Installers are unsigned.

## Structure

- `src/main.ts`: windows, tray, settings, polling, and IPC.
- `src/t3-local.ts`: replaceable read-only local adapter.
- `src/pet-state.ts`: provider-independent state selection.
- `src/animations.ts` and `src/renderer/sprite.ts`: source-accurate sprite timing and playback.
- `native/ForegroundMonitor.cs`: Windows foreground fullscreen detection.
- `assets/lfg/`: unmodified sprite sheets from your LFG Pet repository.
- `src/renderer/`: pet and settings views.
- `tests/`: transitions, database safety, and preferences.

Electron renderers are sandboxed with context isolation. They have no Node access or network access. A narrow preload bridge exposes pet controls. Preferences live in the platform's Electron user-data directory for T3 Pet, separate from T3 Code.

The pet artwork comes from https://github.com/SpyC0der77/lfg-codex-pet at commit `60716f8273e4a69b40dace98b241ab5c23733217`, used at its creator's request. See `assets/lfg/SOURCE.md`. DM Sans is distributed under its bundled OFL font license. No AI/image service is needed at runtime.

## Fullscreen detection

Windows builds include a small .NET Framework helper compiled from `native/ForegroundMonitor.cs` using the Windows C# compiler. It checks the foreground window and monitor bounds every 100 ms. During temporary switcher windows, minimization, or invalid focus samples, the pet keeps its previous visibility until a real window is selected. A hidden pet reappears only after the same non-fullscreen window has remained active for 400 ms. It recognizes desktop shell windows and preserves state while the pet itself has focus, and does not read titles. Every 100 ms it samples 32 points in two rings close around the pet, ignoring its own list/settings and accounting for display scaling, to show the thin white outline on dark surroundings and remove it on light surroundings. Samples stay local and are not saved. Separate brightness thresholds avoid flicker. Adaptive background detection is Windows-only. The detector does not monitor Alt or other keyboard input, and the pet has no native menu for Alt to activate. No game-name list is needed. If the helper stops, the pet remains hidden while it restarts.

Run the built app with `--fullscreen-test <absolute-output-folder>` to check normal, maximized, fullscreen, and borderless native window bounds. It also checks actual pet visibility when the fixture is in the foreground. This briefly opens a temporary test window without forcing foreground activation, writes `fullscreen-report.json`, and exits. The report states how many foreground transitions were verified, so background-only geometry checks are not mistaken for a full foreground test. macOS uses native fullscreen-space exclusion; active-window detection is Windows-only in this version.












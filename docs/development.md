# Development and integration

[Back to the README](../README.md)

## Integration

The local adapter prefers `~/.t3/userdata/statev2.sqlite` when present, otherwise opens `state.sqlite`, with SQLite's read-only option and `query_only` enabled. V2 status comes from current run and pending runtime-request metadata, because its legacy projections are frozen after migration. Active runs take priority over queued runs. It reads only thread, project, session, run, and request status metadata. It never reads messages, tool payloads, provider credentials, or authentication tables. It does not write to T3 Code's database or call any model. It checks the local runtime file and listening port before reporting connected.

The optional notification migration changes only `notificationMode` in the selected installation's `client-settings.json`. It preserves unrelated preferences, creates an original-file backup in Pet's own user-data folder, and rolls back if saving Pet preferences fails. Unknown notification formats prevent migration. Bundled helpers request normal closure using Windows `WM_CLOSE`, macOS `NSRunningApplication.terminate`, or Linux X11 `WM_DELETE_WINDOW`, then wait up to ten seconds for exit. They never force-kill T3 Code. If T3 Code has a quit confirmation, finish it before the timeout and retry if needed. The permission dialog lists the scope as all T3 Code windows. A restarted desktop or a still-running local server prevents settings changes.

This is an internal database adapter, **not an official T3 Code plugin API**. It was initially verified against T3 Code `0.0.43-nightly.20260926.2282`, commit `6530de0339d2`. A schema change may require an adapter update. Unsupported schemas appear as a connection error. Remote T3 Code environments are outside this version's scope. The folder is configurable for custom local installations.

Attention requests take priority, then recent errors, a brief new-completion pose, and working chats. Historical completions are baselined on launch or reconnection. Stopped sessions do not stay working because of an old running turn. Polling is every 1.5 seconds; a complete approval/request lifecycle shorter than that can be missed.

## Build from source

Requires Node 24 and npm. No development server is needed or provided.

```sh
npm ci
npm run check
npm test
npm run build
npm run package:win
```

The Windows per-user installer is written to `release/T3-Pet-Setup-0.4.0.exe`. It creates desktop and Start menu shortcuts. Uninstall through Windows Installed Apps. Login startup is off by default.

For local renderer/integration smoke tests, launch the built app with `node_modules/.bin/electron . --smoke-test <absolute-output-folder>`. The app writes six state screenshots, a settings screenshot, and a metadata-only report, then exits. This mode uses a separate preferences folder and never changes login startup.

Smoke checks also capture all onboarding steps, verify cancellation through the real preload bridge, and migrate an isolated fixture settings file. They never close the real T3 Code app or change its preferences. Add `--notification-smoke-test` to request one real system test notification and exercise its click handler. The Windows close-helper test uses a separate harmless fixture window.

Build on each target OS. `npm run package:mac` creates separate DMGs for Apple Silicon and Intel Macs; the native helpers contain both architectures. Install Apple's command line developer tools first with `xcode-select --install`. `npm run package:linux` creates an AppImage and Debian package for the build machine's architecture. On Debian/Ubuntu, install build prerequisites with `sudo apt-get install build-essential libx11-dev libxrandr-dev libxext-dev`. An AppImage also needs the distribution's FUSE 2 runtime, or can be extracted with `--appimage-extract`. Keep the AppImage in a permanent location before enabling login startup.

Linux login startup uses a per-user XDG autostart entry. AppImages launch through their original AppImage path, rather than the temporary mounted executable. X11 and XWayland provide transparent pixel click-through, hover, dragging, and window positioning. A Wayland session must have XWayland installed. Native Wayland T3 Code windows cannot receive X11 close requests, and native Wayland fullscreen windows cannot be inspected by the detector. In that case, quit T3 Code yourself before retrying migration. GNOME may need its AppIndicator extension to show the tray; right-clicking the pet and reopening the app still provide access to controls.

macOS uses a monochrome template paw in the menu bar with a Retina variant. Login startup uses the native login item API. System notification settings can block alerts on every platform. Installers are unsigned; macOS distribution still needs signing and notarization for Gatekeeper to accept downloaded builds without a user override.

`npm run test:packaged` checks the installed-layout runtime after packaging. `.github/workflows/platforms.yml` runs tests, native close/refused-close fixtures, packaging, and packaged smoke tests on Windows, macOS, and Linux with an X11 window manager. The macOS and Linux jobs must run on their runners before those platforms can be considered verified. The current workspace's actual runtime verification is Windows only.

## Structure

- `src/main.ts`: windows, tray, settings, polling, and IPC.
- `src/t3-local.ts`: replaceable read-only local adapter.
- `src/t3-theme.ts` and `src/theme-storage.ts`: read-only appearance sync. Only allowlisted theme keys are decoded from T3 Code's Chromium profile. No database is opened or locked, and no credentials or messages are queried. File changes update open views; a one-second fallback retries profile creation and reads interface font settings. Chromium may delay writing a local-storage change to disk. Unsaved theme-editor previews are not persisted and cannot be observed by this reader.
- `src/t3-palettes.ts`: built-in palette snapshot from T3 Code, under the license in `docs/T3-THEME-LICENSE.txt`.
- Theme sync selects known desktop profile identities, honoring legacy profile directories. A stable profile takes precedence when both stable and development profiles exist; a custom status-data folder, including one named `dev`, does not change the desktop channel.
- `src/pet-state.ts`: provider-independent state selection.
- `src/animations.ts` and `src/renderer/sprite.ts`: source-accurate sprite timing and playback.
- `native/ForegroundMonitor.cs`: Windows foreground fullscreen detection.
- `native/ForegroundMonitorMac.m` and `native/ForegroundMonitorLinux.c`: macOS and X11 fullscreen monitors.
- `native/T3Close*`: normal application closure helpers for onboarding, with no forced termination.
- `src/login-startup.ts`: per-user Linux startup registration and Desktop Entry argument escaping.
- `assets/lfg/`: unmodified sprite sheets from the LFG Pet repository.
- `src/pets.ts`: the bundled Lil' Finder Guy, Biscuit, Miso, and Clover characters, with IDs `lfg`, `biscuit`, `miso`, and `clover`. Per-pet metadata preserves their separate geometry and timing. Retired selections fall back to LFG without resetting other settings.
- `assets/biscuit/`, `assets/miso/`, and `assets/clover/`: generated dog, cat, and bunny artwork, packed into eight-frame sheets with source notes. See [pet-guidance.md](../pet-guidance.md) for creating more pets.
- `assets/icon.svg`: original dark-background, pet-independent app icon source. `assets/icon-transparent.svg` and its PNG/ICO exports are the default for app headers, window icons, Windows/Linux trays, and packaging. `assets/icon-light.svg` and its PNG export provide the same paw on an opaque white background when a background is required. Run `npm run export:icons` with ImageMagick installed to regenerate both variants from the original source. The committed 1024px PNG and multi-size ICO exports are used directly by builds. To regenerate them with ImageMagick, run `magick -background none assets/icon.svg -resize 1024x1024 -set Source "T3 Pet authored paw mark; assets/icon.svg" PNG32:assets/icon.png`, then `magick assets/icon.png -define icon:auto-resize=256,128,64,48,32,24,16 assets/icon.ico`. `assets/trayTemplate.svg` is the monochrome macOS variant, exported at 22px and 44px to `trayTemplate.png` and `trayTemplate@2x.png`.
- `src/renderer/`: pet and settings views.
- `tests/`: transitions, database safety, and preferences.

Electron renderers are sandboxed with context isolation. They have no Node access or network access. A narrow preload bridge exposes pet controls. Preferences live in the platform's Electron user-data directory for T3 Pet, separate from T3 Code.

The pet artwork comes from https://github.com/SpyC0der77/lfg-codex-pet at commit `60716f8273e4a69b40dace98b241ab5c23733217`, used at its creator's request. See `assets/lfg/SOURCE.md`. DM Sans is distributed under its bundled OFL font license. No AI/image service is needed at runtime.

## Fullscreen detection

Windows builds include a small .NET Framework helper compiled from `native/ForegroundMonitor.cs` using the Windows C# compiler. It checks the foreground window and monitor bounds every 100 ms. During temporary switcher windows, minimization, or invalid focus samples, the pet keeps its previous visibility until a real window is selected. A hidden pet reappears only after the same non-fullscreen window has remained active for 400 ms. It recognizes desktop shell windows and preserves state while the pet itself has focus, and does not read titles. Every 100 ms it samples 32 points in two rings close around the pet, ignoring its own list/settings and accounting for display scaling, to show the thin white outline on dark surroundings and remove it on light surroundings. Samples stay local and are not saved. Separate brightness thresholds avoid flicker. Adaptive background detection is Windows-only. The detector does not monitor Alt or other keyboard input, and the pet has no native menu for Alt to activate. No game-name list is needed. If the helper stops, the pet remains hidden while it restarts.

macOS polls the foremost application's on-screen window geometry without reading titles or capturing screen pixels. It also excludes the pet and hover panel from fullscreen Spaces. Linux uses X11/EWMH foreground identity and fullscreen state, plus XRandR monitor geometry for borderless windows. Each platform uses one persistent helper with the same visibility stabilizer. Pixel-based background contrast adaptation remains Windows-only.

Run the built app on Windows or Linux X11 with `--fullscreen-test <absolute-output-folder>` to check normal, maximized, fullscreen, and borderless native window bounds. It also checks actual pet visibility when the fixture is in the foreground. This briefly opens a temporary test window without forcing foreground activation, writes `fullscreen-report.json`, and exits. The report states how many foreground transitions were verified, so background-only geometry checks are not mistaken for a full foreground test. macOS Space transitions require a manual fullscreen check on a Mac.

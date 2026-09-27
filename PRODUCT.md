# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

Electron desktop companion, initially installed on Windows. Cross-platform structure; Wayland is outside the requested scope.

## Stack
Electron selected by the user. TypeScript and a small HTML/CSS renderer are implementation choices for this first version.

## Users
People using T3 Code who want an animated desktop pet to reflect coding-agent activity across providers.

## Product purpose
A floating, draggable pet shows idle, working, waiting, completion, error, and disconnected states without requiring the main T3 Code window to remain visible.

## Operating context
The user runs T3 Code Nightly on Windows. This workspace starts empty. Build and install a basic working version now; never start a development server.

## Capabilities and constraints
- Separate companion app alongside the normal T3 Code installation.
- Provider-independent status from T3 Code's local projections, opened read-only.
- A local database adapter is the initial integration; remote environments and authenticated streaming are future work.
- No chat content, provider credentials, or model calls are needed.
- User-provided AGENTS instructions govern the UI: simple controls, dark muted colors, no decorative dashboard scaffolding.
- The user selected their own LFG Pet artwork from SpyC0der77/lfg-codex-pet. Preserve its source animations.

## Evidence on hand
Installed T3 Code 0.0.43-nightly.20260926.2282, commit 6530de0339d2, stores shared thread/session/turn projections under ~/.t3/userdata/state.sqlite.

The user requires automatic hiding while any fullscreen application is foremost, including games. Windows foreground-window detection implements this without game-specific rules.

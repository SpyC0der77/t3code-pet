# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

Electron desktop companion for Windows, macOS, and Linux. Linux uses X11, including XWayland in a Wayland session, for positioning and cursor tracking.

## Stack
Electron selected by the user. TypeScript and a small HTML/CSS renderer are implementation choices for this first version.

## Users
People using T3 Code who want an animated desktop pet to reflect coding-agent activity across providers.

## Product purpose
A floating, draggable pet shows idle, working, waiting, completion, error, and disconnected states without requiring the main T3 Code window to remain visible.

## Operating context
The user runs T3 Code Nightly on Windows and requires macOS and Linux support. Build and package with the npm scripts; never start a development server.

## Capabilities and constraints
- Separate companion app alongside the normal T3 Code installation.
- Provider-independent status from T3 Code's local projections, opened read-only.
- A local database adapter is the initial integration; remote environments and authenticated streaming are future work.
- No chat content, provider credentials, or model calls are needed.
- First-run onboarding checks T3 Code desktop notification preferences. The user can consent to Pet closing T3 Code gracefully and migrating desktop alerts to Pet. Migration changes only the desktop alert setting, backs up the original preferences, and leaves the database read-only.
- Pet notifications cover approval, input, completion, and failure; they respect the followed-chat filter and fullscreen suppression.
- Filters independently apply a blocklist or whitelist to projects and chats. A chat must pass both filters to affect pet activity, notifications, or the hover list. Empty blocklists allow all; empty whitelists allow none. Selections use stable IDs, so names and titles remain display metadata. Existing project exclusions and single-chat selections migrate without changing their effect.
- User-provided AGENTS instructions govern the UI: simple controls, dark muted colors, no decorative dashboard scaffolding.
- Only nonhuman characters belong in the pet catalogue. Lil' Finder Guy, the dog Biscuit, the cat Miso, and the bunny Clover are bundled. Jadebyte, Lunari, and Kerno remain retired selections. Bella, the Aether characters, Calian, Scarlet, and Airi are excluded.
- The user selected their own LFG Pet artwork from SpyC0der77/lfg-codex-pet. Preserve its source animations.
- T3 Pet is a versatile pet companion. App branding and menu, tray, settings, and notification icons must be independent of the selected character. Use the neutral paw mark for app identity.

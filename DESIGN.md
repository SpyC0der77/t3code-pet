---
name: T3 Pet
description: A pixel desktop companion with compact settings and onboarding.
colors:
  primary: "var(--accent)"
  primary-hover: "var(--accent-hover)"
  canvas: "var(--canvas)"
  surface: "var(--surface)"
  text: "var(--text)"
  muted: "var(--muted)"
  border: "var(--border)"
  divider: "var(--divider)"
  on-primary: "var(--on-accent)"
  error-text: "var(--error)"
  selected: "var(--selected)"
  dark-primary: "var(--accent)"
  dark-primary-hover: "var(--accent-hover)"
  dark-canvas: "var(--canvas)"
  dark-surface: "var(--surface)"
  dark-text: "var(--text)"
  dark-muted: "var(--muted)"
  dark-border: "var(--border)"
  dark-divider: "var(--divider)"
  dark-on-primary: "var(--on-accent)"
  dark-error-text: "var(--error)"
  dark-selected: "var(--selected)"
  pet-text: "#e1e1e1"
  pet-label: "#242226"
  pet-label-border: "#514d56"
typography:
  body:
    fontFamily: "var(--ui-font)"
    fontSize: "var(--ui-font-size)"
    fontWeight: 400
    lineHeight: 1.45
  title:
    fontFamily: "var(--ui-font)"
    fontSize: "1.7143rem"
    fontWeight: 600
    lineHeight: 1.3333
  label:
    fontFamily: "var(--ui-font)"
    fontSize: "1rem"
    fontWeight: 500
  helper:
    fontFamily: "var(--ui-font)"
    fontSize: "0.8571rem"
    lineHeight: 1.5
rounded:
  control: "8px"
  option: "6px"
  pet-status: "4px"
spacing:
  tight: "8px"
  compact: "12px"
  paired: "16px"
  panel-horizontal: "24px"
  panel-vertical: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "5px 11px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "5px 11px"
  field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
    height: "32px"
  pet-status:
    backgroundColor: "{colors.pet-label}"
    textColor: "{colors.pet-text}"
    rounded: "{rounded.pet-status}"
    padding: "2px 8px"
---

# Design System: T3 Pet

## Overview

The pet carries the character; settings and onboarding use compact desktop dialogs based on the user's T3 Code reference. App identity remains a neutral paw, independent of the selected sprite.

## Colors

Settings, onboarding, and the chat list follow T3 Code's saved palette and appearance mode, including custom colors and light/dark mixes. Theme changes repaint open views while preserving drafts and pet state. The pet artwork keeps its original colors.

## Typography

Controls follow T3 Code's interface font preference and size, with its native system font stack as the fallback. DM Sans remains bundled for the pet view. At the default 14px interface size, task titles are 24px, labels are 14px medium weight, and helpers are 12px. Text sizes and proportional line heights scale with the interface size. Use sentence case, readable contrast, and functional copy. No decorative headlines or uppercase eyebrows.

## Layout

Settings opens at 768x600px, matching onboarding. Onboarding opens at 768x600px, matching T3 Code's wide first-run wizard. Both are capped to the display work area with a 470x500px minimum. Settings uses the same 24px app identity and outlined navigation group as onboarding, with four settings tabs that reflow into rows when interface text needs more room. Onboarding follows the upstream identity, segmented Connect/Notifications/Finish progress control, neutral content panel, outlined connection rows, collapsed folder configuration, and inline actions. Its padding is 24px horizontally and 20px vertically, task titles are 24px, controls and rows use 8px corners, and the progress group uses 10px corners. At widths below 540px onboarding padding becomes 16px. The content region scrolls as needed while actions remain visible. See [the source reference](docs/onboarding-reference.md).

Chats shows connection status, a searchable list of loaded chats with project names and current status, and a collapsed Connection settings disclosure. Attention and active chats appear first, followed by other chats in update order. Rows open the chat in T3 Code; saved filters mark excluded chats without hiding them. Empty, disconnected, and failed-open states show explicit feedback. Filters has project search, selection counts, bulk actions and a scrolling list. A collapsed Advanced chat filters disclosure beneath the projects contains a matching searchable chat checkbox list. Both lists independently select Blocklist or Whitelist. The Pet tab starts with the same character gallery as onboarding, with four columns, 8px gaps, and 128px previews rendered at the display pixel density. Illustrated pets use high-quality image smoothing; LFG retains nearest-neighbor pixel edges. It uses two columns below 540px. Preview state and desktop size controls follow the gallery. Native radio controls provide selection and keyboard navigation; a thin theme action-color border and selected surface identify the draft choice. Attribution and still-pose/login controls follow the grid. The tab content scrolls while Save/Discard remains visible. Onboarding shows a 96px preview on Finish, reduced to 64px in compact windows. Folder input and Browse share a row with an 8px gap. Keyboard tabs support arrows, Home and End.

The desktop LFG pet uses its original 256x256 drawing area at the selected size of 96, 128 or 160px. Its transparent window is at least 210px wide and reserves 78px beyond the selected size for controls and status.

## Elevation & Depth

No authored shadows, gradients, glass or glows. Native menus and confirmation dialogs retain operating-system presentation.

## Shapes

Settings and onboarding buttons and fields share 8px corners and 1px borders; notification choices use 6px corners. Native checkbox/radio controls are 16px. The pet status label retains 4px corners. LFG preserves hard pixel edges.

## Components

### Settings controls

Buttons have a 32px minimum height and fields are 32px high. Text buttons are 12px. Background/border feedback takes 120ms and is disabled under reduced motion. Keyboard focus uses a 2px theme action-color outline with 2px offset; disabled controls use 64% opacity. Selection, caret and scrollbar colors come from the active palette.

Save changes is enabled only for edits. Discard restores saved fields and ignored projects. Drafts persist through polling and tab switches. While saving, editable controls are disabled; errors appear beside Save and successful feedback says Saved. Notification setup is disabled until edits are saved or discarded. Quit remains in native pet/tray menus.

### Filters

Checked entries are excluded in Blocklist mode and are the only permitted entries in Whitelist mode. Chats must pass both filters. Empty blocklists allow all; empty whitelists allow none, with explicit helper copy. Switching mode preserves selections. Search filters names and, for chats, project names. Select results and Clear results affect only visible matches. Unavailable selections stay removable and duplicate names show stable IDs. Project rows show chat counts; chat rows show project names. Opening Advanced brings the chat controls into view. Save and Discard apply both modes and selections together. Existing project exclusions migrate to a project blocklist; a prior single-chat choice migrates to a chat whitelist.

### Onboarding and notifications

Settings shows notification setup until onboarding has been completed, then hides the setup button. The header has a Reopen onboarding action available from every tab; save or discard pending edits before using it. Notification setup opens in a centered modal. Its notification content, radio choices, status checks, wording, and styles are shared with onboarding. Cancel, the close button, and Escape dismiss it without applying a choice. Applying a switch retains the native close confirmation; declining leaves the modal open with unchanged preferences. The content scrolls in small windows while actions stay visible.

The setup sequence is Connect, Pet, Notifications, Finish. Pet reuses the settings character gallery with animated resting previews, desktop size, and still poses. It starts from saved preferences, retains drafts when navigating back, and saves on Continue. Finish previews the saved character. Compact progress controls place the number above the label, and the pet gallery uses two columns within the scrolling content region.

Completed setup steps display checkmarks; the current step has a neutral selected background and tinted number circle. Connect can be revisited before completing Notifications; future stages and completed migration cannot be entered through the progress control. Keep my current setup is selected by default. Migration requires choosing Switch to T3 Pet and approving the native request to close T3 Code before preferences change. Action text follows the selected choice and retains its arrow. Cancellation leaves preferences unchanged. The finish action opens settings; notification tests report status. Sounds are disabled when Pet notifications are off while retaining their saved preference. Onboarding follows T3 Code's active surfaces, action color, and interface font. The paw identity remains unchanged.

### Pet and status

The canvas shows resting, working, waiting, finished, error, and offline poses from the LFG sheets. Animation uses elapsed time and the original variable frame durations. Identical frames are not redrawn. Walking plays during dragging and jumping marks completion. The desktop window does not bounce.

The still-pose preference and operating-system reduced-motion setting stop frame changes. The character grid's chosen state remains local and persists while browsing; it does not override live desktop status. Only visible gallery tiles retain decoded images, and hidden tabs pause drawing. The desktop menu's status previews still expire after ten seconds. The optional status label uses one line with ellipsis when necessary and a live status role. Its opaque surface maintains contrast independently of desktop wallpaper.

The menu button appears on hover or keyboard focus. The pet can be dragged, double-clicked for settings, or right-clicked for controls. Enter or Space on the focused pet opens settings. Transparent sprite pixels pass pointer input through to the desktop.


## Do's and Don'ts

- Keep labeled fields, plain status feedback and a visible Save/Discard footer.
- Preserve original artwork, timing, transparency and still poses. Keep LFG's pixel edges.
- Keep controls compact, readable and keyboard accessible.
- Do not add dashboard scaffolding, hero copy, ornamental labels, gradients, glass, glows or large rounded shells.
- Do not use blue controls, transform-on-hover effects or provider identity to select animations.

## LFG animation update

The user supplied LFG Pet sprite sheets replace the original generated cat. Files in assets/lfg are copied unchanged from commit 60716f8273e4a69b40dace98b241ab5c23733217. Blue is part of the explicitly selected artwork; settings use their own system light/dark palette. Emotion frames are 128×128, 49 frames; walking and jumping are 192×208, 16 frames. The 256×256 canvas renders emotion frames at 2× and movement frames at 1× with nearest-neighbor interpolation. Native loop timings are preserved. Reduced motion and offline mode hold the first pose. Fullscreen hiding suspends visible animation with the window.

## Pet selector

Biscuit is a generated golden-brown dog with a cream muzzle and chest, floppy ears, and a terracotta collar. Its five sheets each contain eight 128x128 cells in a 4x2 grid. Separate timing metadata drives resting, laptop typing, a raised-paw request, a sad error pose, and a celebratory hop. The selector uses the existing radio tiles and credits. LFG remains the default with its original artwork and timings.

Miso is an orange tabby kitten with cream paws and a curled striped tail. Its five eight-frame sheets use the same 4x2 cell layout, with its own timing for resting, typing, a raised-paw request, sad error poses, and a hop.

Clover is a cream bunny with long ears and pink centers. Both ears have cream fur throughout. Its five eight-frame sheets use the same cell layout and separate timing. Packing leaves room for the ears through the hop. All four pets use the existing selector and local asset loading.

## App icon

The app identity is separate from its pet artwork. A filled lilac paw on a charcoal square identifies the app in the tray, window menus, notifications, installer, and shortcuts. The authored vector source is assets/icon.svg; the committed PNG is 1024px for macOS packaging, and the multi-size ICO covers 16 through 256 pixels. The macOS menu bar uses the same paw as a black template with transparent surroundings, at 22px and 44px for Retina. Builds use these assets directly and never derive the app icon from the active pet sprite.

Settings and onboarding import ui.css for shared neutral colors, typography, controls, gallery, focus, and scrollbars. Settings uses the same content background, 24px horizontal padding, outlined preference rows, and primary-action footer. Settings tabs retain their keyboard navigation and Save/Discard behavior.

Windows notifications use the registered app identity icon alone. The explicit notification image is omitted to avoid displaying the same paw twice.

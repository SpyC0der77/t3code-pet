---
name: T3 Pet
description: A pixel desktop companion with plain dark settings.
colors:
  primary: "#bb86fc"
  primary-hover: "#cba3ff"
  canvas: "#121212"
  surface: "#1e1e1e"
  button: "#27232c"
  button-hover: "#39333e"
  text: "#e1e1e1"
  muted: "#b3adb9"
  border: "#49434f"
  border-hover: "#77707f"
  divider: "#333035"
  on-primary: "#19121f"
  error-text: "#f29cad"
  pet-label: "#242226"
  pet-label-border: "#514d56"
typography:
  body:
    fontFamily: "Pet Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  connection:
    fontFamily: "Pet Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  label:
    fontFamily: "Pet Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  helper:
    fontFamily: "Pet Sans, sans-serif"
    fontSize: "12px"
    lineHeight: "18px"
  status:
    fontFamily: "Pet Sans, sans-serif"
    fontSize: "13px"
    lineHeight: "20px"
rounded:
  control: "4px"
spacing:
  tight: "8px"
  compact: "12px"
  paired: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.button}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-text:
    textColor: "{colors.muted}"
    padding: "6px 0"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
    height: "40px"
  pet-status:
    backgroundColor: "{colors.pet-label}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "2px 8px"
---

# Design System: T3 Pet

## Overview

**Creative North Star: "A quiet pixel companion"**

T3 Pet displays the user-supplied LFG Pet artwork on a transparent desktop window, paired with a plain Carbon settings form. The sprite keeps its original blue palette.

Settings use compact, labeled fields and visible status text. The pet carries the personality through its silhouette and activity poses. This documents the shipped first version, including its implementation assumptions, rather than proposing a new visual direction.

**Key Characteristics:**

- The user-supplied LFG Pet character without an enclosing panel.
- Dark neutral settings with lilac controls and focus rings.
- Plain labels, small corners, and no decorative depth.

## Colors

Primary lilac identifies the Save action, checkbox selection, and focus. The lighter primary color is the Save hover state.

Carbon canvas and surface colors distinguish the settings window from its fields. Text stays light; muted text remains readable for supporting detail. Borders and dividers provide structure. The pet's status label has its own opaque charcoal surface so the wording remains legible over desktop backgrounds.

Error text is soft rose. Sprite colors come directly from assets/lfg and do not define extra control variants.

## Typography

The bundled DM Sans font is registered locally as Pet Sans, with sans-serif fallback. Settings body and controls use the body role. The connection status has the only larger text treatment, and represents real application state.

Labels use medium weight and sentence case. Helper text and footer text are small, while connection detail and save feedback use the status role. There are no display headlines, uppercase eyebrows, or separate decorative typefaces.

## Layout

Settings are one vertically scrolling form. The content has 24px padding and a centered maximum width of 680px. The Electron settings window starts at 540px wide with a 470px minimum. Height adapts to the available desktop work area, with a 500px minimum. There are no CSS viewport breakpoints.

The folder field and Browse button share a row with an 8px gap. Pet size and preview controls use equal columns separated by 16px. Checkboxes stack with 14px gaps. Dividers and major control groups use 24px separation. The footer separates local chat count from Quit.

The pet canvas uses a 256 by 256 drawing area displayed at 96, 128, or 160px. Its window is at least 210px wide and reserves 78px beyond the chosen sprite size for controls and status. The pet remains centered above its label. No surrounding card is drawn.

## Elevation & Depth

There are no authored shadows or decorative gradients. Solid surfaces, thin borders, and spacing separate controls. The desktop remains visible around the sprite. Native menus and dialogs retain operating-system presentation.

## Shapes

Settings fields, buttons, and the pet status label use small control corners. Their borders are 1px solid. The sprite uses hard pixel rectangles and pixelated rendering. No pill-shaped tags or enclosing floating shell are part of this system.

## Components

### Buttons

Save settings uses the primary color and semibold text. Browse uses the secondary button surface. Both have compact padding and the same small corners. Hover changes background color over 120ms ease. Focus uses a 2px lilac outline with 2px offset. Disabled buttons use 60% opacity and a wait cursor. Quit is a small text button that gains an underline on hover.

### Fields and checkboxes

Text fields and selects share an opaque surface, thin border, 40px height, and labels above. Hover lightens the border. Keyboard focus uses the same outline as buttons. Checkboxes are native 16px controls with a lilac accent. The text caret and selection use lilac. Scrollbars use the border color against the canvas.

Save feedback appears beside Save settings. Errors use rose text; successful saves say Saved. An unavailable saved chat has explicit recovery copy directing the user to another chat or All chats.

### Pet and status

The canvas shows resting, working, waiting, finished, error, and offline poses from the LFG sheets. Animation uses elapsed time and the original variable frame durations. Identical frames are not redrawn. Walking plays during dragging and jumping marks completion. The desktop window does not bounce.

The still-pose preference and operating-system reduced-motion setting stop frame changes. Previews expire after ten seconds. The optional status label uses one line with ellipsis when necessary and a live status role. Its opaque surface maintains contrast independently of desktop wallpaper.

The menu button appears on hover or keyboard focus. The pet can be dragged, double-clicked for settings, or right-clicked for controls. Enter or Space on the focused pet opens settings. Transparent sprite pixels pass pointer input through to the desktop.

## Do's and Don'ts

- Do keep labels above fields and show connection and save feedback in text.
- Do preserve the pet's pixel edges, distinct activity poses, and still-pose option.
- Do keep controls compact, readable, and keyboard focusable.

- Don't add dashboard scaffolding, hero copy, or ornamental headings.
- Don't add gradients, glass, glows, blue accents, or large rounded shells.
- Don't add transform-on-hover effects or use provider identity to select animation.


## LFG animation update

The user supplied LFG Pet sprite sheets replace the original generated cat. Files in assets/lfg are copied unchanged from commit 60716f8273e4a69b40dace98b241ab5c23733217. Blue is part of the explicitly selected artwork; settings retain their existing Carbon palette. Emotion frames are 128×128, 49 frames; walking and jumping are 192×208, 16 frames. The 256×256 canvas renders emotion frames at 2× and movement frames at 1× with nearest-neighbor interpolation. Native loop timings are preserved. Reduced motion and offline mode hold the first pose. Fullscreen hiding suspends visible animation with the window.

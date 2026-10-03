# Making sprite sheets for T3 Pet

Read this guide when creating, repairing, importing, or integrating pet artwork. Follow [AGENTS.md](AGENTS.md) as well. This guide describes T3 Pet's local Electron assets. Recheck the source files before using the numbers below if the renderer has changed.

## Start with the request and existing assets

1. Determine whether the user wants new artwork, a repair, an import, or a selectable pet in the app. Complete the requested scope. Creating a sheet alone does not require changing the app's catalogue.
2. Read [src/animations.ts](src/animations.ts), [src/pets.ts](src/pets.ts), [src/renderer/sprite.ts](src/renderer/sprite.ts), [scripts/build.mjs](scripts/build.mjs), and the animation and pet tests. Check [PRODUCT.md](PRODUCT.md) for character restrictions and [DESIGN.md](DESIGN.md) for rendering constraints.
3. Inspect relevant reference images and existing sheets with the available image-viewing tool. Read their source notes. Preserve the user's character, style, palette, and requested changes.
4. Write a short brief with the character ID, visual reference, required animations, frame layout, timing, and destination. Infer routine choices from the request and project. Ask only for missing information that affects the result.

Use nonhuman characters for the catalogue unless the user changes that requirement. The runtime currently bundles `lfg`, the dog `biscuit`, the cat `miso`, and the bunny `clover`; retired names mentioned in product notes are not implemented pets. Keep new work in its own asset directory. LFG's seven original PNG files and source timing must remain unchanged unless the user requests replacement.

Never start a development server unless the user explicitly asks. Never inspect chat contents, credentials, or T3 Code's database to make artwork. Image generation is an authoring step; the shipped app loads local images and needs no image service.

## Choose the right tools

| Task | Approach |
| --- | --- |
| Create a raster character, poses, or animation frames | Read and apply the installed `imagegen` skill, then use the built-in image generation tool. |
| Change a character's appearance, fix a pose, or remove a painted background | Use `imagegen` for the visual edit. Inspect local edit targets first and supply the actual reference image. |
| Import artwork that already meets the request | Preserve the original pixels and timing. Copy and validate it without generating replacements. |
| Pack existing frames, read PNG dimensions/alpha, calculate bounds, or render previews | Use deterministic local tooling. `pngjs` is already a project dependency. Packing must preserve the artwork. |
| Change the separate paw icon or another editable vector | Edit its existing vector source with an appropriate vector workflow. Keep it separate from pet artwork. |
| Create a pet specifically for ChatGPT Work mode | Use the relevant `work-pets` skill and its contract. That is a separate target from this app. |

Do not substitute procedural drawings, SVG mascots, CSS shapes, or placeholder art for a requested generated raster sprite. Use code for measurement, extraction, packing, and playback, rather than inventing or redrawing character pixels. Respect the current imagegen skill's rules for image editing and post-processing.

Read the installed imagegen skill at execution time and tell the user when applying it. Use its built-in tool by default, including for transparent output. Request actual transparency with `transparent_background: true` when that argument is supported. A checkerboard painted into the image is not transparency.

For local edits, inspect the file before passing it as a reference. Label each input as an edit target or identity/style reference. Preserve identity and all unaffected details in edit prompts. Use only arguments exposed by the current tool; dimensions in a prompt are targets to validate, not guarantees.

Copy final project assets from the tool's returned output location into the workspace. Do not reference files that exist only in the tool's output directory. Use a sibling revision for repairs unless replacement was requested. If the built-in tool fails or is unavailable, report the blocker. Use the imagegen CLI/API fallback only when the user explicitly requests or confirms it, following the skill. Never obtain API keys from T3 Code.

Do not apply the ChatGPT Pets v2 sheet layout, look-direction rows, upload sessions, or activation APIs to T3 Pet. Those do not match this renderer.

## Current animation contract

The app maps six moods to five animations. Preserve these meanings and keep them independent of provider names.

| Mood | Animation key | Current LFG file | Intended action |
| --- | --- | --- | --- |
| `idle` | `ready` | `ready.png` | Calm resting pose with a subtle loop. |
| `offline` | `ready` | `ready.png` | Frame zero of the resting pose. |
| `working` | `typing` | `typing.png` | Clearly working, such as typing at a laptop. |
| `waiting` | `waiting` | `needs-input.png` | Asking for input or approval. |
| `error` | `broken` | `broken.png` | Clear failure or frustration. |
| `done` | `jumping` | `jumping.png` | A brief celebration with a readable landing. |

Use these values for new sheets that intentionally match LFG's geometry and playback. A different layout needs corresponding animation metadata and integration work.

| Animation | Cell size | Grid | Sheet size | Frames | Durations in milliseconds | Loop length |
| --- | --- | --- | --- | --- | --- | --- |
| `ready` | 128 x 128 | 7 columns x 7 rows | 896 x 896 | 49 | First 40, next 47 each 80, last 40 | 3,840 ms |
| `typing` | 128 x 128 | 7 columns x 7 rows | 896 x 896 | 49 | First 20, next 47 each 40, last 20 | 1,920 ms |
| `waiting` | 128 x 128 | 7 columns x 7 rows | 896 x 896 | 49 | First 30, next 47 each 60, last 30 | 2,880 ms |
| `broken` | 128 x 128 | 7 columns x 7 rows | 896 x 896 | 49 | First 20, next 47 each 50, last 30 | 2,400 ms |
| `jumping` | 192 x 208 | 8 columns x 2 rows | 1536 x 416 | 16 | Each 80 | 1,280 ms |

`walking-left.png` and `walking-right.png` also exist in LFG's assets with the movement geometry. They are not registered animation keys in the current code. Dragging holds the current animation; do not assume a walking sheet will play automatically.

Each `Animation` declares `file`, `columns`, `width`, `height`, `durations`, `scale`, `x`, `y`, and an optional starting `row`. Width and height describe one cell. `durations.length` is the frame count; every duration must be finite and greater than zero.

Frames advance left to right, then top to bottom. For zero-based frame `i`, the source crop starts at:

```text
sourceX = (i % columns) * width
sourceY = (row + floor(i / columns)) * height
```

An omitted `row` means zero. With no margins or gutters, sheet width is `columns * width`; minimum sheet height is `(row + ceil(frameCount / columns)) * height`. Make unused cells in a partial final row transparent. Existing LFG tests require an exact sheet size with no starting-row offset. Extend validation if introducing a shared atlas.

The renderer positions sprites relative to a 256 x 256 drawing area, with centering padding on larger canvases. Emotion cells render at `scale: 2`, `x: 0`, `y: 0`. Movement cells render at `scale: 1`, `x: 32`, `y: 40`. Keep the entire scaled cell within that drawing area. Image smoothing is disabled. Check the desktop and gallery CSS before introducing a style that needs smoother scaling.

All animation loops wrap. Reduced-motion mode and offline mode show frame zero, so every animation needs a complete, useful first pose. Check the last-to-first transition as carefully as the other frame transitions.

## Generate coherent motion

1. Establish one canonical character image from the user's reference or a generated base. Fix its silhouette, proportions, face, palette, shading, and view angle. Reuse that image as an identity reference for each animation.
2. Plan each action before generating it. Define the pose sequence, stationary anchor, moving parts, frame count, and loop closure. A jump should show anticipation, takeoff, apex, descent, landing, and recovery.
3. Generate one animation or a manageable ordered strip at a time. Use a sheet directly only if its geometry and every frame pass inspection. If a large grid causes drift or skipped cells, switch to shorter sequences using the same reference and boundary poses.
4. Inspect each result before producing more. Repair the affected sequence while preserving accepted work. If the same failure repeats, change the sequence size or simplify the action.
5. Assemble accepted frames into the final grid with deterministic tooling. Verify the encoded PNG, then generate contact sheets and motion previews from that exact file.

Keep the character's size, camera, baseline, and anchor stable. Movement should come from the action. Avoid per-frame auto-centering or independent resizing, which creates jitter and can erase a jump. If normalization is needed, apply one common scale and coordinate convention across the sequence.

Make poses legible at the app's actual desktop sizes of 96, 128, and 160px, and at the gallery's 80px preview. Keep props consistent and attached to the correct limbs. Leave transparent space around the full motion envelope so ears, tails, hands, and jump poses do not clip. Preserve internal transparent gaps.

Repeated frames are acceptable for deliberate holds. Do not duplicate a few static poses to claim a smooth 49-frame animation, reorder unrelated poses, or add unrequested effects to hide discontinuities. New pets can use fewer well-made frames with appropriate metadata when integration is in scope. Preserve original timing when importing an existing animation.

### Prompt template

Adapt this template to the character and action. Use an exact grid only when generating a complete sheet; otherwise describe the ordered strip and record its extraction geometry.

```text
Use case: stylized-concept
Asset type: transparent PNG animation source for T3 Pet
Primary request: [character] performing [one action] as a coherent looping sequence
Input images: Image 1 is the canonical character identity reference
Style/medium: [match the supplied reference, including pixel treatment]
Subject: [fixed silhouette, proportions, face, palette, and props]
Scene/backdrop: actual transparent background
Composition/framing: [frame count and grid], chronological left-to-right then
top-to-bottom order, equal cells, no gutters, consistent scale and camera,
[anchor position], full character visible with room for the entire action
Motion: [specific ordered poses and return to the starting pose]
Constraints: preserve identity in every frame; frame zero must read as a still
pose; keep stationary objects fixed; keep each pose inside its own cell
Avoid: text, labels, grid lines, watermark, painted checkerboard, opaque
background, camera motion, unintended size changes, clipped parts, extra limbs
```

Request exact output dimensions when useful, then measure the actual result. Reject or repair a malformed grid; do not crop equal cells from a visibly uneven layout and call it finished. Do not stretch a sheet to the required aspect ratio if that distorts the character.

## Save assets and provenance

For artwork-only work, use `output/sprites/<pet-id>/` unless the user names a destination. For an integrated pet, place accepted runtime PNGs and `SOURCE.md` in `assets/<pet-id>/`. Use a stable lowercase ID with letters, digits, and hyphens. Avoid URLs or user-supplied paths as runtime IDs.

Keep prompts, the brief, generation mode, source references, frame order, extraction/packing settings, timing metadata, and validation results with the work. Store contact sheets and animated previews under `artifacts/sprites/<pet-id>/` so the build does not bundle them. Record source permission or license for imported art. For generated art, record that it was generated and the tool used; do not invent an artist credit or permission statement.

Keep accepted sources for targeted revisions. Do not overwrite LFG, add new characters to its source notes, or derive tray/notification/app icons from new pet art.

## Integrate only when requested

Adding files alone does not add a selectable pet. The current `petAnimation` resolves separate LFG, Biscuit, Miso, and Clover metadata, with LFG as the fallback. The build explicitly copies their four asset directories. Extend both when adding another character.

When the user requests app integration:

1. Add the catalogue entry and honest attribution in `src/pets.ts`. Resolve animations by validated pet ID, retaining LFG as the existing default and fallback.
2. Supply per-pet metadata for all five required animation keys. Preserve LFG's original metadata. Verify that desktop, gallery, and onboarding load the selected pet consistently.
3. Update `scripts/build.mjs` to copy the new asset directory into the path used by the renderer. Do not put assets under `dist/renderer/pets` without changing the current build cleanup, which deletes that directory.
4. Update tests that explicitly assert the catalogue IDs. Preserve rejection of unknown IDs and the fallback for retired saved selections. Test the actual new catalogue, metadata, paths, and saved selection.
5. Keep status mapping, read-only database access, neutral app branding, and simple settings controls intact. Do not add an image-generation service to the runtime.

## Validate before handing off

Validate the final PNG bytes, rather than just a source image or preview:

- Decode every sheet and verify dimensions, cell layout, frame coverage, and the file path used by its metadata.
- Check every referenced cell has visible artwork and genuine transparent surroundings. A sheet-wide alpha check alone can miss empty frames or opaque cells.
- Check positive finite durations, total loop time, first-frame still behavior, and wraparound behavior using the real metadata.
- Measure visible bounds per frame and inspect edge contact, clipping, stray pixels, and scale/anchor drift. Intentional motion must retain its planned offsets.
- Review a labeled contact sheet for identity, frame order, limb/prop continuity, and distinct state meanings.
- Play each loop for several cycles at its actual timing. Review light and dark backgrounds, desktop/gallery sizes, and ready-to-action-to-ready transitions. A static contact sheet does not prove motion quality.
- Check frame zero with still poses enabled. For integrated artwork, check selection, save/restart persistence, all six moods, and loading from built local files.

Repair visual failures through imagegen and geometry/packing failures through deterministic tooling within the skill's rules. Rebuild the sheet and regenerate affected previews after each repair. Repeat validation on the final saved bytes.

For integration or state changes, run:

```sh
npm run check
npm test
```

`npm test` runs the build before the tests. Use the built Electron app for visual verification; see [docs/development.md](docs/development.md) for its isolated smoke mode. Sprite validation checks all registered pets; LFG also has its original timing checks. Update the expected catalogue and frame totals in `scripts/smoke-packaged.mjs` when adding pets. Do not weaken checks just to accept faulty artwork.

When changing native capabilities or window behavior, package for the host platform and run `npm run test:packaged` as required by `AGENTS.md`. Ordinary artwork work does not justify changing native code. Report the operating system actually tested; a Windows run does not verify macOS or Linux.

Finish with links to final sheets, source notes, and motion previews. State which animations were delivered, whether they are integrated, which checks passed, and any unresolved issue. Include the final prompts or a link to their saved file. If motion or runtime behavior was not verified, say so plainly.

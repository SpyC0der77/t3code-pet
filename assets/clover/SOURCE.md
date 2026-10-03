# Clover bunny artwork

Clover is a cream bunny with pink inner ears, created for T3 Pet at the user's request on 2026-10-02. On 2026-10-03, the user requested removal of its brown ear patch. All five animation sheets received a targeted imagegen edit to give both ears cream outer fur while retaining the pink centers. The artwork was generated and edited with the built-in OpenAI imagegen tool with transparent output. No third-party artist credit or permission is implied.

The original ready sheet established the character. Its first cell supplied the identity reference for typing, waiting, error, and jumping. Each source contains eight chronological poses in a four-column, two-row grid. The original requested source size was 1536 x 768. Actual accepted dimensions are recorded in the validation report. The original sources and records are preserved in `artifacts/sprites/clover/revisions/brown-ear/`; the current `reference.png` shows the revised ears.

Runtime sheets contain four columns and two rows of 128 x 128 cells, for a sheet size of 512 x 256. Each sequence uses one fixed nearest-neighbor transform based on its first pose's two dark eye regions. Eye spacing is at most 22 pixels, the full first-pose height is at most 88 pixels, the eye midpoint is at x64, and the resting baseline is at y112. Using the face as the scale reference prevents the drooping ears from shrinking the error animation. Source bounds and projected bounds are checked before extraction to catch clipping. Motion offsets and the generated alpha are preserved. The renderer draws cells at 2x in its 256 x 256 drawing area.

| File | Action | Frame durations in milliseconds | Loop length |
| --- | --- | --- | --- |
| `ready.png` | Rest, nose twitch, ear movement, and blink | 600, 140, 160, 90, 90, 140, 180, 300 | 1,700 ms |
| `typing.png` | Type at a laptop | Eight frames at 100 | 800 ms |
| `needs-input.png` | Raise a paw and tilt an ear | 450, 150, 150, 180, 180, 150, 150, 330 | 1,740 ms |
| `broken.png` | Droop the ears and blink sadly | 600, 160, 160, 140, 140, 160, 160, 340 | 1,860 ms |
| `jumping.png` | Crouch, hop, land, and recover | 260, 110, 110, 110, 160, 110, 110, 250 | 1,220 ms |

Idle and offline share the ready sheet. Offline and reduced motion hold frame zero. All five animations loop. No walking animations are supplied.

Authoring records include [prompts.json](../../artifacts/sprites/clover/prompts.json), accepted sources, the identity reference, [prepare.mjs](../../artifacts/sprites/clover/prepare.mjs), and [validation.json](../../artifacts/sprites/clover/validation.json). Rebuild sheets and previews from the repository root with `node artifacts/sprites/clover/prepare.mjs`. This requires project dependencies and ImageMagick's `magick` command.

[clover.gif](../../artifacts/sprites/clover/clover.gif) shows all five states and transitions back to ready on light and dark backgrounds. Separate previews accompany each animation. Authoring files are not bundled with the app. The app's neutral paw icon and other pets remain separate from Clover.

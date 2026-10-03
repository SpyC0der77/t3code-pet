# Miso cat artwork

Miso is an orange tabby kitten with cream paws and a curled striped tail, created for T3 Pet at the user's request on 2026-10-02. Its artwork was generated with the built-in OpenAI imagegen tool with transparent output. No third-party artist credit or permission is implied.

The ready sheet established the character. Its first cell supplied the identity reference for typing, waiting, error, and jumping. Each source contains eight chronological poses in a four-column, two-row grid. The requested source size was 1536 x 768; all five accepted sources are 1774 x 887. The waiting sheet received a targeted imagegen repair to remove a stray glow while preserving its poses.

Runtime sheets contain four columns and two rows of 128 x 128 cells, for a sheet size of 512 x 256. Each sequence uses one fixed nearest-neighbor transform based on its first pose's head width and resting baseline. Motion offsets within each sequence and the generated alpha are preserved. The renderer draws cells at 2x inside its 256 x 256 drawing area.

| File | Action | Frame durations in milliseconds | Loop length |
| --- | --- | --- | --- |
| `ready.png` | Rest, tail movement, and blink | 700, 160, 160, 90, 90, 160, 160, 300 | 1,820 ms |
| `typing.png` | Type at a laptop | Eight frames at 110 | 880 ms |
| `needs-input.png` | Raise a paw and tilt the head | 500, 160, 160, 160, 160, 160, 160, 320 | 1,780 ms |
| `broken.png` | Lower the ears and blink sadly | 700, 150, 150, 150, 150, 150, 150, 340 | 1,940 ms |
| `jumping.png` | Crouch, hop, land, and recover | 320, 120, 120, 120, 180, 120, 120, 280 | 1,380 ms |

Idle and offline share the ready sheet. Offline and reduced motion hold frame zero. All five animations loop. No walking animations are supplied.

Authoring records include [prompts.json](../../artifacts/sprites/miso/prompts.json), accepted sources, the identity reference, [prepare.mjs](../../artifacts/sprites/miso/prepare.mjs), and [validation.json](../../artifacts/sprites/miso/validation.json). Rebuild sheets and previews from the repository root with `node artifacts/sprites/miso/prepare.mjs`. This requires project dependencies and ImageMagick's `magick` command.

[miso.gif](../../artifacts/sprites/miso/miso.gif) shows the five states and transitions back to ready on light and dark backgrounds. Separate motion previews accompany each animation. Authoring files are not bundled with the app.

The app's neutral paw icon, LFG artwork, and Biscuit artwork remain separate from Miso.

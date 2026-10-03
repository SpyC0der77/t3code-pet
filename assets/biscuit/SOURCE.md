# Biscuit dog artwork

Biscuit is a golden-brown floppy-eared puppy created for T3 Pet at the user's request on 2026-10-02. Its artwork was generated with the built-in OpenAI imagegen tool with transparent output. It is generated artwork; no third-party artist credit or permission is implied.

The ready sheet established the character. Its first cell supplied the identity reference for the typing, waiting, error, and jumping sequences. Each accepted source contains eight chronological poses in a four-column, two-row grid. The generated sources are 1774 x 887 pixels rather than the requested 1024 x 512.

Runtime PNGs contain four columns and two rows of 128 x 128 cells, for a sheet size of 512 x 256. Each source sequence uses one common nearest-neighbor transform to match the first pose's head width and resting baseline. This preserves motion offsets within the sequence, including the jump. The generated alpha is preserved. The renderer draws cells at 2x inside its 256 x 256 drawing area.

| File | Action | Frame durations in milliseconds | Loop length |
| --- | --- | --- | --- |
| `ready.png` | Rest, tail wag, and blink | 500, 140, 140, 80, 80, 140, 140, 220 | 1,440 ms |
| `typing.png` | Type at a laptop | Eight frames at 100 | 800 ms |
| `needs-input.png` | Raise and wave a paw | 400, 160, 160, 160, 160, 160, 160, 300 | 1,660 ms |
| `broken.png` | Droop and blink sadly | 500, 140, 140, 140, 140, 140, 140, 300 | 1,640 ms |
| `jumping.png` | Crouch, hop, land, and recover | 240, 100, 100, 100, 140, 100, 100, 240 | 1,120 ms |

Idle and offline share `ready.png`; offline and reduced motion hold frame zero. All five animations loop. No walking animations are supplied.

Authoring records are in [artifacts/sprites/biscuit](../../artifacts/sprites/biscuit), including [prompts.json](../../artifacts/sprites/biscuit/prompts.json), accepted `sources/`, the identity reference, [prepare.mjs](../../artifacts/sprites/biscuit/prepare.mjs), and [validation.json](../../artifacts/sprites/biscuit/validation.json). Rebuild sheets and previews from the repository root with `node artifacts/sprites/biscuit/prepare.mjs`. This requires the installed project dependencies and ImageMagick's `magick` command.

[biscuit.gif](../../artifacts/sprites/biscuit/biscuit.gif) shows all states and the transitions back to ready on light and dark backgrounds. Separate motion previews accompany each animation. These authoring files are not needed at runtime and are not bundled with the app.

The app's neutral paw icon and original LFG artwork remain separate from this character.

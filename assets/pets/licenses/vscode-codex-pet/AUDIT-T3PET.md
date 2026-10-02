# T3 pet asset audit

Repository: https://github.com/Dinohouse-Digital-LLC/vscode-codex-pet
Commit: e32b30c5edea963dfdbd0a1001c9db0ecfbfc93a

## Selection

Include caspian, cinder, hoggie, cat-stack. Visual inspection of contact sheets and all core standard rows shows domestic cats, a stack of ordinary cartoon cats, and a hognose snake. No humans or recognizable anime franchise characters. Cat-stack is stylized cartoon artwork, not recognizably anime. Exclude flux and flux-red conservatively because their fantasy creature design and oversized eyes are anime-like.

## License and provenance

Root LICENSE is MIT, copyright 2026 Andrew Deck. No separate asset license or exclusion is present in pet manifests. The repository-wide MIT notice is the available license for bundled artwork; retain the complete notice with redistributed assets. This is repository licensing evidence, not proof of ownership or independently traced source artwork. Nonstandard manifests cite private local ~/.codex/pets paths, so original prompt, creator, and generation service provenance cannot be independently verified from this clone. No known franchise references appear in selected pet descriptions or inspected artwork. README disclaims affiliation with OpenAI.

No upstream code was run. Images were inspected using Pillow and view_image.

## Standard sheets

All six standard sheets measure 1536x2288, with 192x208 cells and 8 columns, 11 rows. README claims 9 rows, so its full-sheet geometry is stale. Required core rows remain compatible. All four selected pets have the same populated counts.

| T3 state | Row | Populated columns | Recommended playback |
|---|---|---|---|
| idle/offline | 0 | 0 through 6, seven cells | columns 0 through 5, 6fps loop |
| working | 7 | 0 through 5, six cells | 10fps loop |
| waiting/input | 6 | 0 through 5, six cells | 4fps loop |
| error | 5 | 0 through 7, eight cells | 8fps, preferably once then hold final frame |
| done/celebration | 4 | 0 through 4, five cells | 10fps once |

These rates come from media/sprite-config.json. Upstream loops standard failed, but the motion progresses into a failure pose, so holding the final frame avoids restarting the fall. Idle has an extra populated seventh frame, but upstream standard playback explicitly uses six. Row8 review also has six populated frames at 6fps and can be used as a calmer alternative working clip. Row3 waving has four frames at6fps. No padding cells should enter playback.

## Selected paths and hashes

- `pets/caspian/spritesheet.webp`, SHA256 `25475b6354f2fde65b53be2baa30f5b8433e8beafc7fc4a4c1bd66cef4e9bb87`. Manifest `pets/caspian/pet.json`.
- `pets/cinder/spritesheet.webp`, SHA256 `6f9d90d47c59338d86b81e6b321712e3686fd5f1c4c7102651c217d7428759fc`. Manifest `pets/cinder/pet.json`.
- `pets/hoggie/spritesheet.webp`, SHA256 `1c8c5b9abb2e085cc3d3c8ee28025509168a32049cac91df2599b8b1011482f9`. Manifest `pets/hoggie/pet.json`.
- `pets/cat-stack/spritesheet.webp`, SHA256 `55a7d247120e0fa316e0e5ad6a72a9204550c6ab5984c1c798c9a835b3bfb7c2`. Manifest `pets/cat-stack/pet.json`.

## Nonstandard option

Each selected pet also ships pets/<id>/nonstandard-seamless/spritesheet-seamless.webp with matching spritesheet-seamless.json. Atlas5376x2288, 28 columns and11rows, 192x208 cells. Every declared core cell is populated. The manifest timings are consistent across selected pets: idle row0 20frames20fps loop, jumping row4 16frames20fps once, failed row5 28frames20fps once, waiting row6 20frames20fps loop, running row7 20frames20fps loop, review row8 20frames20fps loop. Each added frame is a repeat of a complete source keyframe, not a newly drawn animation frame. Source counts are respectively6,5,8,6,6,6. Prefer standard sheets for smaller payload and existing adapter compatibility. Nonstandard option gives failure one-shot semantics and slightly slower jump0.8s instead of0.5s.

Visual audit files: AUDIT-contact.png and AUDIT-frames.png, generated only inside this temp clone.

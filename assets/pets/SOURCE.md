# Imported pet artwork

Ten spritesheets are copied unchanged from the audited repositories. Playback is adapted for T3 Pet. Offline shares idle; working uses row 7, waiting row 6, error row 5, and completion uses jumping row 4. Idle uses row 0. The adapter excludes padding cells and uses local task timings except for lencx, whose timings are preserved. No image generation or pixel edits were performed.

CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Retain these credits, source links, license files, and modification notice when distributing the artwork.

## shuoyang129-codex-pet-collection

Author: shuoyang129 / Codex Pet Collection

Source: https://github.com/shuoyang129/codex-pet-collection

Commit: `e88139ee6863b157a4efe85ea3fbe26e03a12dfb`

License: CC BY 4.0

Pets: jadebyte, lunari

## lencx-pet

Author: lencx

Source: https://github.com/lencx/pet

Commit: `49d568d871b56f435084c407ae7ba1f676707019`

License: MIT

Pets: kerno

## Source notices

Codex Pet Collection README grants CC BY 4.0 to the artwork and repository materials. Its LICENSE retains the old name Mobao, now Jadebyte. Both original notices are included unchanged. Kiro was excluded because its failed row depicts sleep.

lencx has a root MIT license and no separate asset license or generation provenance. Its original license and README are included unchanged.

Spark and Demir were excluded because their repositories had no reuse grant. VS Code Pets was excluded because it lacks suitable agent-status states and has artwork license exceptions.

Bella, all Aether characters, Calian, Scarlet, and Airi were removed at the user's request. Human characters are not bundled.

## Additional sources audited October 2, 2026

Each temporary git clone was reviewed by a GPT-6.1-Sol subagent with low reasoning. Selected sheets have populated idle, working, waiting, error, and jumping sequences, with 192 by 208 pixel cells, eight columns, and eleven rows. T3 Pet uses seven idle frames, six working frames, six waiting frames, eight error frames, and five completion frames. Playback timing and looping follow T3 Pet's status behavior. Per-file SHA-256 hashes and dimensions are in `sources.json`.

### jcleigh/pets

Source: https://github.com/jcleigh/pets

Commit: `6b10afc6ce82ed3974e1b299c1fab052be03b491`

Pets: Aion, Floppy, Oscillo, all from the originals directory.

License: MIT, copyright 2026 Jordan Cleigh. The complete license, README, and audit are preserved under `licenses/jcleigh-pets`. Human and humanoid characters and franchise-inspired characters were excluded.

### Dinohouse-Digital-LLC/vscode-codex-pet

Source: https://github.com/Dinohouse-Digital-LLC/vscode-codex-pet

Commit: `e32b30c5edea963dfdbd0a1001c9db0ecfbfc93a`

Pets: Caspian, Cinder, Hoggie, Cat Stack.

License: MIT, copyright 2026 Andrew Deck. No separate artwork exclusions were found. The complete license, README, and audit are preserved under `licenses/vscode-codex-pet`. Original generation provenance cannot be independently verified because upstream references private local paths. Flux variants were excluded for anime-like styling.

### Rejected additional source

https://github.com/SnowmanNunu/desktop-pet at `c913611417341e2d11128f87a8f7ceed5e86dc7a` contains four static husky cutouts and aliases for missing actions. It lacks the required animation sequences and a LICENSE file. No assets were imported.

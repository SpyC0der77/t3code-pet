# jcleigh/pets extraction audit

Source https://github.com/jcleigh/pets.git at commit 6b10afc6ce82ed3974e1b299c1fab052be03b491.

Recommended IDs: aion, floppy, oscillo. I visually inspected every frame of their sheets. Aion is an abstract eye and intertwined colored ribbons, Floppy is a beige CRT computer robot, and Oscillo is an orange analog synthesizer robot. None depicts a human or an anime franchise creature. All have visibly different poses and expressions across the required state rows.

Exact relative source paths, rooted at this report's repository directory:

| ID | Manifest | Sheet |
| --- | --- | --- |
| aion | originals/aion/pet.json | originals/aion/spritesheet.webp |
| floppy | originals/floppy/pet.json | originals/floppy/spritesheet.webp |
| oscillo | originals/oscillo/pet.json | originals/oscillo/spritesheet.webp |

All three images are static RGBA WebP atlases, 1536 by 2288 pixels, 8 columns and 11 rows of 192 by 208 cells. Populated columns are contiguous starting at 0. All populated cells in the required rows differ at the pixel level. Never cycle into transparent trailing cells.

| Application state | Row | Populated frames | Visible behavior | Suggested durations in ms |
| --- | --- | --- | --- | --- |
| idle/offline | 0 | 7, columns 0-6 | blink and subtle settling | 280,110,110,140,140,140,320 |
| working | 7 | 6, columns 0-5 | focused eye/face movement | 120,120,120,120,120,220 |
| waiting/input | 6 | 6, columns 0-5 | outward attention/gesture | 150,150,150,150,150,260 |
| error | 5 | 8, columns 0-7 | sad face, slump, recovery | 140,140,140,140,140,140,140,240 |
| done/celebration | 4 | 5, columns 0-4 | squash, rise/jump, settle | 140,140,140,140,280 |

Timing is an adapter recommendation based on current src/pets.ts, not upstream metadata. Upstream pet.json only supplies ID, name, description, sprite version 2, and sheet path. The existing ready default has six durations and would omit the seventh populated idle frame; use seven for these IDs. Other row counts, for completeness: row1 8, row2 8, row3 4, row8 6, row9 8, row10 8.

License is MIT, copyright 2026 Jordan Cleigh. Preserve the full LICENSE copyright and permission notice with copied sheets. LICENSE includes a Star Trek fan-asset disclaimer, and README calls the collection unofficial fan-made mascot assets. The originals directories do not identify a franchise inspiration; their manifests describe original abstract/computer/synth characters. No generation provenance or separate per-asset license was found. MIT is the repository's stated sharing permission, not proof of clearance for third-party character likenesses.

Other visually inspected nonhuman candidates: tech/clippit is a paperclip character inspired by Microsoft's Clippit; tech/mona is explicitly GitHub Octocat; lovecraft/cthulhu has ID cthulittle and resembles a tentacled winged creature. These are nonanime in appearance, but less clean provenance choices than the originals. If needed, they use the same dimensions and required-row frame counts. star-trek/armus is a tar humanoid with head, shoulders and arms, so exclude under the user's human prohibition. Its idle row has only six unique frames among seven populated cells.

Exclude all remaining directories: arrested-development, blade-runner, firefly, lord-of-the-rings, seinfeld, stargate, the-matrix, and other star-trek characters. They depict humans or close humanoids. Do not infer suitability from a nonhuman fictional species label.

Inspection artifacts audit-contact.png and audit-original-frames.png are temporary contact sheets only. No upstream installers or application code were executed, no dependencies were installed, and no workspace assets were modified.

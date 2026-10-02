# Codex Pet Collection 🐾

[English](README.md) · [简体中文](README.zh-CN.md)

![Lunari, Kiro, and Jadebyte — Codex Pet Collection](assets/social-preview.png)

> Open-source animated companions for Codex — expressive, installable, and ready to make serious work feel more alive.

Each companion ships as a validated Codex Pet v2 package with nine task and movement states, sixteen clockwise look directions, and one-command installers.

[![Codex Pet v2](https://img.shields.io/badge/Codex%20Pet-v2-10a37f?style=for-the-badge)](pets/catalog.json)
[![3 companions](https://img.shields.io/badge/companions-3-183153?style=for-the-badge)](pets/catalog.json)
[![CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-f5c542?style=for-the-badge)](LICENSE)

## Meet the companions

| Pet | Personality | Preview |
|---|---|---|
| **Jadebyte · 翠墨 🐼🐉** | A calm ink-and-jade panda-dragon scholar | [Full atlas](assets/jadebyte-preview.png) |
| **Lunari · 月璃 🐈🌙** | A gentle moon-marked midnight calico | [Full atlas](assets/lunari-preview.png) |
| **Kiro · 启洛 🦝🤖** | A cyan-eyed robotic red-panda scout | [Full atlas](assets/kiro-preview.png) |

<details>
<summary><strong>Jadebyte · 翠墨</strong></summary>

![Jadebyte animation atlas preview](assets/jadebyte-preview.png)

Jadebyte blends the gentle focus of an ink-and-jade scholar with the playful energy of a tiny panda-dragon. Formerly published as **Mobao / 墨宝**.

</details>

<details>
<summary><strong>Lunari · 月璃</strong></summary>

![Lunari animation atlas preview](assets/lunari-preview.png)

Lunari is a warm, hand-drawn midnight calico with amber eyes, caramel patches, and a soft golden crescent. Formerly known locally as **Xiaomo / 小墨**.

</details>

<details>
<summary><strong>Kiro · 启洛</strong></summary>

![Kiro animation atlas preview](assets/kiro-preview.png)

Kiro is a precise but friendly robotic red-panda scout with warm orange markings, a graphite-and-ivory shell, and cyan sensors. Formerly known locally as **Xiaozhun / 小准**.

</details>

## What every pet includes

- 9 expressive task and movement states
- 16 clockwise look directions
- 8×11 RGBA animation atlas at 1536×2288
- native 192×208 sprite cells
- deterministic validation with zero atlas errors and warnings
- a machine-readable catalog entry and labeled preview

## Install

Clone the collection once, then choose any pet ID: `jadebyte`, `lunari`, or `kiro`.

### Windows (PowerShell)

```powershell
git clone https://github.com/shuoyang129/codex-pet-collection.git
cd codex-pet-collection
powershell -ExecutionPolicy Bypass -File .\install.ps1 -PetId lunari
```

### macOS / Linux

```bash
git clone https://github.com/shuoyang129/codex-pet-collection.git
cd codex-pet-collection
chmod +x install.sh
./install.sh kiro
```

Restart Codex after installation, then select the new companion from pet settings.

## Manual installation

Copy a pet's `pet.json` and `spritesheet.webp` together into `~/.codex/pets/<pet-id>/`:

```text
~/.codex/pets/lunari/
├── pet.json
└── spritesheet.webp
```

## Repository layout

```text
assets/
├── jadebyte-preview.png
├── kiro-preview.png
├── lunari-preview.png
└── social-preview.png
pets/
├── catalog.json
├── jadebyte/
├── kiro/
└── lunari/
```

Each pet directory contains its metadata, production-ready atlas, and portable `validation.json` report.

## Add another companion

Place each new companion in `pets/<pet-id>/`, add a labeled preview under `assets/`, and register it in `pets/catalog.json`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete release checklist.

## License

The artwork and repository materials are shared under the [Creative Commons Attribution 4.0 International License](LICENSE). You may use and adapt them with attribution.

---

<p align="center"><em>Three small companions. Infinite serious curiosity.</em></p>

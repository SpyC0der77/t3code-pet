# T3 Pet

A desktop pet that follows your [T3 Code](https://github.com/pingdotgg/t3code) agents. It types while they work, asks for attention when they're waiting on you, and celebrates when a turn finishes.

| Working | Needs attention | Finished |
| :---: | :---: | :---: |
| ![Pet typing at a laptop](docs/images/pet-working.png) | ![Pet waiting for your attention](docs/images/pet-waiting.png) | ![Pet celebrating a finished turn](docs/images/pet-done.png) |

## What it does

- Shows when agents are working, need approval or input, finish, or hit an error.
- Lets you hover over the pet to see unsettled chats and open one in your browser.
- Follows all local chats or a single chat you choose.
- Lets you ignore projects so their chats and alerts stay out of the way.
- Offers optional desktop notifications with sound, including a guided switch from T3 Code's alerts.
- Moves wherever you drag it, lets clicks through its transparent surroundings, and hides during fullscreen use on supported desktops.

Choose a size, switch to still poses, or have your pet start when you sign in. Right-click the pet or use its tray icon to change settings, preview animations, hide it, or quit.

## Get T3 Pet

T3 Pet is in early development. There are no packaged downloads on [GitHub Releases](https://github.com/SpyC0der77/t3code-pet/releases) yet. To try the current version, [build it from source](docs/development.md#build-from-source).

These are the package formats and installation steps for each platform:

| Platform | Package | Installation |
| --- | --- | --- |
| Windows | `.exe` installer | Run the installer, then open T3 Pet from Start or its desktop shortcut. |
| macOS | `.dmg` for Apple Silicon or Intel | Open the matching DMG and drag T3 Pet into Applications. |
| Linux | `.AppImage` or `.deb` | Make the AppImage executable and launch it, or install the Debian package. |

Windows has been tested locally. macOS and Linux support is implemented, with platform verification still pending. Builds are unsigned.

Linux uses X11 or XWayland. Native Wayland fullscreen windows aren't detected, and T3 Pet cannot automatically close native Wayland T3 Code windows. GNOME may need an AppIndicator extension to show the tray icon. Keep an AppImage in a permanent location before enabling login startup.

## First launch

1. Open T3 Code, then launch T3 Pet.
2. Follow setup to connect to your local data folder. The default folder is `~/.t3/userdata`; choose another folder if your installation uses one.
3. Choose where desktop notifications should come from, or keep your current setup.
4. Drag your pet into place. Hover over it to see chats, or right-click to open its controls.

You can skip setup and return to it through **Set up notifications** in the tray menu or settings.

### Switching notifications

If T3 Code's desktop alerts are on, setup offers **Switch to T3 Pet**. T3 Pet asks permission to close all T3 Code windows, closes them normally, and then turns off T3 Code's desktop alerts and enables its own. Save your work before approving the switch, and reopen T3 Code afterward.

Cancelling or failing to close T3 Code leaves notification settings unchanged. Your sound preference carries over, and T3 Code's in-app and mobile notices stay as they are.

Pet notifications start off. Enable them during setup and use **Send a test** in notification settings to check that your system allows them. Alerts pause during fullscreen use where detection is supported. Click an alert to open its chat.

## Make it yours

Open **Settings** from the pet's right-click menu or tray icon:

- **Chats** shows the local connection and lets you change the data folder.
- **Filters** has searchable project and chat lists. Each can be a blocklist or whitelist. Expand **Advanced chat filters** beneath the projects to choose chats.
- **Pet** shows a responsive grid of character previews. Choose the preview state, select a character, then save to apply it to the desktop. Size, still poses, and login startup are also available here.
- **Notifications** controls desktop alerts and sound, with setup and test buttons.

A blocklist excludes checked items. A whitelist follows only checked items. Chats must pass both filters.

Click **Save changes** to apply your changes. The grid's preview state stays selected while you browse and does not change the desktop pet's live activity.

## Your data

Status checks stay on your machine. T3 Pet reads local chat and agent status from T3 Code's database in read-only mode. It never reads message contents or provider credentials, and it never calls a model.

The optional notification switch edits only T3 Code's desktop alert preference, backs up the original settings, and restores them if saving Pet's settings fails. Pet preferences are stored separately from T3 Code.

This is an independent companion that uses T3 Code's local data format. Remote T3 Code environments aren't supported, and changes to that format may require a Pet update.

## Need help?

| Problem | What to try |
| --- | --- |
| The pet is offline | Open T3 Code and check the data folder in Settings. It should contain `state.sqlite`. |
| A chat is missing | Check both lists under Filters, including Advanced chat filters. Empty whitelists exclude all chats. Settled chats disappear from the hover list. |
| Opening a chat asks for pairing | Complete pairing in your browser, then click the chat again. Chats open in T3 Code's local browser interface. |
| Notifications don't appear | Enable desktop notifications in Pet settings, send a test, and check your system's notification settings. Leave fullscreen before testing. |
| Both apps send alerts | Run notification setup and choose **Switch to T3 Pet**. |
| Switching notifications fails | Finish any quit confirmation in T3 Code, then retry. On native Wayland, quit T3 Code yourself first. |

[Report a bug or request a feature](https://github.com/SpyC0der77/t3code-pet/issues). Include your operating system, T3 Pet and T3 Code versions, and steps to reproduce the problem. Leave private chat contents and credentials out of the report.

## Development

See the [development guide](docs/development.md) for building, packaging, tests, and details about the local integration.

## Credits

The default character, Lil' Finder Guy, uses artwork from [LFG Pet by SpyC0der77](https://github.com/SpyC0der77/lfg-codex-pet), with provenance in the [LFG asset source notes](assets/lfg/SOURCE.md). Its internal ID remains `lfg`. The artwork is bundled locally. T3 Pet's paw icon is separate from the character artwork. The settings font is DM Sans, distributed under the SIL Open Font License.

Jadebyte and Lunari come from [shuoyang129's Codex Pet Collection](https://github.com/shuoyang129/codex-pet-collection), which declares CC BY 4.0 for artwork. Kerno comes from [lencx/pet](https://github.com/lencx/pet), which provides an MIT license. Only nonhuman characters are bundled. Sheets are unchanged, with playback adapted for T3 Pet. Source commits, hashes, attribution, original license notices, and the Codex Pet Collection license wording caveat are recorded in [imported artwork source notes](assets/pets/SOURCE.md).

Aion, Floppy, and Oscillo come from [jcleigh/pets](https://github.com/jcleigh/pets). Caspian, Cinder, Hoggie, and Cat Stack come from [Dinohouse Digital's Codex Pet](https://github.com/Dinohouse-Digital-LLC/vscode-codex-pet). Both repositories provide MIT licenses. The selected characters are nonhuman and do not use anime styling. Full licenses, audit reports, source commits, hashes, and playback changes are retained in the imported artwork source notes.

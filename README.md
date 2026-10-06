# T3 Pet

A desktop pet that follows your [T3 Code](https://github.com/pingdotgg/t3code) agents. It types while they work, asks for attention when they're waiting on you, and celebrates when a turn finishes.

| Working | Needs attention | Finished |
| :---: | :---: | :---: |
| ![Pet typing at a laptop](docs/images/pet-working.png) | ![Pet waiting for your attention](docs/images/pet-waiting.png) | ![Pet celebrating a finished turn](docs/images/pet-done.png) |

## What it does

- Shows when agents are working, need approval or input, finish, or hit an error.
- Lets you hover over the pet to see all unsettled chats and open one in your browser, even when no agent is running. Settled and snoozed chats stay excluded.
- Follows all local chats or a single chat you choose.
- Lets you ignore projects so their chats and alerts stay out of the way.
- Offers optional custom or OS notifications with sound, including a guided switch from T3 Code's alerts.
- Follows T3 Code's saved theme by default, including custom palettes and light/dark mixes. Settings and onboarding also offer independent themes with light, dark, or system appearance.
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
   If you choose T3 Pet, select OS notifications or custom alerts beside the pet. Keeping your current setup leaves the style unchanged.
4. Drag your pet into place. Hover over it to see chats, or right-click to open its controls.

Setup starts with Connect, then Pet, Notifications, and Finish. Appearance and login startup are optional controls on the Pet step. Finish with **Done** to return to your pet, or choose **Open settings**.

You can skip setup and run it again from General settings. **Notifications…** in the pet or tray menu opens notification settings directly; **Configure notification source…** stays available after setup.

### Switching notifications

If T3 Code's desktop alerts are on, setup offers **Switch to T3 Pet**. T3 Pet asks permission to close all T3 Code windows, closes them normally, and then turns off T3 Code's desktop alerts and enables its own. Save your work before approving the switch, and reopen T3 Code afterward.

Cancelling or failing to close T3 Code leaves notification settings unchanged. Your sound preference carries over, and T3 Code's in-app and mobile notices stay as they are.

Pet notifications start off. Enable them during setup and use **Preview notification** in notification settings to confirm alerts appear. For System notifications, allow T3 Pet in your system notification settings. Alerts pause during fullscreen use where detection is supported. Click an alert to open its chat.

## Make it yours

Open **Settings** from the pet's right-click menu or tray icon:

Both open a compact custom menu that uses the pet's theme and T3 Code's font. Use arrow keys or type a label to navigate; Escape closes the preview submenu, then the menu. Enter, Space, Shift+F10, or the Context Menu key also opens it from the focused pet.

- **General** opens first, with Appearance and Color theme selectors plus login startup. **Follow T3 Code** is on by default; turn it off to choose independent appearance settings. **Run setup again…** is available here. Connection status and expandable **Connection settings** provide data folder selection, a connection check, and diagnostics.
- **Filters** has searchable project and chat lists. Choose **Follow everything except selected** or **Follow only selected** for each list. The result shows how many loaded chats will be followed after saving. Expand **Advanced chat filters** beneath the projects to choose chats.
- **Pet** shows a responsive grid of character previews. Choose the preview state, select a character, then save to apply it to the desktop. Size and still poses are also available here.
- **Notifications** controls desktop alerts, Beside the pet or System notifications, and sound. Configure the notification source at any time. Preview notification uses the selected style before saving and the saved sound preference. Alerts beside the pet use its theme and do not follow system Do Not Disturb.

Hovering over the pet groups subagents under their parent chats, including nested subagents. Child rows name their parent. Each group takes its position from its most urgent chat. Subagents follow their parent's settlement and snooze state.

Follow everything except selected excludes checked items. Follow only selected follows checked items. Chats must pass both filters.

Click **Save changes** to apply your changes. Edited tabs show an asterisk. Closing settings or running setup again with unsaved edits offers Save, Discard, and Cancel; a failed save keeps the draft open. The grid's preview state stays selected while you browse and does not change the desktop pet's live activity.

Custom notifications form a compact pile beside the pet, with the newest alert in front. Hover or keyboard focus expands the pile into readable rows and pauses timed alerts. Moving between rows keeps it open. Alerts slide in, slide out, and move smoothly as the stack changes. Updates for the same chat keep the existing card. Completion alerts last five seconds. Approval and input alerts remain until handled or dismissed; error alerts and test previews last ten seconds. The pile remains limited to the three newest alerts.

Use Open chat to navigate, or swipe the notification body away from the pet to dismiss it. A 40-pixel swipe or a quick outward flick dismisses on release. Short or cancelled gestures animate back; swipes toward the pet resist dismissal. The close button and Escape also dismiss alerts. Placement stays fixed while the stack is open and adjusts to the monitor's available space. Transparent space around the pile passes clicks through to the desktop. Reduced motion removes the visual transitions.

Both styles use T3 Code's input and completion sounds when sound is enabled. Custom alerts do not enter the OS notification center or inherit its Do Not Disturb setting. Both styles pause during detected fullscreen use.

Notification settings let you choose approval/input requests, completed turns, and errors independently. Pause alerts for 30 minutes, one hour, or until the next local midnight. Pause and Resume now apply immediately, while event toggles apply on Save changes. The pet keeps following activity, and the pause survives restarting T3 Pet. On resuming, requests that still need you can alert again; completions and errors during the pause are not replayed. The pet and tray menus also offer a quick 30-minute pause or Resume notifications.

Requests that still need action stay ahead of completion, error, and preview alerts in the custom pile. Timed alerts cannot displace them. The pile still shows at most three alerts; when more than three requests arrive, it keeps the newest three. The hover list shows the other followed, unsettled chats.

Use **Copy diagnostics** under **Connection settings** in General to copy T3 Pet and runtime versions, platform details, connection state, detected database schema, notification choices, and fullscreen detector state. The report excludes chat titles, IDs, messages, credentials, folder paths, and raw error text.

## Your data

Status checks stay on your machine. T3 Pet reads local chat and agent status from T3 Code's database in read-only mode. It never reads message contents or provider credentials, and it never calls a model.

The optional notification switch edits only T3 Code's desktop alert preference, backs up the original settings, and restores them if saving Pet's settings fails. Pet preferences are stored separately from T3 Code.

This is an independent companion that uses T3 Code's local data format. Remote T3 Code environments aren't supported, and changes to that format may require a Pet update.

## Need help?

| Problem | What to try |
| --- | --- |
| The pet is offline | Open T3 Code and check the data folder in Settings. It should contain `statev2.sqlite` or `state.sqlite`. |
| A chat is missing | Check both lists under Filters, including Advanced chat filters. Empty whitelists exclude all chats. Settled chats disappear from the hover list. |
| Opening a chat asks for pairing | Complete pairing in your browser, then click the chat again. Chats open in T3 Code's local browser interface. |
| Notifications don't appear | Enable desktop notifications in Pet settings, use Preview notification, and check your system's notification settings. Leave fullscreen before testing. |
| Both apps send alerts | Run notification setup and choose **Switch to T3 Pet**. |
| Switching notifications fails | Finish any quit confirmation in T3 Code, then retry. On native Wayland, quit T3 Code yourself first. |

[Report a bug or request a feature](https://github.com/SpyC0der77/t3code-pet/issues). Include your operating system, T3 Pet and T3 Code versions, and steps to reproduce the problem. Leave private chat contents and credentials out of the report.

## Development

See the [development guide](docs/development.md) for building, packaging, tests, and details about the local integration.

## Credits

The default character, Lil' Finder Guy, uses artwork from [LFG Pet by SpyC0der77](https://github.com/SpyC0der77/lfg-codex-pet), with provenance in the [LFG asset source notes](assets/lfg/SOURCE.md). Its internal ID remains `lfg`. Biscuit is a golden-brown dog, Miso is an orange tabby cat, and Clover is a cream bunny, generated with OpenAI imagegen for T3 Pet. Their [dog source notes](assets/biscuit/SOURCE.md), [cat source notes](assets/miso/SOURCE.md), and [bunny source notes](assets/clover/SOURCE.md) record the artwork and animation timing. All four characters are bundled locally. T3 Pet's paw icon is separate from the character artwork. The settings font is DM Sans, distributed under the SIL Open Font License.

# Notification comparison

Compared against pingdotgg/t3code main at `00eb8f618`, pulled on October 3, 2026. Upstream has no `master` branch.

Sources:

- `apps/web/src/components/ui/toast.tsx` defines the compact inline action, corner dismiss control, and separate title/icon row above the description.
- `apps/web/src/components/ThreadNotificationCoordinator.tsx` assigns different icons to approval, input, completion, and failure. It tracks attention by run and status, establishes a baseline for newly discovered threads, and avoids repeating alerts when pending counts increase.
- `apps/web/src/threadNotifications.ts` plays separate input and completion clips and makes native notifications silent to avoid a second system sound.

Pet follows those layout, icon, attention, and sound choices. Its interaction model now also follows the toast stack in `toast.tsx`: a compact pile with 12px peeks, expansion on hover/focus, 12px expanded gaps, and 500ms motion with `cubic-bezier(.22,1,.36,1)`. Cards animate inside one transparent native window. An exiting card keeps its current position while live cards reflow. Short swipes return smoothly; swipes are constrained to directions away from the pet, with a quick-flick option. Updates for the same chat reuse their card.

Placement is chosen when the stack opens, stays stable during interaction, and adjusts when display changes would put it off screen. The stack grows upward or downward according to the pet's position. Adaptive insets keep the visible card beside the pet near monitor edges. Hovering gaps keeps the expanded stack open; unoccupied window space passes clicks through. Keyboard focus expands the stack, orders controls from newest to oldest, and pauses all timers. Reduced motion removes transitions. Long content scrolls within the card while its action stays accessible.

The opaque theme and three-alert limit remain. The display timer starts after the window loads and appears.

`assets/notification-input.mp3` and `assets/notification-completion.mp3` are copied from that upstream revision. They are covered by the T3 Tools MIT license included in `docs/T3-THEME-LICENSE.txt` and in packaged builds.

The companion still reads status metadata through its read-only connection. Notification comparison and playback require no message contents, credentials, or database writes.

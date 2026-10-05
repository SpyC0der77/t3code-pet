import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const packageDirectory = process.env.T3PET_PACKAGE_DIR || 'release';
const runtimeEnvironment = { ...process.env };
delete runtimeEnvironment.ELECTRON_RUN_AS_NODE;
const candidates = (process.platform === 'darwin'
  ? [`mac-${process.arch}/T3 Pet.app/Contents/MacOS/T3 Pet`, 'mac/T3 Pet.app/Contents/MacOS/T3 Pet']
  : process.platform === 'linux' ? [`linux-${process.arch}-unpacked/t3-pet`, 'linux-unpacked/t3-pet'] : ['win-unpacked/T3 Pet.exe'])
  .map(path => join(packageDirectory, path));
const executable = candidates.map(path => resolve(path)).find(path => existsSync(path));
assert.ok(executable, 'Package the app for this platform before running the packaged test.');
if (process.platform !== 'win32') {
  const resources = process.platform === 'darwin' ? resolve(dirname(executable), '../Resources') : join(dirname(executable), 'resources');
  const helper = join(resources, 'native', 't3-close');
  for (const refuse of [false, true]) {
    const folder = mkdtempSync(join(tmpdir(), 't3pet-packaged-close-'));
    const fixture = spawn(executable, ['--close-fixture', folder, ...(refuse ? ['--refuse-close'] : [])], { stdio: 'inherit', env: runtimeEnvironment });
    const exited = new Promise((resolveExit, reject) => { fixture.once('exit', resolveExit); fixture.once('error', reject); });
    try {
      const deadline = Date.now() + 10000;
      while (!existsSync(join(folder, 'ready.json')) && Date.now() < deadline && fixture.exitCode === null) await new Promise(r => setTimeout(r, 100));
      assert.ok(existsSync(join(folder, 'ready.json')), 'Packaged close fixture did not open.');
      await new Promise(r => setTimeout(r, 500));
      const close = promisify(execFile)(helper, ['--fixture', String(fixture.pid)], { timeout: 15000 });
      if (refuse) {
        await assert.rejects(close, /still open/);
        assert.equal(fixture.exitCode, null, 'Packaged helper force-killed a refused quit.');
      } else {
        assert.match((await close).stdout, /closed/);
        assert.equal(await exited, 0);
      }
    } finally {
      if (fixture.exitCode === null) fixture.kill('SIGKILL');
      await exited;
      // macOS helpers can still finish cache writes after the main fixture exits.
      // Retry transient ENOTEMPTY/EBUSY errors while the process tree settles.
      await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}
const directory = resolve('release', `smoke-${process.platform}-${Date.now()}`);
const scale = process.env.T3PET_SMOKE_SCALE;
assert.ok(!scale || ['1', '1.25', '1.5', '2', '3'].includes(scale), 'Invalid smoke display scale.');
const testNotification = process.env.T3PET_SMOKE_NOTIFICATION === '1';
const testHover = process.env.T3PET_SMOKE_HOVER === '1';
const testToast = process.env.T3PET_SMOKE_TOAST === '1';
assert.ok([testNotification, testHover, testToast].filter(Boolean).length <= 1, 'Run notification, hover, and toast smoke modes separately.');
const child = spawn(executable, ['--smoke-test', directory, ...(testHover ? ['--hover-smoke-test'] : []), ...(testToast ? ['--toast-smoke-test'] : []), ...(testNotification ? ['--notification-smoke-test'] : []), ...(scale ? [`--force-device-scale-factor=${scale}`] : [])], { stdio: 'inherit', windowsHide: true, env: runtimeEnvironment });
const timeout = setTimeout(() => child.kill(), 75_000);
try {
  const exit = await new Promise((resolveExit, reject) => { child.once('exit', resolveExit); child.once('error', reject); });
  assert.equal(exit, 0, 'Packaged app smoke test failed.');
} finally { clearTimeout(timeout); }
const report = JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8'));
assert.ok(report.windowIcon.loaded && report.windowIcon.transparent && report.windowIcon.visible, 'Packaged taskbar icon failed to load with transparency.');
if (process.platform === 'win32') assert.equal(report.windowIcon.path, join(dirname(executable), 'resources', 'icon.ico'), 'Windows taskbar icon must use the persistent shell resource.');
assert.notEqual(report.hoverOpened, false, 'The first hover did not show the native chat-list window.');
if (!testHover) assert.notEqual(report.hoverAfterMenu, false, 'Hover did not reopen after context-menu dismissal.');
assert.ok(Object.values(report.hoverHierarchy).every(Boolean), 'Subagent hover ordering, labels, or layout failed.');
if (!testHover) {
  for (const key of ['settingsFirstClick', 'settingsHiddenFirstClick', 'settingsMinimizedFirstClick', 'notificationsFirstClick']) {
    assert.equal(report.contextMenu[key], true, `Menu ${key} did not show and focus settings after one action.`);
  }
  assert.ok(Object.values(report.contextMenu).every(Boolean), 'Custom context menu layout, navigation, or actions failed.');
  assert.ok(report.customNotifications.entryHeight, 'Notification entrance did not descend 32px from above its anchor.');
  assert.ok(report.customNotifications.audio, 'Packaged notification audio could not load or play.');
  for (const key of ['touchContent', 'touchScroll', 'stableAnnouncements', 'emptyStackResumes', 'emptyStackExpires', 'disabledAlertsSilent', 'testSound', 'mutedTestSilent']) assert.equal(report.customNotifications[key], true, `Notification ${key} failed.`);
  for (const key of ['animatedDismiss', 'singleWindow', 'collapsed', 'expanded', 'stackPaused', 'reused', 'parallelExit', 'removed', 'collapses', 'keyboardExpands', 'dragHeld', 'returnAnimated', 'returned', 'inwardResisted', 'axisLocked', 'cancelled', 'swipeMoved', 'waitsForRelease', 'swipeDismissed', 'nativeStable', 'bounded', 'clickThrough', 'reducedMotion', 'cleared']) assert.ok(report.customNotifications[key], `Notification ${key} failed.`);
}
if (testToast) {
  const checks = report.customNotifications;
  for (const theme of ['light', 'dark']) {
    assert.ok(checks[theme].transparent && checks[theme].draggable && !checks[theme].overflow && checks[theme].actionFits, 'Notification transparency or drag affordance failed.');
    assert.ok(checks[theme + 'Layout'], 'Notification inline layout, corner close button, or content height failed.');
    assert.ok(checks[theme + 'Bounds'] && checks[theme + 'Paused'] && checks[theme + 'Dismissed'], 'Notification positioning or actions failed.');
  }
  console.log(`Packaged ${process.platform} notification smoke test passed. Report: ${directory}`);
  process.exit(0);
}
if (testHover) {
  assert.ok(report.hoverEmpty && report.hoverIdle && report.hoverDisconnected && report.chatNavigation.rejectedUnknown, 'Idle, empty, or disconnected hover content failed.');
  assert.equal(report.hover.rows, 2);
  assert.ok(!report.hover.overflow && report.hover.height >= report.hover.listHeight);
  console.log(`Packaged ${process.platform} hover smoke test passed. Report: ${directory}`);
  process.exit(0);
}
assert.ok(Object.values(report.notificationChoice).every(Boolean), 'Notification choice did not save or discard correctly.');
assert.ok(Object.values(report.themePreferences).every(Boolean), 'Independent theme save, discard, live updates, or follow behavior failed.');
assert.equal(report.onboardingInitialization, true, 'Onboarding submitted unhydrated preferences.');
assert.equal(report.onboardingInitializationRetry, true, 'Onboarding did not recover from a failed state load.');
assert.ok(Object.values(report.settingsDropdowns).every(Boolean), 'Custom settings dropdown accessibility, keyboard, bounds, or draft behavior failed.');
assert.ok(Object.values(report.notificationTestPending).every(Boolean), 'A settings update re-enabled a pending test notification.');
assert.ok(Object.values(report.onboardingDropdowns).every(Boolean), 'Custom onboarding dropdown selection or bounds failed.');
assert.ok(Object.values(report.onboardingNotificationStyle).every(Boolean), 'Conditional onboarding style choice, keep behavior, or persistence failed.');
for (const theme of ['light', 'dark']) {
  const toast = report.customNotifications[theme];
  assert.ok(toast.bridge && !toast.overflow && toast.actionFits && toast.theme === theme, 'Custom notification layout or theme failed.');
  assert.ok(report.customNotifications[theme + 'Bounds'] && report.customNotifications[theme + 'Paused'] && report.customNotifications[theme + 'Dismissed'], 'Custom notification positioning, pause, or action failed.');
}
assert.ok(report.customNotifications.bounded && report.customNotifications.cleared, 'Custom notification windows leaked or exceeded the burst limit.');
assert.ok(Object.values(report.v2State).every(Boolean), 'V2 SQLite status detection failed in packaged Electron.');
assert.ok(report.visibility.monitorReady && !report.visibility.monitorFailed, 'Native fullscreen monitor did not run.');
assert.ok(report.controls.saveRoundTrip && report.controls.invalidRejected);
assert.ok(report.themeSync.liveWatcher && report.themeSync.petUnchanged, 'Theme updates required a restart or changed the pet state.');
assert.equal(report.themeSync.settings.id, 'iris');
assert.equal(report.themeSync.settings.appearance, 'dark');
assert.ok(report.themeSync.draftRetained, 'A theme update discarded unsaved settings.');
assert.equal(report.themeSync.hover.canvas, report.themeSync.settings.canvas);
assert.equal(report.themeSync.hover.appearance, 'dark');
assert.ok(report.hoverTransparency, 'The hover root background covered its transparent corners.');
assert.ok(report.largeFontSettings.lineHeights && report.largeFontSettings.tabsFit && report.largeFontSettings.tabsReflow && !report.largeFontSettings.overflow, 'Large interface text overlaps or overflows the compact settings window.');
assert.ok(report.largeFontOnboarding.heading && report.largeFontOnboarding.error, 'Large onboarding headings or multi-line errors overlap.');
if (testNotification) assert.equal(report.nativeNotification.result, 'shown', 'The packaged native notification failed to show.');
assert.equal(report.petCatalog.characters, 4, 'Not every bundled character passed the settings save/preview check.');
// All six moods: LFG's original 261 frames plus three eight-frame pets, 48 cases each.
assert.ok(report.petCatalog.frames === 405 && report.petCatalog.draftRetained && report.petCatalog.discarded && report.petChoicePersisted, 'Pet frame decoding, selection persistence, or draft handling failed.');
assert.ok(report.petCatalog.previewIsLocal && report.petCatalog.radioCount === 4, 'Gallery previews changed live status or omitted choices.');
assert.ok(report.projectBlocklist.saved && report.projectBlocklist.blocked && report.projectBlocklistPersisted, 'Blocklist did not persist through the settings form.');
assert.equal(report.projectBlocklist.mood, 'working');
assert.equal(report.projectBlocklist.waitingCount, 0);
assert.equal(report.projectBlocklist.workingCount, 1);
assert.ok(report.projectBlocklist.footerFits);
assert.ok(Object.values(report.settingsDraft).every(Boolean), 'Search, draft retention, or discard failed.');
assert.ok(Object.values(report.settingsUx).every(Boolean), 'Settings exit guard, failed-save recovery, or save-on-close failed.');
assert.ok(Object.values(report.chatActivity).every(Boolean), 'Chat activity did not load or search correctly.');
assert.ok(Object.values(report.selectionFilters).every(Boolean), 'Project/chat filter modes, search, intersection, or discard failed.');
assert.ok(!report.advancedCompact.overflow && report.advancedCompact.footerFits && report.advancedCompact.chatControlsVisible, 'Advanced filters are inaccessible in the compact window.');
assert.ok(!report.settingsCompact.overflow && report.settingsCompact.footerFits, 'Compact settings layout overflowed.');
assert.ok(report.ui.hasBridge && !report.ui.overflow);
assert.ok(report.animation.opaquePixels > 0);
assert.ok(report.hoverEmpty && report.hoverIdle && report.hoverDisconnected && report.chatNavigation.rejectedUnknown, 'Idle, empty, or disconnected hover content failed.');
assert.ok(report.onboardingConnectionFirst && Object.values(report.onboardingCustomization).every(Boolean), 'Connection-first onboarding or optional customization failed.');
assert.ok(report.onboardingConnect.bridge && !report.onboardingConnect.overflow);
assert.ok(Object.values(report.notificationModal).every(Boolean), 'Settings notification modal, cancellation, compact layout, or apply failed.');
assert.ok(Object.values(report.onboardingPet).every(Boolean), 'Onboarding pet selection, navigation, persistence, or finish preview failed.');
assert.ok(report.onboardingNotifications.visible && !report.onboardingNotifications.overflow);
assert.ok(report.onboardingCancellation.cancelled && report.onboardingCancellation.unchanged && report.onboardingCancelFileUnchanged);
assert.equal(report.fixtureMigration, 'complete');
assert.equal(report.fixtureMigratedSettings.notificationMode, 'off');
assert.ok(report.onboardingFinish.visible && report.onboardingFinish.done && report.onboardingFinish.doneClosesSetup && report.onboardingFinish.secondarySettings && !report.onboardingFinish.overflow);
assert.ok(report.onboardingProgressInitial && report.onboardingProgressFinished, 'Setup navigation allowed skipping a required stage or repeating completed migration.');
assert.ok(Object.values(report.onboardingProgressBack).every(Boolean), 'Completed-step navigation lost the folder or current-step state.');
assert.ok(report.onboardingActionIcon, 'Changing notification action removed its label or arrow.');
for (const stage of ['connect', 'connection-folder', 'pet', 'notifications', 'finish']) {
  const layout = report['onboardingCompact' + stage];
  assert.ok(!layout.overflow && layout.footerFits && layout.progressCount === 4 && layout.currentCount === 1, `Compact ${stage} onboarding overflowed or lost its progress/action controls.`);
}
console.log(`Packaged ${process.platform} smoke test passed. Report: ${directory}`);

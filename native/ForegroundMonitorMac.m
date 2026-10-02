#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include <signal.h>

static char sample(pid_t pet, CGWindowID *identity) {
  NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
  *identity = 0;
  if (!front) return '?';
  if (front.processIdentifier == pet) return 'S';
  // Window bounds and owner PIDs do not require Screen Recording permission.
  // Do not access window titles or pixel contents.
  NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
  for (NSDictionary *window in windows) {
    if ([window[(__bridge NSString *)kCGWindowOwnerPID] intValue] != front.processIdentifier ||
        [window[(__bridge NSString *)kCGWindowLayer] intValue] != 0) continue;
    CGRect bounds;
    if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(__bridge NSString *)kCGWindowBounds], &bounds)) continue;
    *identity = [window[(__bridge NSString *)kCGWindowNumber] unsignedIntValue];
    for (NSScreen *screen in NSScreen.screens) {
      CGDirectDisplayID display = [screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue];
      CGRect monitor = CGDisplayBounds(display);
      if (bounds.origin.x <= monitor.origin.x + 1 && bounds.origin.y <= monitor.origin.y + 1 &&
          CGRectGetMaxX(bounds) >= CGRectGetMaxX(monitor) - 1 && CGRectGetMaxY(bounds) >= CGRectGetMaxY(monitor) - 1) return '1';
    }
    return '0';
  }
  return '0'; // An application with no visible window, such as Finder desktop.
}

int main(int argc, const char **argv) {
  if (argc != 3) return 1;
  pid_t pet = atoi(argv[1]);
  if (pet <= 0) return 1;
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
    while (kill(pet, 0) == 0) {
      @autoreleasepool {
        CGWindowID window; char kind = sample(pet, &window);
        printf("%c:%u\n", kind, window); fflush(stdout);
        [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate date]];
        [NSThread sleepForTimeInterval:0.1];
      }
    }
  }
  return 0;
}

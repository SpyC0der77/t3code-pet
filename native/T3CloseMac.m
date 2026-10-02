#import <AppKit/AppKit.h>

static BOOL isT3(NSRunningApplication *application) {
  NSString *name = application.executableURL.lastPathComponent;
  if (!name) return NO;
  return [@[@"T3 Code", @"T3 Code (Nightly)", @"t3code", @"t3code-nightly"] containsObject:name];
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    pid_t fixture = argc == 3 && strcmp(argv[1], "--fixture") == 0 ? atoi(argv[2]) : 0;
    if (argc != 1 && fixture <= 0) return 1;
    NSMutableArray<NSRunningApplication *> *targets = [NSMutableArray array];
    for (NSRunningApplication *application in NSWorkspace.sharedWorkspace.runningApplications) {
      if (fixture ? application.processIdentifier == fixture : isT3(application)) {
        [targets addObject:application];
        // Standard application termination. Never forceTerminate or signal it.
        if (![application terminate]) {
          fprintf(stderr, "T3 Code refused to quit. Notifications have not changed.\n"); return 1;
        }
      }
    }
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
    while (deadline.timeIntervalSinceNow > 0) {
      BOOL running = NO;
      for (NSRunningApplication *application in targets) if (!application.terminated) running = YES;
      // Also catch a newly launched application during closure.
      if (!fixture) for (NSRunningApplication *application in NSWorkspace.sharedWorkspace.runningApplications) if (isT3(application)) running = YES;
      if (!running) { puts("closed"); return 0; }
      [NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate date]];
      [NSThread sleepForTimeInterval:0.1];
    }
    fprintf(stderr, "T3 Code is still open. Finish any quit confirmation, then retry. Notifications have not changed.\n");
    return 1;
  }
}

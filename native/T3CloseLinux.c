#include "X11Desktop.h"
#include <dirent.h>
#include <sys/stat.h>
#include <limits.h>
#include <strings.h>

static int is_t3(pid_t pid, pid_t fixture) {
  if (pid <= 0) return 0;
  if (fixture) return pid == fixture && alive(pid);
  char path[64], exe[PATH_MAX]; struct stat info;
  snprintf(path, sizeof(path), "/proc/%d", pid);
  if (stat(path, &info) != 0 || info.st_uid != getuid()) return 0;
  snprintf(path, sizeof(path), "/proc/%d/exe", pid);
  ssize_t size = readlink(path, exe, sizeof(exe) - 1);
  if (size <= 0) return 0;
  exe[size] = 0;
  char *deleted = strstr(exe, " (deleted)"); if (deleted) *deleted = 0;
  const char *name = strrchr(exe, '/'); name = name ? name + 1 : exe;
  return strcasecmp(name, "t3code") == 0 || strcasecmp(name, "t3code-nightly") == 0 ||
    strcasecmp(name, "T3 Code") == 0 || strcasecmp(name, "T3 Code (Nightly)") == 0;
}

static int still_running(pid_t fixture) {
  if (fixture) {
    // A fixture is a child of the test runner and can briefly remain a zombie.
    char path[64], status[512];
    snprintf(path, sizeof(path), "/proc/%d/stat", fixture);
    FILE *file = fopen(path, "r"); if (!file) return 0;
    if (!fgets(status, sizeof(status), file)) { fclose(file); return 0; }
    fclose(file);
    char *end = strrchr(status, ')');
    return end && end[2] != 'Z' && end[2] != 'X';
  }
  DIR *proc = opendir("/proc"); if (!proc) return 1;
  struct dirent *entry; int found = 0;
  while ((entry = readdir(proc))) {
    char *end; long pid = strtol(entry->d_name, &end, 10);
    if (*end == 0 && is_t3((pid_t)pid, 0)) { found = 1; break; }
  }
  closedir(proc); return found;
}

int main(int argc, char **argv) {
  pid_t fixture = argc == 3 && strcmp(argv[1], "--fixture") == 0 ? (pid_t)strtol(argv[2], NULL, 10) : 0;
  if (argc != 1 && fixture <= 0) return 1;
  Display *d = XOpenDisplay(NULL);
  if (!d) { fprintf(stderr, "Cannot connect to X11 to close T3 Code. Notifications have not changed.\n"); return 1; }
  XSetErrorHandler(ignore_x_error);
  unsigned long count;
  unsigned long *windows = property(d, DefaultRootWindow(d), "_NET_CLIENT_LIST", XA_WINDOW, &count);
  Atom protocols = XInternAtom(d, "WM_PROTOCOLS", False), close = XInternAtom(d, "WM_DELETE_WINDOW", False);
  for (unsigned long i = 0; i < count; i++) {
    Window w = windows[i];
    if (!is_t3((pid_t)cardinal(d, w, "_NET_WM_PID", XA_CARDINAL), fixture)) continue;
    Atom *supported = NULL; int n = 0;
    if (XGetWMProtocols(d, w, &supported, &n)) {
      for (int j = 0; j < n; j++) if (supported[j] == close) {
        XEvent event = {0}; event.xclient.type = ClientMessage; event.xclient.window = w;
        event.xclient.message_type = protocols; event.xclient.format = 32;
        event.xclient.data.l[0] = close; event.xclient.data.l[1] = CurrentTime;
        XSendEvent(d, w, False, NoEventMask, &event);
        break;
      }
      XFree(supported);
    }
  }
  if (windows) XFree(windows);
  XFlush(d);
  for (int i = 0; i < 100; i++) {
    if (!still_running(fixture)) { puts("closed"); XCloseDisplay(d); return 0; }
    usleep(100000);
  }
  fprintf(stderr, "T3 Code is still open. Finish any quit confirmation, then retry. Notifications have not changed.\n");
  XCloseDisplay(d); return 1;
}

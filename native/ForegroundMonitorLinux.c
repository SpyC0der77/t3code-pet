#include "X11Desktop.h"
#include <X11/extensions/Xrandr.h>
#include <X11/extensions/shape.h>

static char sample(Display *d, Window w, pid_t pet, Window petWindow) {
  if (!w) return '0'; // Desktop, including an empty XWayland root.
  if (w == petWindow || cardinal(d, w, "_NET_WM_PID", XA_CARDINAL) == (unsigned long)pet) return 'S';
  unsigned long count;
  unsigned long *state = property(d, w, "_NET_WM_STATE", XA_ATOM, &count);
  Atom fullscreen = XInternAtom(d, "_NET_WM_STATE_FULLSCREEN", False);
  int full = 0;
  for (unsigned long i = 0; i < count; i++) if (state[i] == fullscreen) full = 1;
  if (state) XFree(state);
  if (full) return '1';
  XWindowAttributes a;
  if (!XGetWindowAttributes(d, w, &a) || a.map_state != IsViewable) return '?';
  int x, y; Window ignored;
  if (!XTranslateCoordinates(d, w, DefaultRootWindow(d), 0, 0, &x, &y, &ignored)) return '?';
  int n;
  XRRMonitorInfo *monitors = XRRGetMonitors(d, DefaultRootWindow(d), True, &n);
  for (int i = 0; monitors && i < n; i++) {
    XRRMonitorInfo m = monitors[i];
    if (x <= m.x + 1 && y <= m.y + 1 && x + a.width >= m.x + m.width - 1 && y + a.height >= m.y + m.height - 1) full = 1;
  }
  if (monitors) XRRFreeMonitors(monitors);
  return full ? '1' : '0';
}

int main(int argc, char **argv) {
  Display *d = XOpenDisplay(NULL);
  if (!d) { fprintf(stderr, "Cannot connect to X11.\n"); return 1; }
  XSetErrorHandler(ignore_x_error);
  if (argc == 3 && strcmp(argv[1], "--probe-input") == 0) {
    int count = 0, ordering; unsigned long area = 0;
    XRectangle *rectangles = XShapeGetRectangles(d, strtoul(argv[2], NULL, 10), ShapeInput, &count, &ordering);
    for (int i = 0; rectangles && i < count; i++) area += (unsigned long)rectangles[i].width * rectangles[i].height;
    if (rectangles) XFree(rectangles);
    printf("{\"inputArea\":%lu}\n", area); XCloseDisplay(d); return 0;
  }
  if (argc == 3 && strcmp(argv[1], "--probe-window") == 0) {
    Window w = strtoul(argv[2], NULL, 10);
    printf("{\"fullscreen\":%s,\"foreground\":%s}\n", sample(d, w, 0, 0) == '1' ? "true" : "false",
      cardinal(d, DefaultRootWindow(d), "_NET_ACTIVE_WINDOW", XA_WINDOW) == w ? "true" : "false");
    XCloseDisplay(d); return 0;
  }
  if (argc != 3) { XCloseDisplay(d); return 1; }
  pid_t pet = (pid_t)strtol(argv[1], NULL, 10);
  Window petWindow = strtoul(argv[2], NULL, 10);
  if (pet <= 0) { XCloseDisplay(d); return 1; }
  while (alive(pet)) {
    Window w = cardinal(d, DefaultRootWindow(d), "_NET_ACTIVE_WINDOW", XA_WINDOW);
    printf("%c:%lu\n", sample(d, w, pet, petWindow), w); fflush(stdout);
    usleep(100000);
  }
  XCloseDisplay(d); return 0;
}

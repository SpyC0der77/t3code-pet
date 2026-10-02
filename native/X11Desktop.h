#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>

static int ignore_x_error(Display *d, XErrorEvent *e) { (void)d; (void)e; return 0; }

static unsigned long *property(Display *d, Window w, const char *name, Atom type, unsigned long *count) {
  Atom actual; int format; unsigned long remaining; unsigned char *value = NULL;
  *count = 0;
  if (XGetWindowProperty(d, w, XInternAtom(d, name, False), 0, 65536, False,
      type, &actual, &format, count, &remaining, &value) != Success || actual != type || format != 32) {
    if (value) XFree(value);
    *count = 0; return NULL;
  }
  return (unsigned long *)value;
}

static unsigned long cardinal(Display *d, Window w, const char *name, Atom type) {
  unsigned long count, result = 0;
  unsigned long *values = property(d, w, name, type, &count);
  if (count) result = values[0];
  if (values) XFree(values);
  return result;
}

static int alive(pid_t pid) { return kill(pid, 0) == 0; }

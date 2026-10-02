using System;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Text;

class T3Close {
  delegate bool WindowCallback(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  static string[] Names = { "T3 Code", "T3 Code (Nightly)", "t3code", "t3code-nightly" };
  static int Main(string[] args) {
    // Smoke checks use a dedicated harmless window, never the real T3 app.
    if (args.Length == 1 && args[0] == "--fixture") Names = new[] { "T3PetCloseFixture" };
    try {
      foreach (string name in Names) foreach (Process process in Process.GetProcessesByName(name)) {
        using (process) {
          // Process.MainWindowHandle excludes hidden windows. Enumerate real
          // application windows so minimized/hidden T3 windows can close too.
          int target = process.Id;
          EnumWindows((window, parameter) => {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner != target) return true;
            StringBuilder kind = new StringBuilder(256);
            GetClassName(window, kind, kind.Capacity);
            string nameOfClass = kind.ToString();
            if (nameOfClass.StartsWith("Chrome_WidgetWin_") ||
                (Names[0] == "T3PetCloseFixture" && nameOfClass.StartsWith("WindowsForms10.Window."))) {
              PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero); // WM_CLOSE, never a forced termination.
            }
            return true;
          }, IntPtr.Zero);
        }
      }
      for (int attempt = 0; attempt < 100; attempt++) {
        bool running = false;
        foreach (string name in Names) foreach (Process process in Process.GetProcessesByName(name)) {
          using (process) { if (!process.HasExited) running = true; }
        }
        if (!running) { Console.WriteLine("closed"); return 0; }
        Thread.Sleep(100);
      }
      Console.Error.WriteLine("T3 Code is still open. Finish any quit confirmation in T3 Code, then retry. Notifications have not changed.");
      return 1;
    } catch { Console.Error.WriteLine("Could not close T3 Code. Notifications have not changed."); return 1; }
  }
}

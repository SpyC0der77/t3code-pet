using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Reports fullscreen state and surrounding brightness, never titles or images.
class ForegroundMonitor {
    static bool inspect;
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr dc, int x, int y);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr dc, int width, int height);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int x, int y, int width, int height, IntPtr source, int sx, int sy, uint operation);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect value, int size);
    [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] static extern int DwmGetWindowIntAttribute(IntPtr window, int attribute, out int value, int size);

    static bool Covers(Rect window, Rect monitor) {
        const int tolerance = 1;
        return window.Right > window.Left && window.Bottom > window.Top &&
            window.Left <= monitor.Left + tolerance && window.Top <= monitor.Top + tolerance &&
            window.Right >= monitor.Right - tolerance && window.Bottom >= monitor.Bottom - tolerance;
    }

    static bool? ForegroundFullscreen(uint ownProcess, IntPtr? chosen = null) {
        IntPtr window = chosen.HasValue ? chosen.Value : GetForegroundWindow();
        // Retain the last state through brief activation gaps to avoid a flash.
        if (window == IntPtr.Zero) return null;
        if (!IsWindowVisible(window) || IsIconic(window)) return null;
        uint process;
        GetWindowThreadProcessId(window, out process);
        var name = new StringBuilder(256);
        GetClassName(window, name, name.Capacity);
        string cls = name.ToString();
        if (inspect) Console.WriteLine("pid=" + process + " class=" + cls + " maximized=" + IsZoomed(window) + " style=" + GetWindowLong(window, -16).ToString("X"));
        if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return false;
        if (cls == "MultitaskingViewFrame" || cls == "TaskSwitcherWnd" || cls == "XamlExplorerHostIslandWindow" || cls == "ForegroundStaging") return null;
        int cloaked;
        if (DwmGetWindowIntAttribute(window, 14, out cloaked, sizeof(int)) == 0 && cloaked != 0) return null;
        // A normal maximized, decorated app is not fullscreen, even with auto-hide taskbar.
        const int caption = 0x00C00000;
        if (IsZoomed(window) && (GetWindowLong(window, -16) & caption) == caption) return false;
        var monitor = new MonitorInfo();
        monitor.Size = Marshal.SizeOf(typeof(MonitorInfo));
        if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref monitor)) return null;
        Rect bounds;
        if (DwmGetWindowAttribute(window, 9, out bounds, Marshal.SizeOf(typeof(Rect))) != 0 && !GetWindowRect(window, out bounds)) return null;
        if (inspect) Console.WriteLine("window=" + bounds.Left + "," + bounds.Top + "," + bounds.Right + "," + bounds.Bottom + " monitor=" + monitor.Monitor.Left + "," + monitor.Monitor.Top + "," + monitor.Monitor.Right + "," + monitor.Monitor.Bottom);
        return Covers(bounds, monitor.Monitor);
    }

    static string ReadSample(uint parent, IntPtr pet) {
        // Alt+Tab can temporarily foreground the switcher, the old minimized
        // window, or no window. Preserve visibility until selection completes.
        IntPtr before = GetForegroundWindow();
        if (before == IntPtr.Zero) return "?:0";
        if (pet != IntPtr.Zero && before == pet) return "S:" + before.ToInt64();
        bool? fullscreen = ForegroundFullscreen(parent, before);
        // A focus change during the native queries invalidates this sample.
        if (before != GetForegroundWindow()) return "?:0";
        return (fullscreen.HasValue ? (fullscreen.Value ? "1:" : "0:") : "?:") + before.ToInt64();
    }

    static bool NeedsBacking(System.Collections.Generic.List<double> values, bool previous) {
        if (values.Count < 8) return previous;
        int dark = 0;
        foreach (double value in values) if (value < (previous ? 130 : 100)) dark++;
        // A substantial dark section matters even when most of the area is light.
        // Hysteresis ignores isolated text pixels and avoids boundary flicker.
        return (double)dark / values.Count >= (previous ? 0.20 : 0.30);
    }

    static bool DarkBackground(IntPtr pet, uint parent, bool previous) {
        Rect bounds;
        if (!GetWindowRect(pet, out bounds)) return previous;
        double scale = 1;
        try { scale = Math.Max(1, GetDpiForWindow(pet) / 96.0); } catch { }
        // Match the canvas geometry: selected size + 78 window height,
        // 288/256 padded canvas, centered horizontally, 12px bottom inset.
        double size = (bounds.Bottom - bounds.Top) / scale - 78;
        double radius = size * 288 / 256 / 2 * scale;
        if (radius < 20) return previous;
        double cx = (bounds.Left + bounds.Right) / 2.0;
        double cy = bounds.Bottom - 12 * scale - radius;
        int extent = (int)Math.Ceiling(radius + 12 * scale);
        int left = (int)Math.Floor(cx) - extent, top = (int)Math.Floor(cy) - extent;
        int width = extent * 2 + 1;
        IntPtr dc = GetDC(IntPtr.Zero);
        if (dc == IntPtr.Zero) return previous;
        IntPtr memory = IntPtr.Zero, bitmap = IntPtr.Zero, old = IntPtr.Zero;
        var values = new System.Collections.Generic.List<double>();
        try {
            memory = CreateCompatibleDC(dc);
            bitmap = CreateCompatibleBitmap(dc, width, width);
            if (memory == IntPtr.Zero || bitmap == IntPtr.Zero) return previous;
            old = SelectObject(memory, bitmap);
            // One small local readback; sample only rings outside the artwork.
            if (!BitBlt(memory, 0, 0, width, width, dc, left, top, 0x40CC0020)) return previous;
            for (int ring = 0; ring < 2; ring++) for (int i = 0; i < 16; i++) {
                double angle = (i + ring * 0.5) * Math.PI * 2 / 16;
                double r = radius + (4 + ring * 5) * scale;
                int x = (int)Math.Round(cx + Math.Cos(angle) * r);
                int y = (int)Math.Round(cy + Math.Sin(angle) * r);
                var point = new Point { X = x, Y = y };
                IntPtr under = WindowFromPoint(point);
                if (under == IntPtr.Zero) continue;
                uint process;
                GetWindowThreadProcessId(under, out process);
                // Ignore our list/settings if they cover a sample. The pet's
                // own window is transparent at these ring coordinates.
                if (process == parent && under != pet) continue;
                uint color = GetPixel(memory, x - left, y - top);
                if (color == 0xffffffff) continue;
                values.Add(0.2126 * (color & 255) + 0.7152 * ((color >> 8) & 255) + 0.0722 * ((color >> 16) & 255));
            }
        } finally {
            if (old != IntPtr.Zero) SelectObject(memory, old);
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            if (memory != IntPtr.Zero) DeleteDC(memory);
            ReleaseDC(IntPtr.Zero, dc);
        }
        return NeedsBacking(values, previous);
    }

    static int Main(string[] args) {
        if (args.Length == 2 && args[0] == "--probe-window") {
            SetProcessDPIAware();
            var window = new IntPtr(long.Parse(args[1]));
            bool fullscreen = ForegroundFullscreen(0, window) == true;
            Console.WriteLine("{\"fullscreen\":" + fullscreen.ToString().ToLowerInvariant() + ",\"foreground\":" + (GetForegroundWindow() == window).ToString().ToLowerInvariant() + "}");
            return 0;
        }
        if (args.Length > 0 && args[0] == "--inspect") {
            inspect = true; SetProcessDPIAware(); Console.WriteLine("fullscreen=" + ForegroundFullscreen(0)); return 0;
        }
        if (args.Length > 0 && args[0] == "--self-test") {
            var monitor = new Rect { Left = -1920, Top = 0, Right = 0, Bottom = 1080 };
            if (!Covers(monitor, monitor)) return 1;
            if (Covers(new Rect { Left = -1920, Top = 0, Right = 0, Bottom = 1040 }, monitor)) return 2;
            if (Covers(new Rect { Left = 0, Top = 0, Right = 1920, Bottom = 1080 }, monitor)) return 3;
            if (!Covers(new Rect { Left = -1928, Top = -8, Right = 8, Bottom = 1088 }, monitor)) return 4;
            var bright = new System.Collections.Generic.List<double>();
            for (int i = 0; i < 32; i++) bright.Add(240);
            if (NeedsBacking(bright, true)) return 5;
            for (int i = 0; i < 10; i++) bright[i] = 20;
            if (!NeedsBacking(bright, false)) return 6;
            for (int i = 0; i < 10; i++) bright[i] = 110;
            if (NeedsBacking(bright, false) || !NeedsBacking(bright, true)) return 7;
            if (!NeedsBacking(new System.Collections.Generic.List<double>(), true)) return 8;
            Console.WriteLine("Fullscreen geometry and adaptive background checks passed"); return 0;
        }
        uint parent;
        if ((args.Length != 1 && args.Length != 2) || !uint.TryParse(args[0], out parent)) return 1;
        IntPtr pet = args.Length == 2 ? new IntPtr(long.Parse(args[1])) : IntPtr.Zero;
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { SetProcessDPIAware(); }
        bool dark = false;

        while (true) {
            try { using (var process = Process.GetProcessById((int)parent)) { if (process.HasExited) break; } } catch { break; }
            try {
                string sample = ReadSample(parent, pet);
                Console.WriteLine(sample);
                if (sample.StartsWith("0:") || sample.StartsWith("S:")) {
                    dark = DarkBackground(pet, parent, dark);
                    Console.WriteLine(dark ? "B:1" : "B:0");
                }
                Console.Out.Flush();
            } catch (System.IO.IOException) { break; } catch { }
            Thread.Sleep(100);
        }
        return 0;
    }
}

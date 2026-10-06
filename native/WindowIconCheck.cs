using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

// Read-only test fixture: inspect the actual HWND icons and shell shortcut.
class WindowIconCheck {
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr LoadImage(IntPtr instance, string name, uint type, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct FileInfo {
    public IntPtr icon; public int index; public uint attributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string displayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string typeName;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SHGetFileInfo(string path, uint attributes, out FileInfo info, uint size, uint flags);

  static bool Matches(IntPtr actual, string expected, string output, bool shortcutOverlay=false) {
    if (actual == IntPtr.Zero) return false;
    using (var bitmap = Icon.FromHandle(actual).ToBitmap()) {
      bitmap.Save(output, ImageFormat.Png);
      var expectedHandle = LoadImage(IntPtr.Zero, expected, 1, bitmap.Width, bitmap.Height, 0x10);
      if (expectedHandle == IntPtr.Zero) return false;
      try {
        using (var target = Icon.FromHandle(expectedHandle).ToBitmap()) {
          double error=0; int opaque=0;
          for (int y=0;y<bitmap.Height;y++) for (int x=0;x<bitmap.Width;x++) {
            var a=bitmap.GetPixel(x,y); var b=target.GetPixel(x,y);
            if (a.A>0) opaque++;
            // SHGetFileInfo adds the Windows shortcut arrow at bottom-left.
            // It is not part of the app artwork and must not fail the match.
            if (shortcutOverlay && x<bitmap.Width/2 && y>=bitmap.Height/2) continue;
            // Compare premultiplied pixels so transparent RGB is irrelevant.
            error += Math.Abs(a.R*a.A/255.0-b.R*b.A/255.0)+Math.Abs(a.G*a.A/255.0-b.G*b.A/255.0)+Math.Abs(a.B*a.A/255.0-b.B*b.A/255.0)+Math.Abs(a.A-b.A);
          }
          return opaque>0 && error/(bitmap.Width*bitmap.Height*4)<20;
        }
      } finally { DestroyIcon(expectedHandle); }
    }
  }
  static int Main(string[] args) {
    var hwnd=new IntPtr(long.Parse(args[0])); string expected=args[1], shortcut=args[2], directory=args[3];
    var small=SendMessage(hwnd,0x7F,IntPtr.Zero,IntPtr.Zero);
    var large=SendMessage(hwnd,0x7F,new IntPtr(1),IntPtr.Zero);
    FileInfo info;
    SHGetFileInfo(shortcut,0,out info,(uint)Marshal.SizeOf(typeof(FileInfo)),0x100);
    bool a=Matches(small,expected,Path.Combine(directory,"settings-native-small-icon.png"));
    bool b=Matches(large,expected,Path.Combine(directory,"settings-native-large-icon.png"));
    bool c=Matches(info.icon,expected,Path.Combine(directory,"settings-shell-shortcut-icon.png"),true);
    if (info.icon!=IntPtr.Zero) DestroyIcon(info.icon);
    Console.WriteLine("{\"small\":"+a.ToString().ToLowerInvariant()+",\"large\":"+b.ToString().ToLowerInvariant()+",\"shortcut\":"+c.ToString().ToLowerInvariant()+"}");
    return a&&b&&c ? 0 : 1;
  }
}

using System.Windows.Forms;
class T3PetCloseFixture {
  static void Main(string[] args) {
    Form form = new Form { Text = "T3 Pet close test", Width = 320, Height = 160 };
    Timer timeout = new Timer { Interval = 15000 };
    timeout.Tick += (sender, tick) => { timeout.Stop(); form.Close(); };
    timeout.Start();
    if (args.Length > 0 && args[0] == "--refuse") form.FormClosing += (sender, e) => { if (timeout.Enabled) e.Cancel = true; };
    Application.Run(form);
  }
}

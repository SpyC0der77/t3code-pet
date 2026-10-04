import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Electron removes taskbar tabs through the shell API without changing styles.
// Inspect the shell's actual app button and running-window count on Windows.
export async function taskbarWindowCount(): Promise<number> {
  const script = `Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$bars = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd'))
$count = 0
foreach ($bar in $bars) {
  $items = $bar.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'Appid: dev.t3pet.companion'))
  foreach ($item in $items) {
    # Match the standalone count, excluding the 3 in T3, in any shell language.
    if ($item.Current.Name -match '\\b(\\d+)\\b') { $count += [int]$Matches[1] }
  }
}
$count`;
  // UI Automation may ask this process for accessibility information. Keep
  // Electron's main thread available to answer those messages during the query.
  const result = (await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 })).stdout.trim();
  if (!/^\d+$/.test(result)) throw new Error('Could not inspect the Windows taskbar.');
  return Number(result);
}

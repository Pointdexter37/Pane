import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Rect } from "../shared/layout";

const execFileAsync = promisify(execFile);

const nativeScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class PaneNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public int dwFlags;
  }

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(
    IntPtr hWnd,
    IntPtr hWndInsertAfter,
    int X,
    int Y,
    int cx,
    int cy,
    uint uFlags);
}
'@
`;

function runPowerShell(command: string): Promise<string> {
  return execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `${nativeScript}\n${command}`,
  ]).then(({ stdout }) => stdout.trim());
}

export async function captureForegroundWindow(): Promise<number> {
  const output = await runPowerShell(`
$hwnd = [PaneNative]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { throw "No foreground window was found." }
$hwnd.ToInt64()
`);

  const hwnd = Number(output);
  if (!Number.isSafeInteger(hwnd) || hwnd <= 0) {
    throw new Error("Windows returned an invalid foreground window handle.");
  }
  return hwnd;
}

export async function snapWindow(hwnd: number, x: number, y: number, width: number, height: number): Promise<void> {
  const output = await runPowerShell(`
$target = [IntPtr]::new(${hwnd})
$monitor = [PaneNative]::MonitorFromWindow($target, 2)
if ($monitor -eq [IntPtr]::Zero) { throw "Could not find the target monitor." }
$info = New-Object PaneNative+MONITORINFO
$info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
if (-not [PaneNative]::GetMonitorInfo($monitor, [ref]$info)) { throw "Could not read the target work area." }
$work = $info.rcWork
$ok = [PaneNative]::SetWindowPos($target, [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, 0x0014)
if (-not $ok) { throw "Windows rejected the window position request." }
"ok"
`);

  if (output !== "ok") {
    throw new Error("The target window was not moved.");
  }
}

export async function getWorkArea(hwnd: number): Promise<Rect> {
  const output = await runPowerShell(`
$target = [IntPtr]::new(${hwnd})
$monitor = [PaneNative]::MonitorFromWindow($target, 2)
if ($monitor -eq [IntPtr]::Zero) { throw "Could not find the target monitor." }
$info = New-Object PaneNative+MONITORINFO
$info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
if (-not [PaneNative]::GetMonitorInfo($monitor, [ref]$info)) { throw "Could not read the target work area." }
$work = $info.rcWork
[PSCustomObject]@{
  x = $work.Left
  y = $work.Top
  width = $work.Right - $work.Left
  height = $work.Bottom - $work.Top
} | ConvertTo-Json -Compress
`);

  const workArea = JSON.parse(output) as Partial<Rect>;
  if (
    typeof workArea.x !== "number" ||
    typeof workArea.y !== "number" ||
    typeof workArea.width !== "number" ||
    typeof workArea.height !== "number" ||
    workArea.width <= 0 ||
    workArea.height <= 0
  ) {
    throw new Error("Windows returned an invalid monitor work area.");
  }
  return workArea as Rect;
}

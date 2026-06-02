param(
    [Parameter(Mandatory = $true)] [int]$ProcessId,
    [Parameter(Mandatory = $true)] [string]$Text,
    [string]$CwdLeaf = "",
    [int]$HostPid = 0
)

# F4: copy $Text to the clipboard (always), focus the session's window (same
# finding logic as focus-window.ps1, incl. the HostPid fast-path + IntelliJ
# title-match), then paste with Ctrl+V. Deliberately NO Enter — the user reviews
# and sends. If focus/paste fail, the clipboard copy still happened.

# 1) Clipboard first — guaranteed regardless of what happens with the window.
try { Set-Clipboard -Value $Text } catch { }

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Send {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError=true)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public static void ForceForeground(IntPtr hWnd) {
        keybd_event(0x12, 0, 0, 0);
        keybd_event(0x12, 0, 2, 0);
        if (IsIconic(hWnd)) { ShowWindow(hWnd, 9); }
        BringWindowToTop(hWnd);
        SetForegroundWindow(hWnd);
    }
    public static List<KeyValuePair<IntPtr, string>> EnumWindowsForProcess(uint targetPid) {
        var result = new List<KeyValuePair<IntPtr, string>>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid != targetPid) return true;
            var sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, sb.Capacity);
            var title = sb.ToString();
            if (title.Length > 0) result.Add(new KeyValuePair<IntPtr, string>(hWnd, title));
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
"@

function Get-ParentPid($id) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
    if (-not $p) { return 0 }
    return [int]$p.ParentProcessId
}
function Resolve-HostPid($startPid) {
    $cur = $startPid
    for ($i = 0; $i -lt 16 -and $cur -gt 4; $i++) {
        $p = Get-Process -Id $cur -ErrorAction SilentlyContinue
        if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) { return $cur }
        $cur = Get-ParentPid $cur
    }
    return 0
}

$hostPid = if ($HostPid -gt 0) { $HostPid } else { Resolve-HostPid $ProcessId }
if ($hostPid -eq 0) { Write-Output "COPIED_ONLY no_host"; exit 0 }

$windows = [Win32Send]::EnumWindowsForProcess([uint32]$hostPid)
if ($windows.Count -eq 0 -and $HostPid -gt 0) {
    $hostPid = Resolve-HostPid $ProcessId
    if ($hostPid -ne 0) { $windows = [Win32Send]::EnumWindowsForProcess([uint32]$hostPid) }
}
if ($windows.Count -eq 0) { Write-Output "COPIED_ONLY no_windows"; exit 0 }

$target = [IntPtr]::Zero
if ($windows.Count -gt 1 -and -not [string]::IsNullOrWhiteSpace($CwdLeaf)) {
    foreach ($w in $windows) { if ($w.Value -like "*$CwdLeaf*") { $target = $w.Key; break } }
}
if ($target -eq [IntPtr]::Zero) { $target = $windows[0].Key }

[Win32Send]::ForceForeground($target)
Start-Sleep -Milliseconds 140   # let the window settle before pasting

# 2) Paste (Ctrl+V) — best effort. No Enter; user reviews & sends.
try {
    $ws = New-Object -ComObject WScript.Shell
    $ws.SendKeys("^v")
    Write-Output ("PASTED hWnd=" + $target)
} catch {
    Write-Output ("COPIED_FOCUSED hWnd=" + $target)
}

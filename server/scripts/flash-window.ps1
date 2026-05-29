param(
    [Parameter(Mandatory = $true)] [int]$ProcessId,
    [string]$CwdLeaf = ""
)

# Same two-stage strategy as focus-window.ps1: walk up to host process,
# enumerate its windows, pick the one whose title matches CwdLeaf, then
# FlashWindowEx to flash the Windows taskbar entry.

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class FlashWin32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct FLASHWINFO {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }
    [DllImport("user32.dll")] public static extern bool FlashWindowEx(ref FLASHWINFO pwfi);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError=true)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

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

$current = $ProcessId
$hostPid = 0
for ($i = 0; $i -lt 16 -and $current -gt 4; $i++) {
    $p = Get-Process -Id $current -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
        $hostPid = $current
        break
    }
    $current = Get-ParentPid $current
}

if ($hostPid -eq 0) {
    Write-Output "NOT_FOUND"
    exit 1
}

$windows = [FlashWin32]::EnumWindowsForProcess([uint32]$hostPid)
if ($windows.Count -eq 0) {
    Write-Output "NOT_FOUND no_windows"
    exit 1
}

$target = [IntPtr]::Zero
if ($windows.Count -gt 1 -and -not [string]::IsNullOrWhiteSpace($CwdLeaf)) {
    foreach ($w in $windows) {
        if ($w.Value -like "*$CwdLeaf*") { $target = $w.Key; break }
    }
}
if ($target -eq [IntPtr]::Zero) { $target = $windows[0].Key }

$fi = New-Object FlashWin32+FLASHWINFO
$fi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($fi)
$fi.hwnd = $target
$fi.dwFlags = 3   # FLASHW_ALL
$fi.uCount = 6
$fi.dwTimeout = 0

[void][FlashWin32]::FlashWindowEx([ref]$fi)
Write-Output ("OK hWnd=" + $target)

param(
    [Parameter(Mandatory = $true)] [int]$ProcessId,
    [string]$CwdLeaf = ""
)

# Two-stage focus:
#   1. Walk up the process tree from the Claude pid to find the first ancestor
#      with a visible main window — that's the "host" process (Windows Terminal,
#      Code.exe, idea64.exe, etc.).
#   2. Enumerate ALL visible windows owned by that host process. Apps like
#      IntelliJ use a single process for multiple project windows, so the host
#      process's MainWindowHandle may point to the wrong project window. If
#      multiple windows exist, pick the one whose title contains CwdLeaf
#      (e.g., the folder name "ocapi" matches "ocapi - RabbitConfig.java").
#      Otherwise fall back to MainWindowHandle.

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Focus {
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

    // Reliable foreground bring-up. Windows blocks SetForegroundWindow when the
    // calling process isn't the active one — the canonical workaround is to
    // synthesise an Alt-key press first, which grants the foreground privilege.
    public static void ForceForeground(IntPtr hWnd) {
        keybd_event(0x12, 0, 0, 0); // Alt down (gives us focus-stealing privilege)
        keybd_event(0x12, 0, 2, 0); // Alt up
        if (IsIconic(hWnd)) { ShowWindow(hWnd, 9); }  // SW_RESTORE if minimised
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
            if (title.Length > 0) {
                result.Add(new KeyValuePair<IntPtr, string>(hWnd, title));
            }
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

# Stage 1: walk up to host process
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

# Stage 2: enumerate all windows owned by host pid
$windows = [Win32Focus]::EnumWindowsForProcess([uint32]$hostPid)
if ($windows.Count -eq 0) {
    Write-Output "NOT_FOUND no_windows"
    exit 1
}

# Pick target: prefer title-match against CwdLeaf
$target = [IntPtr]::Zero
$matchedTitle = ""
$matched = $false

if ($windows.Count -gt 1 -and -not [string]::IsNullOrWhiteSpace($CwdLeaf)) {
    foreach ($w in $windows) {
        if ($w.Value -like "*$CwdLeaf*") {
            $target = $w.Key
            $matchedTitle = $w.Value
            $matched = $true
            break
        }
    }
}

if (-not $matched) {
    # Fallback to first visible window (= host MainWindowHandle in most cases)
    $target = $windows[0].Key
    $matchedTitle = $windows[0].Value
}

[Win32Focus]::ForceForeground($target)

$tag = if ($matched) { "match" } else { "fallback" }
Write-Output ("OK hostPid=" + $hostPid + " hWnd=" + $target + " " + $tag + " title=" + $matchedTitle)

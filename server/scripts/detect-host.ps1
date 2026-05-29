param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId
)

# Walk up the process tree from the Claude pid. Collect:
#   - the IMMEDIATE shell (direct parent of claude — bash.exe / powershell.exe / pwsh.exe / cmd.exe / ...)
#   - the first ancestor with a VISIBLE main window (= the host: WindowsTerminal / Code / idea64 / ...)
# Returns:
#   FOUND|<hostName>|<hostPid>|<hWnd>|<shellName>
#   NONE

$claudeCim = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
$shellName = ''
if ($claudeCim) {
    $shellPid = [int]$claudeCim.ParentProcessId
    $shellCim = Get-CimInstance Win32_Process -Filter "ProcessId=$shellPid" -ErrorAction SilentlyContinue
    if ($shellCim) { $shellName = $shellCim.Name }
}

$current = $ProcessId
for ($i = 0; $i -lt 16 -and $current -gt 4; $i++) {
    $p = Get-Process -Id $current -ErrorAction SilentlyContinue
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
    if (-not $cim) { break }
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
        Write-Output ("FOUND|" + $cim.Name + "|" + $current + "|" + $p.MainWindowHandle + "|" + $shellName)
        exit 0
    }
    $current = [int]$cim.ParentProcessId
}
Write-Output "NONE"

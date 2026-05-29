# Removes the Windows Startup shortcut. Does NOT stop a running server.

$startupDir   = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'claude-mgmt-dashboard.lnk'

if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "Removed startup shortcut: $shortcutPath" -ForegroundColor Green
} else {
    Write-Host "No startup shortcut found (already uninstalled)." -ForegroundColor Yellow
}

# Find running node processes started from this project (best-effort)
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'claude_mgmt' }

if ($running) {
    Write-Host ""
    Write-Host "Running dashboard server processes (not stopped):" -ForegroundColor Yellow
    $running | ForEach-Object { Write-Host "  PID $($_.ProcessId)  $($_.CommandLine)" }
    Write-Host "To stop: Stop-Process -Id <PID>"
}

# Install: creates a Windows Startup shortcut that runs start-server.vbs on login.
# Run this once. To remove, run uninstall-autostart.ps1.

$ErrorActionPreference = 'Stop'

$projectDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$vbsTarget    = Join-Path $projectDir 'start-server.vbs'
$startupDir   = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'claude-mgmt-dashboard.lnk'

if (-not (Test-Path $vbsTarget)) {
    Write-Error "start-server.vbs not found at $vbsTarget"
    exit 1
}

$wsh = New-Object -ComObject WScript.Shell
$sc  = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath       = "wscript.exe"
$sc.Arguments        = '"' + $vbsTarget + '"'
$sc.WorkingDirectory = $projectDir
$sc.IconLocation     = "$env:SystemRoot\System32\shell32.dll,167"
$sc.Description      = "Claude Code sessions dashboard (local server on 127.0.0.1:7878)"
$sc.Save()

Write-Host "Installed:" -ForegroundColor Green
Write-Host "  $shortcutPath"
Write-Host ""
Write-Host "The dashboard server will start on next login."
Write-Host "Open http://127.0.0.1:7878/ in your browser (any time after login)."
Write-Host ""
Write-Host "To start it NOW without rebooting:"
Write-Host "  wscript `"$vbsTarget`""

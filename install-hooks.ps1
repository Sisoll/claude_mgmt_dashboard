# install-hooks.ps1 — install the F16 auto-approve-build PreToolUse hook (idempotent).
# Copies hooks/auto-approve-build.sh -> ~/.claude/hooks/ and registers it in settings.json.
$ErrorActionPreference = 'Stop'
$claude   = Join-Path $HOME '.claude'
$hooksDir = Join-Path $claude 'hooks'
$settings = Join-Path $claude 'settings.json'
$src      = Join-Path $PSScriptRoot 'hooks\auto-approve-build.sh'
$dst      = Join-Path $hooksDir 'auto-approve-build.sh'

New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
Copy-Item -Force $src $dst
Write-Host "copied hook -> $dst"

if (Test-Path $settings) { $cfg = Get-Content -Raw $settings | ConvertFrom-Json }
else { $cfg = [pscustomobject]@{} }

if (-not $cfg.PSObject.Properties['hooks'])            { $cfg | Add-Member hooks ([pscustomobject]@{}) }
if (-not $cfg.hooks.PSObject.Properties['PreToolUse']) { $cfg.hooks | Add-Member PreToolUse @() }

$cmd = 'bash ~/.claude/hooks/auto-approve-build.sh'
$already = $false
foreach ($grp in @($cfg.hooks.PreToolUse)) {
  foreach ($h in @($grp.hooks)) { if ($h.command -eq $cmd) { $already = $true } }
}

if ($already) {
  Write-Host 'hook already registered in settings.json (skip)'
} else {
  $entry = [pscustomobject]@{ matcher = 'Bash'; hooks = @([pscustomobject]@{ type = 'command'; command = $cmd }) }
  # force array even if PreToolUse had a single element
  $cfg.hooks.PreToolUse = @($cfg.hooks.PreToolUse) + $entry
  ($cfg | ConvertTo-Json -Depth 20) | Set-Content -Encoding UTF8 $settings
  Write-Host 'registered hook in settings.json'
}
Write-Host 'done. Restart Claude Code sessions for the hook to take effect.'

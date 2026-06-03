@echo off
rem Waits for the dashboard server to respond, then opens it in a browser.
rem Chrome preferred, falls back to Edge. Launched in the background by start-server.cmd.
rem Polls (instead of a fixed delay) because cold start can block several seconds
rem while the server detects host windows.
setlocal
set "DASH_URL=http://127.0.0.1:7878/"

rem --- wait until the server answers (up to ~30s) ---
set /a tries=0
:waitloop
curl -s -o nul --max-time 2 %DASH_URL% && goto ready
set /a tries+=1
if %tries% geq 30 goto ready
timeout /t 1 /nobreak >nul
goto waitloop
:ready

rem --- pick Chrome if installed, else Edge ---
set "CHROME="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do if exist "%%~P" set "CHROME=%%~P"

if defined CHROME (
  start "" "%CHROME%" "%DASH_URL%"
) else (
  start "" msedge "%DASH_URL%"
)
endlocal

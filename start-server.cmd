@echo off
rem Manual launcher with visible console (for debugging).
rem For silent autostart, use start-server.vbs instead.
cd /d "%~dp0server"
rem open the dashboard in a browser once the server is up (Chrome > Edge)
start "" /b "%~dp0open-dashboard.cmd"
node index.js
pause

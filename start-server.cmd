@echo off
rem Manual launcher with visible console (for debugging).
rem For silent autostart, use start-server.vbs instead.
cd /d "%~dp0server"
node index.js
pause

' Silent launcher — runs the dashboard server in the background with no console window.
' Used by the Windows Startup shortcut installed via install-autostart.ps1.
Set sh = CreateObject("WScript.Shell")
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = projectDir & "\server"
' 0 = hidden window; False = don't wait for return
sh.Run "cmd /c node index.js", 0, False

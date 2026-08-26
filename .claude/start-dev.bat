@echo off
rem Use the system Node.js install (added to PATH by the installer).
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
call npm run dev -- --port 5183 --strictPort

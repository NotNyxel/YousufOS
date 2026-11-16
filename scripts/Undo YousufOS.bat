@echo off
rem Double-click to bring back the TV's own home screen and remove YousufOS.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-android-tv.ps1" -Undo
echo.
pause

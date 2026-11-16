@echo off
rem Double-click to install YousufOS on the Android TV (see docs/android-tv.md).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-android-tv.ps1"
echo.
pause

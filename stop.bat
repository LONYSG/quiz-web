@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts\play.mjs --stop
pause

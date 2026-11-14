@echo off
chcp 65001 >nul
cd /d "%~dp0"
title gpt-cards
node scripts\gpt-cards.mjs --watch %*
echo.
echo Done. You can close this window.
pause

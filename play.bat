@echo off
chcp 65001 >nul
cd /d "%~dp0"
title quiz-web tunnel (close = tunnel only)
node scripts\play.mjs %*
pause

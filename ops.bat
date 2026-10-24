@echo off
chcp 65001 >nul
cd /d "%~dp0"
title quiz-web ops
node scripts\ops.mjs
pause

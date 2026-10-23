@echo off
chcp 65001 >nul
cd /d "%~dp0"
title quiz-web 운영자 메뉴
node scripts\ops.mjs
pause

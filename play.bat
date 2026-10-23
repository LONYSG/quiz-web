@echo off
chcp 65001 >nul
cd /d "%~dp0"
title quiz-web 터널 (닫으면 터널만 꺼짐)
node scripts\play.mjs %*
pause

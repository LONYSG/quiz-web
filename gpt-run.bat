@echo off
chcp 65001 >nul
cd /d "%~dp0"
title gpt-run
node scripts\gpt-run.mjs --worker

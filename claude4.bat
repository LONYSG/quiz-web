@echo off
rem 원클릭: PowerShell 창 4개(Agent · Main · Gen · Verify) → cd 이 폴더 → claude --dangerously-skip-permissions --resume <이름의 최신 세션>
rem   claude4.bat            네 창 모두
rem   claude4.bat Gen Verify 고른 창만
rem   claude4.bat -DryRun    띄우지 않고 고를 세션만 표시
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\claude4.ps1" %*

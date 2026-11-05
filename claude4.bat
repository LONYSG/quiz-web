@echo off
rem One click: 4 PowerShell windows (Agent / Main / Gen / Verify) -> cd repo -> claude --dangerously-skip-permissions --resume latest session of that name
rem   claude4.bat              all four
rem   claude4.bat Gen Verify   only these
rem   claude4.bat -DryRun      show which sessions would be picked, open nothing
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\claude4.ps1" %*

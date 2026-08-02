@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Запуск PDF Guide Creator...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause

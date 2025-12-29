@echo off
title Vision Gate System - Full Stack
color 0B

echo ================================================
echo   STARTING VISION GATE SYSTEM
echo ================================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found!
    pause
    exit /b 1
)

:: Check Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found!
    pause
    exit /b 1
)

echo [1/3] Starting Flask AI Webcam Server (port 5000)...
start "Flask AI Webcam" cmd /k "cd /d %~dp0AI_model && python run_webcam_flask.py"
timeout /t 3 >nul

echo [2/3] Starting Backend Server (port 3000)...
start "Backend Server" cmd /k "cd /d %~dp0backend && node server.js"
timeout /t 3 >nul

echo [3/3] Opening Web Interface...
timeout /t 2 >nul
start http://localhost:3000

echo.
echo ================================================
echo   ALL SERVICES RUNNING!
echo ================================================
echo.
echo   Flask AI Stream : http://localhost:5000
echo   Frontend        : http://localhost:3000
echo.
echo AI webcam should auto-load in your browser!
echo.
echo Press any key to exit this window
echo (Services will keep running in background)
echo ================================================
pause >nul


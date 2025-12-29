@echo off
title ESP32 FIRMWARE FLASHER
color 0C

echo ================================================
echo   FLASHING ESP32-CAM FIRMWARE
echo ================================================

:: Kill processes
taskkill /F /IM arduino-cli.exe 2>nul
timeout /t 1 >nul

:: Compile
echo.
echo [1/2] Compiling for ESP32-C3...
arduino-cli compile --fqbn esp32:esp32:esp32c3 .
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Compile Failed!
    pause
    exit /b 1
)

:: Upload
echo.
echo [2/2] Uploading to COM7...
echo ** PLEASE HOLD BOOT BUTTON IF NEEDED **
echo ** ENSURE GPIO9 IS CONNECTED TO GND (if needed) **
timeout /t 2 >nul

arduino-cli upload -p COM7 --fqbn esp32:esp32:esp32c3 .

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Upload Failed!
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Upload Complete!
echo.
echo ================================================
echo   ESP32-C3 READY!
echo ================================================
echo ** DISCONNECT GPIO0 from GND (if connected) **
echo ** PRESS RESET BUTTON on ESP32-C3 **
echo.
echo Check Serial Monitor (115200 baud) for IP address
echo.
pause
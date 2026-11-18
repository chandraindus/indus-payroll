@echo off
title Indus Projects - Payroll System Server
cd /d "%~dp0"

echo.
echo  Indus Projects Pvt. Ltd. - Payroll System
echo  ==========================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
  echo  Installing dependencies (first time only)...
  npm install
  echo.
)

:: Start the server
echo  Starting server...
echo.
node server.js

pause

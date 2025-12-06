
@echo off
echo ========================================
echo   Dataset Collector for GGClub
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

echo [INFO] Starting dataset collection...
echo [INFO] Please ensure GGClub tables are open before continuing.
echo.
pause

REM Get target count from user
set /p TARGET="Enter number of screenshots to collect (default: 300): "
if "%TARGET%"=="" set TARGET=300

echo.
echo [INFO] Target: %TARGET% screenshots
echo [INFO] This may take a while...
echo.

node --loader tsx script/collect-dataset.ts %TARGET%

echo.
echo ========================================
echo   Collection Complete
echo ========================================
echo.
echo Results saved to: ./dataset/ggclub-captures/
echo.
pause

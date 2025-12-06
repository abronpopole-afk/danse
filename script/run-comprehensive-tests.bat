
@echo off
echo ========================================
echo   Comprehensive Test Suite
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    pause
    exit /b 1
)

echo [INFO] Starting comprehensive test suite...
echo [INFO] This will run all test phases including:
echo   - Basic capture tests
echo   - OCR accuracy (500 screenshots)
echo   - Multi-resolution tests
echo   - Multi-DPI tests
echo   - Performance tests
echo   - Robustness tests
echo.
pause

node --loader tsx -e "import('./server/bot/tests/comprehensive-test-suite.ts').then(m => m.runComprehensiveTests())"

echo.
echo ========================================
echo   Tests Complete
echo ========================================
echo.
echo Results saved to: ./test-results/comprehensive/
echo.
pause

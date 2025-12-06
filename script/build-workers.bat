
@echo off
echo ================================
echo  COMPILATION DES WORKERS
echo ================================
echo.

echo Compilation des workers TypeScript en JavaScript...
node --loader tsx script/build-workers.ts

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================
    echo  COMPILATION REUSSIE
    echo ================================
    echo.
    echo Les workers compiles sont dans dist/workers/
    echo.
) else (
    echo.
    echo ================================
    echo  ECHEC DE LA COMPILATION
    echo ================================
    echo.
    exit /b 1
)

pause

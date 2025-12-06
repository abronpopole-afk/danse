@echo off
title GTO Poker Bot - Installation Windows
color 0B

echo ========================================
echo GTO Poker Bot - Installation Windows
echo ========================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERREUR: Ce script doit etre execute en tant qu'Administrateur!
    echo.
    echo Clic droit sur ce fichier -^> Executer en tant qu'administrateur
    echo.
    pause
    exit /b 1
)

echo [1/5] Verification de Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo Node.js non trouve. Veuillez l'installer depuis https://nodejs.org/
    echo.
    start https://nodejs.org/
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do echo Node.js %%i detecte
)

echo.
echo [2/5] Verification de Python...
where python >nul 2>&1
if %errorLevel% neq 0 (
    echo Python non trouve. Installation recommandee depuis https://www.python.org/
    echo L'application fonctionnera, mais certaines fonctionnalites avancees seront desactivees.
) else (
    for /f "tokens=*" %%i in ('python --version') do echo %%i detecte
)

echo.
echo [3/5] Installation des outils de build npm...
call npm install -g node-gyp 2>nul
echo Outils npm installes

echo.
echo [4/5] Configuration de npm...
call npm config set msvs_version 2022 2>nul

echo.
echo [5/5] Creation des repertoires...
if not exist "%APPDATA%\GTO Poker Bot" mkdir "%APPDATA%\GTO Poker Bot"
if not exist "%APPDATA%\GTO Poker Bot\logs" mkdir "%APPDATA%\GTO Poker Bot\logs"
if not exist "%APPDATA%\GTO Poker Bot\config" mkdir "%APPDATA%\GTO Poker Bot\config"
if not exist "%APPDATA%\GTO Poker Bot\cache" mkdir "%APPDATA%\GTO Poker Bot\cache"
echo Repertoires crees dans %APPDATA%\GTO Poker Bot

echo.
echo ========================================
echo Installation terminee!
echo ========================================
echo.
echo Vous pouvez maintenant lancer GTO Poker Bot!
echo.
pause

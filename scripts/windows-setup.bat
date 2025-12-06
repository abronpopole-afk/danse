@echo off
title GTO Poker Bot - Installation Windows Complete
color 0B

echo ========================================
echo GTO Poker Bot - Installation Windows
echo Avec compilation des modules natifs
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

echo [1/8] Verification de Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo Node.js non trouve. Installation via winget...
    winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    echo Veuillez redemarrer ce script apres l'installation de Node.js
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do echo Node.js %%i detecte
)

echo.
echo [2/8] Verification de Python...
where python >nul 2>&1
if %errorLevel% neq 0 (
    echo Python non trouve. Installation via winget...
    winget install Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
    echo Python installe
) else (
    for /f "tokens=*" %%i in ('python --version') do echo %%i detecte
)

echo.
echo [3/8] Verification de Visual Studio Build Tools...
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" (
    echo Visual Studio Build Tools detectes
) else (
    echo Visual Studio Build Tools non detectes.
    echo.
    echo Telechargement et installation des Build Tools...
    echo Cela peut prendre 10-15 minutes...
    echo.
    curl -L -o "%TEMP%\vs_buildtools.exe" "https://aka.ms/vs/17/release/vs_buildtools.exe"
    "%TEMP%\vs_buildtools.exe" --quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows10SDK.19041 --includeRecommended
    echo Visual Studio Build Tools installes
)

echo.
echo [4/8] Installation de node-gyp global...
call npm install -g node-gyp 2>nul
echo node-gyp installe

echo.
echo [5/8] Preparation...
echo Configuration prete

echo.
echo [6/8] Installation des dependances npm...
set /p INSTALL_DIR="Entrez le chemin d'installation de GTO Poker Bot (ou appuyez sur Entree pour %CD%): "
if "%INSTALL_DIR%"=="" set INSTALL_DIR=%CD%

if exist "%INSTALL_DIR%\package.json" (
    cd /d "%INSTALL_DIR%"
    
    echo Correction des versions de packages...
    powershell -Command "(Get-Content package.json) -replace '\"@auth/express\": \"\^0.10.4\"', '\"@auth/express\": \"^0.12.1\"' | Set-Content package.json"
    powershell -Command "(Get-Content package.json) -replace '\"@auth/core\": \"\^0.37.4\"', '\"@auth/core\": \"^0.40.0\"' | Set-Content package.json"
    
    echo Installation des dependances...
    call npm install --legacy-peer-deps --ignore-scripts
    echo Dependances installees
) else (
    echo package.json non trouve dans %INSTALL_DIR%
    echo.
    echo IMPORTANT: Vous n'avez pas besoin de ce script si vous utilisez
    echo le fichier .exe telecharge depuis GitHub Releases!
    echo.
    echo Ce script est uniquement pour les developpeurs qui veulent
    echo compiler le projet depuis le code source.
    echo.
    goto :end
)

echo.
echo [7/8] Compilation de robotjs...
if exist "%INSTALL_DIR%\package.json" (
    cd /d "%INSTALL_DIR%"
    call npm rebuild robotjs 2>nul
    if %errorLevel% equ 0 (
        echo robotjs compile avec succes
    ) else (
        echo robotjs: compilation echouee - fonctionnalite optionnelle
    )
)

echo.
echo [8/8] Compilation du module DXGI...
if exist "%INSTALL_DIR%\native\binding.gyp" (
    cd /d "%INSTALL_DIR%\native"
    call npx node-gyp configure 2>nul
    call npx node-gyp build 2>nul
    if %errorLevel% equ 0 (
        echo Module DXGI compile avec succes
    ) else (
        echo Module DXGI: compilation echouee - fonctionnalite optionnelle
    )
) else (
    echo Module DXGI: binding.gyp non trouve - fonctionnalite optionnelle
)

:end
echo.
echo Creation des repertoires de donnees...
if not exist "%APPDATA%\GTO Poker Bot" mkdir "%APPDATA%\GTO Poker Bot"
if not exist "%APPDATA%\GTO Poker Bot\logs" mkdir "%APPDATA%\GTO Poker Bot\logs"
if not exist "%APPDATA%\GTO Poker Bot\config" mkdir "%APPDATA%\GTO Poker Bot\config"
if not exist "%APPDATA%\GTO Poker Bot\cache" mkdir "%APPDATA%\GTO Poker Bot\cache"
if not exist "%APPDATA%\GTO Poker Bot\models" mkdir "%APPDATA%\GTO Poker Bot\models"
echo Repertoires crees

echo.
echo ========================================
echo Installation terminee!
echo ========================================
echo.
echo IMPORTANT: Si vous avez telecharge le .exe depuis GitHub Releases,
echo vous pouvez simplement le lancer directement!
echo.
echo Ce script est uniquement necessaire pour compiler
echo les modules natifs optionnels (DXGI, robotjs).
echo.
pause

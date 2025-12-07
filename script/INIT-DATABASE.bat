
@echo off
title GTO Poker Bot - Initialisation Base de Donnees
color 0B

echo.
echo  ====================================================
echo     GTO POKER BOT - INITIALISATION BASE DE DONNEES
echo  ====================================================
echo.
echo  Ce script va:
echo   - Installer PostgreSQL 16 (si necessaire)
echo   - Creer la base de donnees 'poker_bot'
echo   - Initialiser toutes les tables
echo   - Generer le fichier .env
echo.
echo  Appuyez sur une touche pour continuer...
pause >nul

cd /d "%~dp0"

echo.
echo  [>] Lancement de l'initialisation...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0init-database-windows.ps1'"

echo.
echo  ====================================================
echo  Appuyez sur une touche pour fermer...
pause >nul

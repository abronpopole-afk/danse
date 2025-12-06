# GTO Poker Bot - Windows Dependencies Setup Script
# Run this script as Administrator on Windows before using the application

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GTO Poker Bot - Windows Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERREUR: Ce script doit etre execute en tant qu'Administrateur!" -ForegroundColor Red
    Write-Host "Clic droit sur PowerShell -> Executer en tant qu'administrateur" -ForegroundColor Yellow
    pause
    exit 1
}

# Check if Node.js is installed
Write-Host "[1/6] Verification de Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Node.js n'est pas installe. Installation via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "Node.js $nodeVersion detecte" -ForegroundColor Green
}

# Check if Python is installed
Write-Host "[2/6] Verification de Python..." -ForegroundColor Yellow
$pythonVersion = python --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Python n'est pas installe. Installation via winget..." -ForegroundColor Yellow
    winget install Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "Python $pythonVersion detecte" -ForegroundColor Green
}

# Check if Visual Studio Build Tools are installed
Write-Host "[3/6] Verification des Visual Studio Build Tools..." -ForegroundColor Yellow
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWhere) {
    $vsInstall = & $vsWhere -latest -property installationPath
    if ($vsInstall) {
        Write-Host "Visual Studio Build Tools detectes: $vsInstall" -ForegroundColor Green
    }
} else {
    Write-Host "Visual Studio Build Tools non detectes. Installation..." -ForegroundColor Yellow
    Write-Host "Telechargement de l'installateur..." -ForegroundColor Yellow
    $vsInstallerUrl = "https://aka.ms/vs/17/release/vs_buildtools.exe"
    $vsInstallerPath = "$env:TEMP\vs_buildtools.exe"
    Invoke-WebRequest -Uri $vsInstallerUrl -OutFile $vsInstallerPath
    
    Write-Host "Installation des Build Tools (cela peut prendre plusieurs minutes)..." -ForegroundColor Yellow
    Start-Process -FilePath $vsInstallerPath -ArgumentList "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" -Wait
    Write-Host "Visual Studio Build Tools installes" -ForegroundColor Green
}

# Install global npm packages
Write-Host "[4/6] Installation des packages npm globaux..." -ForegroundColor Yellow
npm install -g node-gyp windows-build-tools --ignore-scripts 2>$null
Write-Host "Packages npm globaux installes" -ForegroundColor Green

# Configure npm for native modules
Write-Host "[5/6] Configuration de npm pour les modules natifs..." -ForegroundColor Yellow
npm config set msvs_version 2022 2>$null
npm config set python python 2>$null
Write-Host "npm configure" -ForegroundColor Green

# Create data directories
Write-Host "[6/6] Creation des repertoires de donnees..." -ForegroundColor Yellow
$appDataPath = "$env:APPDATA\GTO Poker Bot"
$directories = @(
    "$appDataPath\logs",
    "$appDataPath\config",
    "$appDataPath\cache",
    "$appDataPath\models"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  Cree: $dir" -ForegroundColor Gray
    }
}
Write-Host "Repertoires crees" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Installation terminee avec succes!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Vous pouvez maintenant lancer GTO Poker Bot!" -ForegroundColor Cyan
Write-Host ""
pause

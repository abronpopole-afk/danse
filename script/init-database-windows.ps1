
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Script d'initialisation automatique de la base de données PostgreSQL pour GTO Poker Bot

.DESCRIPTION
    Ce script installe PostgreSQL si nécessaire, crée la base de données, les tables,
    et génère un fichier .env avec les informations de connexion.
#>

param(
    [string]$DbName = "poker_bot",
    [string]$DbUser = "poker_bot",
    [string]$DbPassword = "",
    [string]$InstallPath = "$PSScriptRoot\..",
    [switch]$SkipPostgresInstall
)

$ErrorActionPreference = "Stop"

function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Error { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "[!] $Message" -ForegroundColor Yellow }

function Test-PostgresInstalled {
    $pgPath = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    return (Test-Path $pgPath) -or (Get-Command psql -ErrorAction SilentlyContinue)
}

function Install-PostgreSQL {
    Write-Info "Installation de PostgreSQL 16..."
    
    if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Info "Installation de Chocolatey..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
    
    choco install postgresql16 --params "/Password:$DbPassword" -y
    
    $pgBinPath = "C:\Program Files\PostgreSQL\16\bin"
    if (Test-Path $pgBinPath) {
        $env:Path += ";$pgBinPath"
        [Environment]::SetEnvironmentVariable("Path", $env:Path, "User")
    }
    
    Start-Sleep -Seconds 10
    Write-Success "PostgreSQL installé"
}

function New-Database {
    param([string]$PsqlPath)
    
    Write-Info "Création de la base de données '$DbName'..."
    
    $env:PGPASSWORD = $DbPassword
    
    try {
        & $PsqlPath -U postgres -c "DROP DATABASE IF EXISTS $DbName;" 2>$null
        & $PsqlPath -U postgres -c "DROP USER IF EXISTS $DbUser;" 2>$null
        
        & $PsqlPath -U postgres -c "CREATE USER $DbUser WITH PASSWORD '$DbPassword';"
        & $PsqlPath -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;"
        & $PsqlPath -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;"
        
        Write-Success "Base de données '$DbName' créée"
    } catch {
        Write-Error "Erreur lors de la création de la base: $_"
        throw
    }
}

function Initialize-Schema {
    param([string]$PsqlPath)
    
    Write-Info "Initialisation du schéma de la base de données..."
    
    $env:PGPASSWORD = $DbPassword
    
    $schemaSQL = @"
-- Tables principales
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_sessions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'stopped',
    started_at TIMESTAMP,
    stopped_at TIMESTAMP,
    total_profit REAL DEFAULT 0,
    hands_played INTEGER DEFAULT 0,
    tables_active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poker_tables (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR REFERENCES bot_sessions(id),
    table_identifier TEXT NOT NULL,
    table_name TEXT NOT NULL,
    stakes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    hero_position INTEGER,
    hero_stack REAL,
    current_pot REAL DEFAULT 0,
    hero_cards TEXT[],
    community_cards TEXT[],
    current_street TEXT DEFAULT 'preflop',
    players_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hand_histories (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR REFERENCES bot_sessions(id),
    hand_number TEXT NOT NULL,
    hero_cards TEXT[],
    community_cards TEXT[],
    hero_position TEXT,
    actions JSONB,
    gto_recommendation JSONB,
    actual_action TEXT,
    result REAL,
    ev_difference REAL,
    played_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS humanizer_config (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    min_delay_ms INTEGER NOT NULL DEFAULT 1500,
    max_delay_ms INTEGER NOT NULL DEFAULT 4200,
    enable_bezier_mouse BOOLEAN NOT NULL DEFAULT TRUE,
    enable_misclicks BOOLEAN NOT NULL DEFAULT FALSE,
    misclick_probability REAL DEFAULT 0.0001,
    enable_random_folds BOOLEAN NOT NULL DEFAULT FALSE,
    random_fold_probability REAL DEFAULT 0.001,
    thinking_time_variance REAL DEFAULT 0.3,
    pre_action_delay INTEGER DEFAULT 500,
    post_action_delay INTEGER DEFAULT 300,
    stealth_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS gto_config (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    api_endpoint TEXT,
    api_key TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    fallback_to_simulation BOOLEAN NOT NULL DEFAULT TRUE,
    cache_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_cache_age INTEGER DEFAULT 3600
);

CREATE TABLE IF NOT EXISTS platform_config (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_name TEXT NOT NULL,
    username TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    connection_status TEXT DEFAULT 'disconnected',
    last_connection_at TIMESTAMP,
    settings JSONB,
    account_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_logs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR REFERENCES bot_sessions(id),
    table_id VARCHAR REFERENCES poker_tables(id),
    log_type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_stats (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR REFERENCES bot_sessions(id),
    hands_per_hour INTEGER DEFAULT 0,
    bb_per_100 REAL DEFAULT 0,
    gto_precision REAL DEFAULT 0,
    vpip REAL DEFAULT 0,
    pfr REAL DEFAULT 0,
    aggression REAL DEFAULT 0,
    win_rate REAL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_profile_state (
    id SERIAL PRIMARY KEY,
    personality TEXT NOT NULL DEFAULT 'balanced',
    tilt_level REAL NOT NULL DEFAULT 0,
    fatigue_level REAL NOT NULL DEFAULT 0,
    session_duration REAL NOT NULL DEFAULT 0,
    recent_bad_beats INTEGER NOT NULL DEFAULT 0,
    consecutive_losses INTEGER NOT NULL DEFAULT 0,
    consecutive_wins INTEGER NOT NULL DEFAULT 0,
    last_big_win REAL NOT NULL DEFAULT 0,
    last_big_loss REAL NOT NULL DEFAULT 0,
    session_start_time TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_platform_config_account_id ON platform_config(account_id);
CREATE INDEX IF NOT EXISTS idx_poker_tables_session_id ON poker_tables(session_id);
CREATE INDEX IF NOT EXISTS idx_hand_histories_session_id ON hand_histories(session_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs(created_at);

-- Configuration par défaut
INSERT INTO humanizer_config (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;
INSERT INTO gto_config (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;
INSERT INTO player_profile_state (id) VALUES (1) ON CONFLICT DO NOTHING;
"@

    $tempFile = [System.IO.Path]::GetTempFileName()
    $schemaSQL | Out-File -FilePath $tempFile -Encoding UTF8
    
    try {
        & $PsqlPath -U $DbUser -d $DbName -f $tempFile
        Write-Success "Schéma initialisé avec succès"
    } catch {
        Write-Error "Erreur lors de l'initialisation du schéma: $_"
        throw
    } finally {
        Remove-Item $tempFile -ErrorAction SilentlyContinue
    }
}

function New-EnvFile {
    param([string]$DatabaseUrl)
    
    Write-Info "Génération du fichier .env..."
    
    $envPath = Join-Path $InstallPath ".env"
    
    # Générer des clés de chiffrement aléatoires
    $encryptionKey = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    $dbEncryptionKey = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    $sessionSecret = [System.Guid]::NewGuid().ToString() + [System.Guid]::NewGuid().ToString()
    
    $envContent = @"
# =========================================
# Configuration GTO Poker Bot - Windows 11
# Généré automatiquement le $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# =========================================

# Base de données PostgreSQL
DATABASE_URL=$DatabaseUrl

# Port de l'application
PORT=5000

# Environnement
NODE_ENV=production

# Clés de chiffrement (NE PAS PARTAGER)
ENCRYPTION_KEY=$encryptionKey
DB_ENCRYPTION_KEY=$dbEncryptionKey

# Session secret
SESSION_SECRET=$sessionSecret

# ===================
# Options avancées
# ===================

# Configuration capture DXGI
DXGI_ENABLED=true
DXGI_FALLBACK=screenshot-desktop

# Debug
DEBUG_MODE=false
LOG_LEVEL=info
"@

    $envContent | Out-File -FilePath $envPath -Encoding UTF8 -Force
    Write-Success "Fichier .env créé: $envPath"
    
    # Créer aussi un fichier d'informations de connexion
    $infoPath = Join-Path $InstallPath "DATABASE_INFO.txt"
    $infoContent = @"
========================================
INFORMATIONS DE CONNEXION BASE DE DONNÉES
========================================

Base de données : $DbName
Utilisateur     : $DbUser
Mot de passe    : $DbPassword
URL complète    : $DatabaseUrl

Ces informations sont également dans le fichier .env

⚠️  GARDEZ CES INFORMATIONS SECRÈTES ⚠️

Généré le : $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
========================================
"@
    
    $infoContent | Out-File -FilePath $infoPath -Encoding UTF8 -Force
    Write-Success "Informations sauvegardées dans: $infoPath"
}

# ============================================
# SCRIPT PRINCIPAL
# ============================================

Clear-Host
Write-Host @"

  ╔══════════════════════════════════════════════╗
  ║   GTO POKER BOT - INITIALISATION BDD         ║
  ║   Windows 11 - Installation Automatique      ║
  ╚══════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Vérifier les droits admin
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Ce script nécessite les droits Administrateur!"
    Write-Warning "Faites un clic droit > Exécuter en tant qu'administrateur"
    exit 1
}

# Générer un mot de passe aléatoire si non fourni
if ([string]::IsNullOrEmpty($DbPassword)) {
    $DbPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object {[char]$_})
    Write-Info "Mot de passe généré automatiquement"
}

# 1. Vérifier/Installer PostgreSQL
if (!$SkipPostgresInstall) {
    if (!(Test-PostgresInstalled)) {
        Install-PostgreSQL
    } else {
        Write-Success "PostgreSQL déjà installé"
    }
} else {
    Write-Info "Installation PostgreSQL ignorée"
}

# Trouver psql.exe
$psqlPath = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
if (!(Test-Path $psqlPath)) {
    $psqlPath = (Get-Command psql -ErrorAction SilentlyContinue).Source
    if (!$psqlPath) {
        Write-Error "psql.exe non trouvé. Installez PostgreSQL manuellement."
        exit 1
    }
}

Write-Success "psql trouvé: $psqlPath"

# 2. Créer la base de données
New-Database -PsqlPath $psqlPath

# 3. Initialiser le schéma
Initialize-Schema -PsqlPath $psqlPath

# 4. Générer le fichier .env
$databaseUrl = "postgresql://${DbUser}:${DbPassword}@localhost:5432/${DbName}"
New-EnvFile -DatabaseUrl $databaseUrl

# 5. Vérification finale
Write-Info "Vérification de la base de données..."
$env:PGPASSWORD = $DbPassword
$tableCount = & $psqlPath -U $DbUser -d $DbName -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

if ($tableCount -gt 0) {
    Write-Success "Base de données initialisée avec $($tableCount.Trim()) tables"
} else {
    Write-Error "Erreur: Aucune table créée"
    exit 1
}

Write-Host @"

╔═══════════════════════════════════════════════════╗
║           INITIALISATION TERMINÉE !               ║
╚═══════════════════════════════════════════════════╝

✅ PostgreSQL installé et configuré
✅ Base de données '$DbName' créée
✅ Schéma initialisé ($($tableCount.Trim()) tables)
✅ Fichier .env généré
✅ Informations de connexion sauvegardées

📋 INFORMATIONS DE CONNEXION:
   Base de données : $DbName
   Utilisateur     : $DbUser
   Mot de passe    : $DbPassword
   URL             : $databaseUrl

📄 Fichiers créés:
   - .env (configuration)
   - DATABASE_INFO.txt (informations de connexion)

🚀 PROCHAINE ÉTAPE:
   Vous pouvez maintenant lancer l'application .exe

⚠️  IMPORTANT: Gardez DATABASE_INFO.txt en sécurité !

"@ -ForegroundColor Green

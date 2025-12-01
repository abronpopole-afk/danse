# GTO Poker Bot - Command Center

## Overview
Bot de poker automatisé avec intégration GTO Wizard, comportement humanisé et support multi-tables. 
Le système permet de jouer sur plusieurs tables simultanément avec des décisions basées sur la théorie des jeux (GTO).

## Current State
- Architecture backend complète avec moteur de décision GTO
- Système humanizer pour simuler un comportement humain naturel
- Gestionnaire multi-tables pour jouer sur plusieurs tables simultanément
- Interface de contrôle en temps réel avec WebSocket
- Mode simulation GTO fonctionnel (en attente d'intégration API réelle)
- Configuration plateforme poker préparée pour intégration future

## Architecture

### Backend (server/)
- `server/routes.ts` - API REST et WebSocket pour le contrôle du bot
- `server/storage.ts` - Interface de stockage PostgreSQL avec Drizzle ORM
- `server/bot/gto-engine.ts` - Moteur de décision GTO (simulation + adaptateur API)
- `server/bot/humanizer.ts` - Système de comportement humain (délais, mouvements souris)
- `server/bot/table-manager.ts` - Gestion des sessions multi-tables

### Frontend (client/)
- `client/src/pages/dashboard.tsx` - Tableau de bord principal
- `client/src/pages/settings.tsx` - Configuration GTO et plateforme
- `client/src/hooks/use-bot-state.ts` - État global du bot avec WebSocket
- `client/src/lib/api.ts` - Client API typé

### Shared (shared/)
- `shared/schema.ts` - Modèles de données Drizzle (sessions, tables, mains, configs)

## Key Features

### Moteur GTO
- Recommandations basées sur la force de la main
- Analyse de texture du board
- Décisions préflop et postflop
- Adaptateur pour GTO Wizard API (configurable)
- Mode simulation avec heuristiques avancées

### Humanizer
- Délais de réflexion aléatoires (1.5s - 4.2s par défaut)
- Distribution gaussienne pour les temps de réflexion
- Mouvements de souris en courbes de Bézier
- Mode furtif pour éviter les actions instantanées
- Option de miss-click occasionnel

### Multi-Tables
- Jusqu'à 6 tables simultanées
- Gestion indépendante de chaque session
- File d'attente d'actions prioritaire
- Statistiques agrégées

## Database Schema

### Tables principales
- `bot_sessions` - Sessions de jeu
- `poker_tables` - Tables actives
- `hand_histories` - Historique des mains
- `action_logs` - Logs des actions
- `bot_stats` - Statistiques de performance

### Configuration
- `humanizer_config` - Paramètres de comportement humain
- `gto_config` - Configuration GTO Wizard
- `platform_config` - Connexion plateforme poker

## API Endpoints

### Session
- `POST /api/session/start` - Démarrer une session
- `POST /api/session/stop` - Arrêter la session
- `GET /api/session/current` - État actuel

### Tables
- `POST /api/tables` - Ajouter une table
- `DELETE /api/tables/:id` - Retirer une table
- `GET /api/tables` - Liste des tables

### Configuration
- `GET/PATCH /api/humanizer` - Config humanizer
- `GET/PATCH /api/gto-config` - Config GTO Wizard
- `GET/PATCH /api/platform-config` - Config plateforme

### WebSocket
- `/ws` - Connexion temps réel pour updates

## User Preferences
- Interface en français
- Design dark mode avec accents verts (primary)
- Style futuriste/cyberpunk

## Next Steps (Integration)
1. Configurer clé API GTO Wizard quand disponible
2. Choisir et intégrer plateforme poker
3. Développer adaptateur spécifique à la plateforme choisie
4. Tests en conditions réelles

## Recent Changes
- Création de l'architecture complète du bot
- Implémentation du moteur GTO simulé
- Système humanizer avec comportement réaliste
- Gestionnaire multi-tables
- Interface de configuration
- WebSocket pour mises à jour temps réel

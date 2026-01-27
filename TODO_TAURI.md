# Plan de Migration vers Tauri 🚀

Ce document détaille les étapes nécessaires pour transformer le bot Poker actuel en une application **Tauri** ultra-légère et stable.

## 1. Infrastructure Rust (`src-tauri`)
- [x] Initialiser la structure de projet Tauri.
- [ ] Configurer `Cargo.toml` avec les crates DXGI et Windows API.
- [ ] Mettre en place la gestion des erreurs personnalisée en Rust pour le bot.

## 2. Capture d'Écran Native (Le cœur du Bot)
- [ ] Implémenter la capture d'écran via **DXGI Desktop Duplication** en Rust.
- [ ] Créer une commande Tauri pour envoyer les frames au frontend ou au service OCR.
- [ ] Optimiser la consommation CPU/RAM des captures.

## 3. Automatisation des Fenêtres (Windows API)
- [ ] Remplacer `node-window-manager` par des appels natifs Win32 en Rust.
- [ ] Implémenter le focus et le redimensionnement automatique des tables.
- [ ] Détection robuste des processus GGClub.

## 4. Intégration Frontend (React)
- [ ] Installer `@tauri-apps/api` dans le projet React.
- [ ] Remplacer les appels API Backend par des invocations de commandes Tauri (`invoke`).
- [ ] Gérer les flux de données temps réel (WebSocket vs Tauri Events).

## 5. Nettoyage et Optimisation
- [ ] Supprimer les dépendances Node.js lourdes (`robotjs`, `screenshot-desktop`).
- [ ] Désactiver le serveur Express si toute la logique est portée en Rust/Frontend.
- [ ] Configurer le pipeline de build final (.exe léger).

---
*Note : Cette migration rendra le bot 10x plus stable en éliminant les couches intermédiaires instables de Node.js.*

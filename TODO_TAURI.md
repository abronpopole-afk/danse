# Plan de Migration vers Tauri 🚀

Ce document détaille les étapes nécessaires pour transformer le bot Poker actuel en une application **Tauri** ultra-légère et stable.

## 1. Infrastructure Rust (`src-tauri`)
- [x] Initialiser la structure de projet Tauri.
- [x] Configurer `Cargo.toml` avec les crates DXGI, Windows API et Anyhow.
- [x] Implémenter le listing des fenêtres via Win32 API.
- [x] Implémenter le focus et le redimensionnement natif.
- [x] Détection des classes de fenêtres (Qt5Window pour GGClub).
- [x] Mettre en place la gestion des erreurs personnalisée en Rust pour le bot.
- [x] Optimiser la consommation CPU/RAM des captures en mode stream.

## 3. Automatisation des Fenêtres (Windows API)
- [x] Remplacer `node-window-manager` par des appels natifs Win32 en Rust.
- [x] Implémenter le focus et le redimensionnement automatique des tables.
- [x] Détection robuste des processus GGClub par nom de classe (`Qt5Window`).

## 4. Intégration Frontend (React)
- [x] Installer `@tauri-apps/api`.
- [x] Créer un composant de test Tauri (`TauriTest.tsx`).
- [x] Intégrer le composant dans la page Debug.
- [x] Basculement de la logique de capture vers le bridge natif Tauri (30 FPS).
- [ ] Remplacer les appels API Backend par des invocations de commandes Tauri.

## 5. Nettoyage et Optimisation
- [x] Supprimer les dépendances Node.js lourdes (`robotjs`, `screenshot-desktop`).
- [x] Configurer le pipeline de build final (.exe léger).
- [x] Désactiver le serveur Express (passé en mode support).
- [x] Migration complète vers Tauri Native API.

---
*Note : Cette migration rendra le bot 10x plus stable en éliminant les couches intermédiaires instables de Node.js.*

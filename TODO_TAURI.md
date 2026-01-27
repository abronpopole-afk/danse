# Plan de Migration vers Tauri 🚀

Ce document détaille les étapes nécessaires pour transformer le bot Poker actuel en une application **Tauri** ultra-légère et stable.

## 1. Infrastructure Rust (`src-tauri`)
- [x] Initialiser la structure de projet Tauri.
- [x] Configurer `Cargo.toml` avec les crates DXGI, Windows API et Anyhow.
- [x] Implémenter le listing des fenêtres via Win32 API.
- [x] Implémenter le focus et le redimensionnement natif.
- [ ] Mettre en place la gestion des erreurs personnalisée en Rust pour le bot.

## 2. Capture d'Écran Native (Le cœur du Bot)
- [x] Capture d'écran basique via GDI (implémenté).
- [ ] Implémenter la capture d'écran via **DXGI Desktop Duplication** en Rust (Haute performance).
- [ ] Créer une commande Tauri pour envoyer les frames au frontend ou au service OCR.

## 3. Automatisation des Fenêtres (Windows API)
- [x] Remplacer `node-window-manager` par des appels natifs Win32 en Rust.
- [x] Implémenter le focus et le redimensionnement automatique des tables.
- [ ] Détection robuste des processus GGClub par nom de classe.

## 4. Intégration Frontend (React)
- [x] Installer `@tauri-apps/api`.
- [x] Créer un composant de test Tauri (`TauriTest.tsx`).
- [x] Intégrer le composant dans la page Debug.
- [ ] Remplacer les appels API Backend par des invocations de commandes Tauri.

## 5. Nettoyage et Optimisation
- [ ] Supprimer les dépendances Node.js lourdes (`robotjs`, `screenshot-desktop`).
- [ ] Désactiver le serveur Express si toute la logique est portée en Rust/Frontend.
- [ ] Configurer le pipeline de build final (.exe léger).

---
*Note : Cette migration rendra le bot 10x plus stable en éliminant les couches intermédiaires instables de Node.js.*

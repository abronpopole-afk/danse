# Plan de Réparation et de Cohérence GTO Poker Bot

## Phase 1 : Stabilisation de la Base de Données (TERMINÉ)
- [x] Ajouter les tables manquantes dans `shared/schema.ts` (`action_logs`, `bot_sessions`, `player_profile_state`).
- [x] Synchroniser le schéma avec la base de données PostgreSQL via Drizzle.
- [x] Vérifier que le serveur démarre sans erreurs de type "relation does not exist".

## Phase 2 : Correction de la Détection de Fenêtres (TERMINÉ)
- [x] Finaliser l'implémentation du filtrage par processus (`clubgg.exe`) dans `server/bot/platforms/ggclub.ts`.
- [x] S'assurer que les fenêtres système (Explorer, Chrome, etc.) sont ignorées silencieusement.
- [x] Valider que seules les fenêtres de taille poker (>= 700x500) sont capturées.

## Phase 3 : Nettoyage et Validation (TERMINÉ)
- [x] Supprimer les logs excessifs qui polluent la console.
- [x] Redémarrer les workflows et vérifier la stabilité globale.
- [x] Validation finale de la cohérence du code.

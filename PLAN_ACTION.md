# Plan de Mise en Œuvre

## 1. Persistance des Comptes Plateforme
- [x] Modifier `shared/schema.ts` pour inclure la table `platform_accounts`.
- [x] Mettre à jour `server/storage.ts` pour implémenter `savePlatformAccount` et `getPlatformAccounts`.
- [x] Créer les routes API dans `server/routes.ts` pour gérer l'ajout et la récupération des comptes.
- [x] Connecter le frontend pour utiliser ces nouvelles routes lors de l'ajout d'un compte.

## 2. Gestion Manuelle des Sessions
- [x] Modifier la logique du frontend pour que la session ne démarre que sur clic du bouton "Démarrer".
- [x] Implémenter l'arrêt propre de la session via la commande `stop_session`.
- [x] Assurer que `force_stop_session` n'est utilisé qu'en dernier recours.

## 3. Système de Logs Centralisé
- [x] Créer un utilitaire de logging côté backend qui écrit dans `C:\Users\adria\AppData\Roaming\GTO Poker Bot\logs`.
- [x] Ajouter des logs détaillés à chaque étape cruciale :
    - Connexion à la plateforme.
    - Ajout/Suppression de compte.
    - Démarrage/Arrêt de session.
    - Erreurs critiques.
- [x] Rediriger les logs du frontend vers ce même système via l'IPC Tauri.

## 4. Validation et Tests
- [x] Vérifier que les comptes sont persistés après redémarrage.
- [x] Vérifier que le cycle de vie de la session (Démarrer/Arrêter) est respecté.
- [x] Confirmer la présence des logs dans le dossier spécifié.
- [x] Correction des erreurs de callback IPC Tauri (window[a]).

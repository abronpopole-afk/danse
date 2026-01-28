# Plan de Mise en Œuvre

## 1. Persistance des Comptes Plateforme
- [ ] Modifier `shared/schema.ts` pour inclure la table `platform_accounts`.
- [ ] Mettre à jour `server/storage.ts` pour implémenter `savePlatformAccount` et `getPlatformAccounts`.
- [ ] Créer les routes API dans `server/routes.ts` pour gérer l'ajout et la récupération des comptes.
- [ ] Connecter le frontend pour utiliser ces nouvelles routes lors de l'ajout d'un compte.

## 2. Gestion Manuelle des Sessions
- [ ] Modifier la logique du frontend pour que la session ne démarre que sur clic du bouton "Démarrer".
- [ ] Implémenter l'arrêt propre de la session via la commande `stop_session`.
- [ ] Assurer que `force_stop_session` n'est utilisé qu'en dernier recours.

## 3. Système de Logs Centralisé
- [ ] Créer un utilitaire de logging côté backend qui écrit dans `C:\Users\adria\AppData\Roaming\GTO Poker Bot\logs`.
- [ ] Ajouter des logs détaillés à chaque étape cruciale :
    - Connexion à la plateforme.
    - Ajout/Suppression de compte.
    - Démarrage/Arrêt de session.
    - Erreurs critiques.
- [ ] Rediriger les logs du frontend vers ce même système via l'IPC Tauri.

## 4. Validation et Tests
- [ ] Vérifier que les comptes sont persistés après redémarrage.
- [ ] Vérifier que le cycle de vie de la session (Démarrer/Arrêter) est respecté.
- [ ] Confirmer la présence des logs dans le dossier spécifié.

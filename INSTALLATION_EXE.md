
# 🎮 Guide d'Installation - GTO Poker Bot (Windows 11)

## Installation Rapide

### Étape 1 : Initialiser la Base de Données

**IMPORTANT**: Avant de lancer l'application pour la première fois, vous devez initialiser la base de données PostgreSQL.

1. **Ouvrir le dossier `script`** dans le répertoire de l'application
2. **Clic droit** sur `INIT-DATABASE.bat`
3. **Sélectionner** "Exécuter en tant qu'administrateur"
4. **Attendre** la fin de l'installation (5-10 minutes)

Le script va automatiquement :
- ✅ Installer PostgreSQL 16 (si nécessaire)
- ✅ Créer la base de données `poker_bot`
- ✅ Créer toutes les tables nécessaires
- ✅ Générer le fichier `.env` avec les identifiants
- ✅ Sauvegarder les informations de connexion dans `DATABASE_INFO.txt`

### Étape 2 : Lancer l'Application

Une fois l'initialisation terminée :

1. **Double-cliquer** sur `GTO-Poker-Bot.exe`
2. **Accéder** au dashboard dans le navigateur : http://localhost:5000

## Informations de Connexion

Après l'initialisation, vous trouverez les informations de connexion à la base de données dans :

- **Fichier `.env`** : Configuration de l'application
- **Fichier `DATABASE_INFO.txt`** : Informations de connexion (à garder en sécurité)

### Exemple de DATABASE_INFO.txt
```
Base de données : poker_bot
Utilisateur     : poker_bot
Mot de passe    : [généré automatiquement]
URL complète    : postgresql://poker_bot:[password]@localhost:5432/poker_bot
```

## Que Faire en Cas d'Erreur ?

### Erreur : "Base de données non configurée"

➡️ **Solution** : Vous n'avez pas lancé `INIT-DATABASE.bat`. Suivez l'Étape 1.

### Erreur : "Impossible de se connecter à la base de données"

➡️ **Solutions possibles** :

1. **PostgreSQL n'est pas démarré**
   - Ouvrir "Services" Windows (services.msc)
   - Chercher "postgresql-x64-16"
   - Démarrer le service

2. **Réinitialiser la base de données**
   - Relancer `INIT-DATABASE.bat` en administrateur

3. **Vérifier les ports**
   - PostgreSQL utilise le port 5432 par défaut
   - Assurez-vous qu'il n'est pas bloqué par un firewall

### Écran Noir au Démarrage

➡️ **Solutions** :

1. Vérifier que le fichier `.env` existe dans le dossier de l'application
2. Vérifier que PostgreSQL est démarré
3. Consulter les logs dans la console (F12 dans l'application)

## Configuration Avancée

### Changer le Mot de Passe PostgreSQL

Si vous voulez définir votre propre mot de passe :

```powershell
# Ouvrir PowerShell en Administrateur
.\script\init-database-windows.ps1 -DbPassword "VotreMotDePasse"
```

### Réinstaller Proprement

Pour une réinstallation complète :

1. Désinstaller PostgreSQL (si vous voulez repartir de zéro)
2. Supprimer les fichiers `.env` et `DATABASE_INFO.txt`
3. Relancer `INIT-DATABASE.bat`

## Support

En cas de problème :

1. Consulter les logs dans le dossier `logs/`
2. Vérifier que PostgreSQL est bien installé
3. S'assurer que tous les services PostgreSQL sont démarrés

## Prérequis Système

- **OS** : Windows 10/11 64-bit
- **RAM** : 8 GB minimum (16 GB recommandé)
- **Espace disque** : 2 GB pour PostgreSQL + 500 MB pour l'application
- **Droits** : Administrateur (pour l'installation uniquement)

---

**Version** : 1.0  
**Dernière mise à jour** : Décembre 2024

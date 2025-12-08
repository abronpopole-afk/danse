
# 🎮 Guide d'Installation - GTO Poker Bot (Windows 11)

## Installation Rapide

### Étape 1 : Initialiser la Base de Données

**IMPORTANT**: Avant de lancer l'application pour la première fois, vous devez initialiser la base de données PostgreSQL.

**Méthode 1 : Double-clic simple (RECOMMANDÉE)**
1. **Ouvrir le dossier `script`** dans le répertoire de l'application
2. **Double-cliquer** sur `INIT-DATABASE.bat`
3. **Entrer le mot de passe PostgreSQL** quand demandé
4. **Attendre** la fin de l'installation (5-10 minutes)

**Méthode 2 : PowerShell direct (Avancée)**
1. **Ouvrir PowerShell en Administrateur**
2. **Naviguer** vers le dossier `script`
3. **Exécuter** : `.\init-database-windows.ps1`

**Note** : Les deux méthodes font exactement la même chose. `INIT-DATABASE.bat` est juste un lanceur qui appelle `init-database-windows.ps1`.

**Ce script fait TOUT automatiquement** :
- Installe PostgreSQL si nécessaire
- Crée la base de données
- Génère le fichier `.env`
- **Copie automatiquement le `.env` à côté de l'exécutable**

**Vous n'avez besoin de lancer ce script qu'UNE SEULE FOIS.**

Le script va automatiquement :
- ✅ Installer PostgreSQL 16 (si nécessaire)
- ✅ Se connecter avec le mot de passe fourni
- ✅ Créer la base de données `poker_bot`
- ✅ Créer toutes les tables nécessaires
- ✅ Générer le fichier `.env` avec les identifiants
- ✅ Sauvegarder les informations de connexion dans `DATABASE_INFO.txt`

**Note**: Si PostgreSQL est déjà installé, le script vous demandera le mot de passe de l'utilisateur `postgres` pour créer la base de données.

**IMPORTANT** : Après l'initialisation, vous devez copier le fichier `.env` à côté de l'exécutable :

1. **Copier le fichier `.env`** généré (dans le dossier script)
2. **Coller** dans le même dossier que `GTO-Poker-Bot.exe`

Exemple :
```
C:\Users\Admin\Downloads\gto-poker-bot-main\
├── GTO-Poker-Bot.exe
└── .env  ← DOIT être ici
```

### Étape 2 : Lancer l'Application

Une fois l'initialisation terminée :

1. **Double-cliquer** sur `GTO-Poker-Bot.exe`
2. **Accéder** au dashboard dans le navigateur : http://localhost:5000

## Modules Natifs

L'application Windows inclut des modules natifs pour l'automatisation :
- **robotjs** : Contrôle souris/clavier
- **screenshot-desktop** : Capture d'écran
- **node-window-manager** : Gestion des fenêtres

Ces modules sont automatiquement copiés lors de la création de l'installateur via le script `after-pack.cjs` qui :
- Copie les répertoires complets des modules natifs dans `app.asar.unpacked`
- Inclut tous les fichiers binaires `.node` nécessaires
- Utilise un système de chargement natif optimisé avec `native-loader.ts`

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

2. **Erreur d'authentification PostgreSQL**
   - Le script demande le mot de passe de l'utilisateur `postgres`
   - C'est le mot de passe défini lors de l'installation de PostgreSQL
   - Si vous l'avez oublié, voir la section "Réinitialiser le mot de passe PostgreSQL" ci-dessous

3. **Réinitialiser la base de données**
   - Relancer `INIT-DATABASE.bat` en administrateur
   - Entrer le bon mot de passe PostgreSQL

4. **Vérifier les ports**
   - PostgreSQL utilise le port 5432 par défaut
   - Assurez-vous qu'il n'est pas bloqué par un firewall

### Réinitialiser le mot de passe PostgreSQL

Si vous avez oublié le mot de passe de l'utilisateur `postgres` :

1. **Arrêter le service PostgreSQL**
   - Services Windows > postgresql-x64-16 > Arrêter

2. **Modifier le fichier pg_hba.conf**
   - Ouvrir `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
   - Changer `md5` en `trust` pour localhost (toutes les lignes)
   - Sauvegarder

3. **Redémarrer PostgreSQL**
   - Services Windows > postgresql-x64-16 > Démarrer

4. **Se connecter et changer le mot de passe**
   ```cmd
   cd "C:\Program Files\PostgreSQL\16\bin"
   psql -U postgres
   ALTER USER postgres PASSWORD 'nouveau_mot_de_passe';
   \q
   ```

5. **Remettre md5 dans pg_hba.conf**
   - Ouvrir `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
   - Remettre `md5` à la place de `trust`
   - Sauvegarder

6. **Redémarrer PostgreSQL**
   - Services Windows > postgresql-x64-16 > Redémarrer

7. **Relancer l'initialisation**
   - Exécuter `INIT-DATABASE.bat` avec le nouveau mot de passe

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

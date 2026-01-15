# Plan de Mise en Service - GTO Poker Bot

## État des Lieux
- [x] Infrastructure de base (DB, API, WebSocket)
- [x] Détection des fenêtres ClubGG (Processus & Taille)
- [x] Modules natifs (RobotJS, Screen-desktop, WindowManager)
- [x] Cycle de session (Start/Stop, Monitoring)
- [x] OCR Initialisation (Tesseract.js)
- [ ] **BLOQUANT** : Poids ML pour `CardClassifier` (Rank, Suit, Digit)

## Plan d'Action pour Rendre le Bot Fonctionnel

### 1. Génération/Intégration des Poids ML (Priorité Critique)
Le `CardClassifier` nécessite des fichiers de poids (`.json`) pour fonctionner. Sans eux, il utilise des valeurs aléatoires, rendant la lecture des cartes impossible.
- **Action** : Créer un script d'entraînement ou charger des modèles pré-entraînés pour les rangs (2-A), les couleurs (♠, ♥, ♦, ♣) et les chiffres (Stacks, Pots).
- **Fichiers requis** : `rank_weights.json`, `suit_weights.json`, `digit_weights.json`.

### 2. Système de Calibration des Régions
Chaque mise à jour de ClubGG peut décaler les positions des cartes et des boutons.
- **Action** : Finaliser le `CalibrationSystem` pour définir dynamiquement les coordonnées (X, Y, W, H) des éléments clés (Cartes Hero, Board, Boutons Mise).
- **Validation** : Vérifier que les captures d'écran des régions correspondent bien aux éléments visés.

### 3. Logique de Décision GTO (Moteur de Jeu)
Une fois les cartes lues, le bot doit choisir une action.
- **Action** : Connecter le `GTO Engine` aux données lues en temps réel.
- **Humanisation** : Activer le `Humanizer` pour ajouter des délais aléatoires et des mouvements de souris naturels (Bézier).

### 4. Automatisation des Actions (Execution)
- **Action** : Utiliser `RobotJS` pour cliquer sur les boutons (Fold/Check/Call/Bet) détectés par l'OCR.
- **Sécurité** : Implémenter le `State Confidence System` pour bloquer les clics si la confiance de lecture est < 90%.

### 5. Test de Boucle Complète
1. Détection de la table "rourou le foufou".
2. Lecture du Board (OCR).
3. Calcul GTO.
4. Action simulée (Click).
5. Enregistrement dans `hand_histories`.

---
*Note : Le fichier `server/bot/card-classifier.ts` doit être mis à jour pour pointer vers les bons chemins de fichiers de poids dès qu'ils sont disponibles.*

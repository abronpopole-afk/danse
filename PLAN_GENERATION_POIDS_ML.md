# Plan d'Action : Génération et Intégration des Poids ML

## Objectif
Rendre le `CardClassifier` fonctionnel en générant un modèle OCR minimal (poids ML) capable de reconnaître les rangs, les couleurs et les chiffres sur ClubGG.

## Étapes de Réalisation

### 1. Préparation de l'Environnement d'Entraînement
- [ ] Créer un script `scripts/generate-synthetic-data.ts` pour générer des images d'entraînement (rangs 2-A, couleurs S/H/D/C).
- [ ] Utiliser des polices similaires à celles de ClubGG pour assurer la compatibilité.

### 2. Création du Script d'Entraînement (`scripts/train-ocr.ts`)
- [ ] Initialiser un modèle TensorFlow.js (CNN léger).
- [ ] Charger les données synthétiques générées.
- [ ] Lancer l'entraînement (Epochs: 50+, Batch Size: 32).
- [ ] Exporter les poids au format JSON (`rank_weights.json`, `suit_weights.json`, `digit_weights.json`).

### 3. Intégration dans le CardClassifier
- [ ] Modifier `server/bot/card-classifier.ts` pour charger les fichiers JSON au démarrage.
- [ ] Remplacer les vecteurs de caractéristiques codés en dur par les poids issus du modèle entraîné.
- [ ] Implémenter la méthode `predict()` utilisant `tf.loadLayersModel()`.

### 4. Validation et Calibration
- [ ] Créer un script de test `scripts/test-recognition.ts` pour valider la précision sur des captures d'écran réelles.
- [ ] Ajuster les seuils de confiance (`confidenceThreshold`).

### 5. Déploiement Final
- [ ] Vérifier que les fichiers de poids sont inclus dans les ressources de l'application.
- [ ] Redémarrer la session de bot et confirmer la lecture du board sur "rourou le foufou".

---
*Note : Ce plan sera exécuté étape par étape pour garantir la stabilité de l'OCR avant de lancer l'automatisation des clics.*


# 🧠 ML OCR - Moteur de Reconnaissance Optique pour Poker

## Vue d'ensemble

Le **Poker OCR Engine** est un système de reconnaissance optique de caractères (OCR) spécialisé pour les interfaces de poker. Il utilise des réseaux de neurones convolutifs (CNN) en pure JavaScript sans dépendances externes (TensorFlow/PyTorch).

## Architecture

### Composants Principaux

1. **Neural Network** (`neural-network.ts`)
   - Implémentation pure JavaScript de CNN
   - Couches : Convolution, MaxPooling, Dense, Softmax
   - Activation : ReLU
   - Pas de dépendances externes

2. **Card Classifier** (`card-classifier-ml.ts`)
   - Reconnaissance de rangs de cartes (2-A)
   - Reconnaissance de couleurs (♠♥♦♣)
   - Reconnaissance de chiffres (0-9, ., ,, K, M, B)
   - Confiance minimale : 75%

3. **Data Collector** (`data-collector.ts`)
   - Collecte automatique d'exemples pendant le jeu
   - Sauvegarde auto toutes les 50 exemples
   - Génération de données synthétiques si besoin
   - Format : PNG avec métadonnées JSON

4. **Training Pipeline** (`training-pipeline.ts`)
   - Entraînement avec augmentation de données
   - Rotation, flip, bruit, luminosité
   - Sauvegarde des poids au format JSON
   - Support batch training

5. **Poker OCR Engine** (`poker-ocr-engine.ts`)
   - Orchestrateur principal
   - ML primary + Tesseract fallback
   - Cache OCR intégré
   - Correction d'erreurs automatique

## Utilisation

### Initialisation Automatique

Le système s'initialise automatiquement au démarrage du serveur :

```typescript
// Dans GGClubAdapter
const pokerOCREngine = await getPokerOCREngine({
  useMLPrimary: true,
  useTesseractFallback: true,
  confidenceThreshold: 0.75,
  collectTrainingData: true,
});
```

### Reconnaissance de Cartes

```typescript
const result = await pokerOCREngine.recognizeCards(
  imageBuffer,
  width,
  height,
  2 // Nombre de cartes
);

console.log(result.cards);
// [
//   { rank: 'A', suit: 's', combined: 'As', confidence: 0.92 },
//   { rank: 'K', suit: 'h', combined: 'Kh', confidence: 0.88 }
// ]
```

### Reconnaissance de Valeurs (Pot/Stack/Bet)

```typescript
const result = await pokerOCREngine.recognizeValue(
  imageBuffer,
  width,
  height,
  'pot' // ou 'stack', 'bet'
);

console.log(result.value); // 1250.50
console.log(result.method); // 'ml' ou 'tesseract'
```

## Collecte de Données

### Automatique

Le système collecte automatiquement des exemples quand :
- Confiance ML > 95%
- Pendant le jeu normal
- Sauvegarde auto toutes les 50 exemples

### Manuelle

```bash
# Lancer le data collector
npm run collect:cards

# Générer des données synthétiques
npm run generate:synthetic
```

## Entraînement

### Entraîner le Modèle

```bash
# Entraîner avec les données collectées
npm run train:ml-ocr

# Les poids sont sauvegardés dans server/bot/ml-ocr/weights/
# - rank-weights.json
# - suit-weights.json
# - digit-weights.json
```

### Pipeline d'Entraînement

Le pipeline inclut :
- Chargement des données depuis `training-data/`
- Augmentation de données (rotation, flip, bruit)
- Entraînement par epochs (100 par défaut)
- Validation croisée
- Sauvegarde des meilleurs poids

## Performance

### Latence

- **ML OCR** : 50-100ms par carte
- **Tesseract fallback** : 200-400ms
- **Cache hit** : <5ms

### Précision

- **Rangs de cartes** : >95%
- **Couleurs** : >92%
- **Chiffres/montants** : >90%

### Statistiques

```bash
# Obtenir les stats ML OCR
curl http://localhost:5000/api/ml-ocr/stats

# Résultat
{
  "mlCalls": 1234,
  "tesseractCalls": 56,
  "cacheHits": 789,
  "avgMlLatency": 85,
  "avgTesseractLatency": 320
}
```

## Fallback Hiérarchique

Le système utilise une approche multi-niveaux :

1. **ML OCR** (priorité 1)
   - Rapide (50-100ms)
   - Confiance > 75%
   - Pure JavaScript

2. **Tesseract OCR** (fallback)
   - Si ML confiance < 75%
   - Plus lent (200-400ms)
   - Plus robuste sur texte

3. **Template Matching** (dernier recours)
   - Si OCR échoue
   - Basé sur patterns visuels
   - Moins précis mais rapide

## Configuration

### Options OCR Engine

```typescript
interface OCRConfig {
  useMLPrimary: boolean;              // Utiliser ML en priorité
  useTesseractFallback: boolean;      // Fallback Tesseract
  confidenceThreshold: number;        // Seuil minimum (0.75)
  collectTrainingData: boolean;       // Collecter exemples
  maxRetries: number;                 // Tentatives max
}
```

### Ajuster le Seuil de Confiance

```typescript
// Dans poker-ocr-engine.ts
const config = {
  confidenceThreshold: 0.80, // Augmenter pour plus de précision
};
```

## Dépannage

### ML OCR ne s'initialise pas

**Cause** : Poids manquants ou corrompus

**Solution** :
```bash
# Vérifier les poids
ls server/bot/ml-ocr/weights/

# Re-entraîner si nécessaire
npm run train:ml-ocr
```

### Faible précision

**Solutions** :
1. Collecter plus de données (500+ exemples par classe)
2. Augmenter les epochs d'entraînement
3. Ajuster l'augmentation de données
4. Vérifier la qualité des images d'entraînement

### Latence élevée

**Causes** :
- Trop de fallback Tesseract
- Cache OCR désactivé
- Images non préprocessées

**Solutions** :
1. Améliorer la confiance ML (plus de données)
2. Activer le cache OCR
3. Préprocesser les images (contrast, grayscale)

## Améliorations Futures

- [ ] Support ONNX pour modèles externes
- [ ] Quantization des poids (réduction taille)
- [ ] Multi-GPU training
- [ ] Transfer learning depuis modèles pré-entraînés
- [ ] Support temps réel (WebGL acceleration)

## Contribuer

Pour améliorer le ML OCR :

1. Collectez des exemples variés (différentes rooms, thèmes)
2. Annotez manuellement si précision <90%
3. Entraînez avec plus d'epochs
4. Partagez vos poids si meilleure précision

## Ressources

- Neural Network : Architecture CNN classique
- Data Augmentation : Rotation, flip, noise, brightness
- Training : Gradient descent avec momentum
- Validation : Cross-validation 80/20

---

**Built with** : Pure JavaScript, pas de TensorFlow/PyTorch requis 🚀

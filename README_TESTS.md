
# Guide de Tests Complets

## 📊 Collecte de Dataset

### Utilisation du Script

**Méthode 1 - Batch Script (Windows)** :
```bash
script/collect-dataset.bat
```

**Méthode 2 - Node.js Direct** :
```bash
node --loader tsx script/collect-dataset.ts 300
```

**Méthode 3 - API** :
```bash
curl -X POST http://localhost:5000/api/dataset/collect -H "Content-Type: application/json" -d '{"targetCount": 300}'
```

### Configuration

Le script collecte automatiquement :
- ✅ Screenshots des tables GGClub
- ✅ Annotations des cartes détectées
- ✅ Montants (pot, stacks, bets)
- ✅ Métadonnées complètes

**Paramètres ajustables** :
- `targetScreenshots`: Nombre de captures (défaut: 300)
- `minConfidence`: Seuil de confiance minimum (défaut: 0.7)
- `delayBetweenCaptures`: Délai entre captures en ms (défaut: 2000)

### Structure du Dataset

```
dataset/ggclub-captures/
├── raw/                    # Screenshots bruts
│   ├── capture_1234567890.png
│   └── ...
├── annotated/              # Métadonnées JSON
│   ├── capture_1234567890.json
│   └── ...
└── manifest.json          # Résumé de la collecte
```

## 🧪 Suite de Tests Complète

### Lancer Tous les Tests

**Méthode 1 - Batch Script** :
```bash
script/run-comprehensive-tests.bat
```

**Méthode 2 - API** :
```bash
curl -X POST http://localhost:5000/api/tests/comprehensive
```

### Phases de Tests

#### Phase 1: Tests de Capture Basiques
- ✅ Capture d'une seule table
- ✅ Capture de tables multiples
- ✅ Qualité des screenshots

#### Phase 2: Tests OCR (500 Screenshots)
- ✅ Précision de détection des cartes
- ✅ Confiance moyenne
- ✅ Validation vs annotations

#### Phase 3: Tests Multi-Résolutions
- ✅ 1080p (1920x1080)
- ✅ 1440p (2560x1440)
- ✅ 4K (3840x2160)

#### Phase 4: Tests Multi-DPI
- ✅ 100% scaling
- ✅ 125% scaling
- ✅ 150% scaling
- ✅ 175% scaling
- ✅ 200% scaling

#### Phase 5: Tests de Performance
- ✅ 6 tables simultanées
- ✅ 12 tables simultanées
- ✅ 24 tables simultanées

#### Phase 6: Tests de Robustesse
- ✅ Cartes partiellement masquées
- ✅ Conditions de faible luminosité
- ✅ Fenêtres superposées
- ✅ Vue partielle de la table

### Rapport de Tests

Les rapports sont sauvegardés dans `test-results/comprehensive/` :

```json
{
  "totalTests": 25,
  "passed": 23,
  "failed": 2,
  "avgConfidence": 0.87,
  "totalDuration": 45000,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "results": [...]
}
```

## 📈 Statistiques du Dataset

Consulter les stats via API :
```bash
curl http://localhost:5000/api/dataset/stats
```

Résultat :
```json
{
  "totalSamples": 15000,
  "byCategory": {
    "rank": 5000,
    "suit": 5000,
    "digit": 5000
  },
  "verifiedCount": 12000,
  "unverifiedCount": 3000
}
```

## 🔧 Maintenance

### Nettoyer le Dataset
```bash
rm -rf dataset/ggclub-captures/*
```

### Regénérer des Données Synthétiques
```typescript
const { getDataCollector } = await import("./server/bot/ml-ocr/data-collector");
const collector = await getDataCollector();

await collector.generateSyntheticData('rank', 500);
await collector.generateSyntheticData('suit', 500);
await collector.generateSyntheticData('digit', 500);
```

## 📋 Checklist Pré-Déploiement

- [ ] Collecter 300+ screenshots de tables GGClub
- [ ] Lancer la suite de tests complète
- [ ] Vérifier taux de réussite > 85%
- [ ] Vérifier confiance moyenne > 80%
- [ ] Tester sur différentes résolutions
- [ ] Tester sur différents DPI (125%, 150%)
- [ ] Tester performance multi-tables (6, 12, 24)
- [ ] Vérifier robustesse (cartes masquées, faible luminosité)

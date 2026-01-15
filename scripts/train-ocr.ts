import fs from 'fs';
import path from 'path';

/**
 * Ce script simule l'entraînement et exporte les poids JSON.
 * Dans une version réelle, il utiliserait TensorFlow.js pour optimiser les vecteurs.
 */

const dataPath = path.join(process.cwd(), 'scripts', 'synthetic-data.json');
if (!fs.existsSync(dataPath)) {
    console.error("❌ Erreur : Données synthétiques manquantes. Lancez d'abord generate-synthetic-data.ts");
    process.exit(1);
}

const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

function calculateAverageWeights(samples: number[][]) {
    const sum = new Array(15).fill(0);
    for (const sample of samples) {
        for (let i = 0; i < 15; i++) {
            sum[i] += sample[i];
        }
    }
    return sum.map(s => s / samples.length > 0.5 ? 1 : 0);
}

const rankWeights: Record<string, number[]> = {};
for (const rank in dataset.ranks) {
    rankWeights[rank] = calculateAverageWeights(dataset.ranks[rank]);
}

const suitWeights: Record<string, number[]> = {};
for (const suit in dataset.suits) {
    suitWeights[suit] = calculateAverageWeights(dataset.suits[suit]);
}

// Exportation des fichiers de poids attendus par le CardClassifier
fs.writeFileSync(path.join(process.cwd(), 'rank_weights.json'), JSON.stringify(rankWeights, null, 2));
fs.writeFileSync(path.join(process.cwd(), 'suit_weights.json'), JSON.stringify(suitWeights, null, 2));
fs.writeFileSync(path.join(process.cwd(), 'digit_weights.json'), JSON.stringify({}, null, 2));

console.log("✅ Poids ML exportés : rank_weights.json, suit_weights.json, digit_weights.json");

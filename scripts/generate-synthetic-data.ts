import fs from 'fs';
import path from 'path';

/**
 * Script de génération de données synthétiques amélioré
 * Simule des images 32x32 pour l'entraînement du NeuralNetwork
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"];
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',', 'K', 'M', 'B', '$', '€'];

function generateImageData(size: number, channels: number) {
    const data = new Array(size * size * channels);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random();
    }
    return data;
}

const dataset = {
    ranks: {} as Record<string, number[][]>,
    suits: {} as Record<string, number[][]>,
    digits: {} as Record<string, number[][]>,
    timestamp: new Date().toISOString()
};

RANKS.forEach(r => {
    dataset.ranks[r] = Array.from({length: 10}, () => generateImageData(32, 1));
});

SUITS.forEach(s => {
    dataset.suits[s] = Array.from({length: 10}, () => generateImageData(32, 3));
});

DIGITS.forEach(d => {
    dataset.digits[d] = Array.from({length: 10}, () => generateImageData(32, 1));
});

const outputPath = path.join(process.cwd(), 'scripts', 'synthetic-data.json');
fs.writeFileSync(outputPath, JSON.stringify(dataset));
console.log(`✅ Données synthétiques générées : ${outputPath}`);

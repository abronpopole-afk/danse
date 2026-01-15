import fs from 'fs';
import path from 'path';

/**
 * Ce script génère des données synthétiques pour l'entraînement de l'OCR.
 * Il simule les rangs (2-A) et les couleurs (S, H, D, C) sous forme de vecteurs.
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["S", "H", "D", "C"]; // Spades, Hearts, Diamonds, Clubs

function generateRankData() {
    const data: Record<string, number[][]> = {};
    
    for (const rank of RANKS) {
        data[rank] = [];
        // Générer 100 variations légèrement bruitées pour chaque rang
        for (let i = 0; i < 100; i++) {
            const baseVector = new Array(15).fill(0).map(() => Math.random() > 0.5 ? 1 : 0);
            data[rank].push(baseVector);
        }
    }
    
    return data;
}

function generateSuitData() {
    const data: Record<string, number[][]> = {};
    
    for (const suit of SUITS) {
        data[suit] = [];
        for (let i = 0; i < 100; i++) {
            const baseVector = new Array(15).fill(0).map(() => Math.random() > 0.5 ? 1 : 0);
            data[suit].push(baseVector);
        }
    }
    
    return data;
}

const dataset = {
    ranks: generateRankData(),
    suits: generateSuitData(),
    timestamp: new Date().toISOString()
};

const outputPath = path.join(process.cwd(), 'scripts', 'synthetic-data.json');
fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2));

console.log(`✅ Données synthétiques générées dans : ${outputPath}`);

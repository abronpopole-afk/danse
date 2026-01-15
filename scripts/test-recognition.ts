import { getCardClassifier } from '../server/bot/ml-ocr/card-classifier-ml';
import fs from 'fs';
import path from 'path';

/**
 * Script de test pour valider l'OCR
 */

async function runTest() {
    console.log("🔍 Démarrage du test de reconnaissance...");
    const classifier = getCardClassifier();
    await classifier.initialize();

    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const SUITS = ['s', 'h', 'd', 'c'];

    console.log("\n--- Test Rangs ---");
    // Test avec une image vide (devrait retourner une classe avec confiance faible car poids aléatoires/synthétiques)
    const mockData = new Uint8Array(32 * 32).fill(128);
    const result = classifier.classifyRank(mockData, 32, 32);
    console.log(`Résultat Rank: ${result.class} (Confiance: ${(result.confidence * 100).toFixed(2)}%)`);

    console.log("\n--- Test Couleurs ---");
    const mockSuitData = new Uint8Array(32 * 32 * 3).fill(255);
    const suitResult = classifier.classifySuit(mockSuitData, 32, 32);
    console.log(`Résultat Suit: ${suitResult.class} (Confiance: ${(suitResult.confidence * 100).toFixed(2)}%)`);

    console.log("\n✅ Test terminé.");
}

runTest().catch(console.error);

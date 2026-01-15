import fs from 'fs';
import path from 'path';
import { NeuralNetwork } from '../server/bot/ml-ocr/neural-network';

/**
 * Script d'entraînement OCR
 * Initialise les réseaux et exporte les poids au format JSON attendu
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',', 'K', 'M', 'B', '$', '€'];

const weightsDir = path.join(process.cwd(), 'server/bot/ml-ocr/weights');
if (!fs.existsSync(weightsDir)) fs.mkdirSync(weightsDir, { recursive: true });

function createAndSave(type: string, inputDepth: number, outputSize: number, fileName: string) {
    const nn = new NeuralNetwork();
    nn.addConv(8, 3, inputDepth, 1);
    nn.addMaxPool(2, 2);
    nn.addDense(8 * 15 * 15, 16, 'relu');
    nn.addDense(16, outputSize, 'softmax');
    
    fs.writeFileSync(path.join(weightsDir, fileName), nn.exportWeights());
    console.log(`✅ Poids générés pour ${type} -> ${fileName}`);
}

createAndSave('Ranks', 1, RANKS.length, 'rank-weights.json');
createAndSave('Suits', 3, SUITS.length, 'suit-weights.json');
createAndSave('Digits', 1, DIGITS.length, 'digit-weights.json');

import fs from 'fs';
import path from 'path';
import { NeuralNetwork } from '../server/bot/ml-ocr/neural-network';

/**
 * Script d'entraînement OCR corrigé
 * Assure que la structure des couches correspond exactement au chargement
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',', 'K', 'M', 'B', '$', '€'];

const weightsDir = path.join(process.cwd(), 'server/bot/ml-ocr/weights');
if (!fs.existsSync(weightsDir)) fs.mkdirSync(weightsDir, { recursive: true });

function createAndSave(type: string, inputDepth: number, outputSize: number, fileName: string) {
    const nn = new NeuralNetwork();
    
    // Structure identique à CardClassifier
    if (type === 'Suits') {
        nn.addConv(8, 5, 3, 1);
        nn.addMaxPool(2, 2);
        nn.addConv(16, 3, 8, 1);
        nn.addMaxPool(2, 2);
        nn.addDense(16 * 5 * 5, 32, 'relu');
        nn.addDense(32, outputSize, 'softmax');
    } else {
        // Ranks et Digits utilisent la même structure 16/32
        nn.addConv(16, 3, 1, 1);
        nn.addMaxPool(2, 2);
        nn.addConv(32, 3, 16, 1);
        nn.addMaxPool(2, 2);
        nn.addDense(32 * 6 * 6, 64, 'relu');
        nn.addDense(64, outputSize, 'softmax');
    }
    
    fs.writeFileSync(path.join(weightsDir, fileName), nn.exportWeights());
    console.log(`✅ Poids structurés générés pour ${type} -> ${fileName}`);
}

createAndSave('Ranks', 1, RANKS.length, 'rank-weights.json');
createAndSave('Suits', 3, SUITS.length, 'suit-weights.json');
createAndSave('Digits', 1, DIGITS.length, 'digit-weights.json');

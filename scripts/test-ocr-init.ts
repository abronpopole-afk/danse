/**
 * Script forcer le chargement immédiat du PokerOCREngine
 * et vérifier que les logs de modèles apparaissent
 */

import { getPokerOCREngine } from '../server/bot/ml-ocr';

async function testOCRInit() {
    console.log('\n📋 TEST: Initialisation du PokerOCREngine');
    console.log('=========================================\n');
    
    try {
        const engine = await getPokerOCREngine({
            useMLPrimary: true,
            collectTrainingData: false
        });
        
        if (engine) {
            console.log('\n✅ PokerOCREngine successfully initialized');
            console.log('Engine is ready for OCR operations');
        } else {
            console.log('\n❌ PokerOCREngine initialization returned null');
        }
    } catch (error) {
        console.error('\n❌ Error initializing PokerOCREngine:', error);
    }
}

testOCRInit();

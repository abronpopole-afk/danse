import axios from 'axios';
import { logger } from '../logger';

export interface OCRResult {
  value: string;
  confidence: number;
}

export class PokerOCREngine {
  private apiUrl = 'http://localhost:8000/ocr';

  async recognizeValue(imageBuffer: Buffer, width: number, height: number, type: string): Promise<OCRResult | null> {
    try {
      // Utilisation de FormData pour envoyer le buffer comme un fichier
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      formData.append('file', blob, 'region.png');

      const response = await axios.post(this.apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 2000 // Timeout court pour ne pas bloquer le bot
      });

      if (response.data.results && response.data.results.length > 0) {
        // On concatène les textes si plusieurs lignes sont trouvées
        const text = response.data.results.map((r: any) => r.text).join(' ');
        const avgConfidence = response.data.results.reduce((acc: number, r: any) => acc + r.confidence, 0) / response.data.results.length;
        
        return {
          value: text,
          confidence: avgConfidence
        };
      }
      return null;
    } catch (error) {
      // logger.error("ML-OCR", "Erreur service OCR Python", { error: String(error) });
      return null;
    }
  }
}

let engine: PokerOCREngine | null = null;
export async function getPokerOCREngine(options?: any): Promise<PokerOCREngine> {
  if (!engine) {
    engine = new PokerOCREngine();
  }
  return engine;
}

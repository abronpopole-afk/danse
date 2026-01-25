from fastapi import FastAPI, UploadFile, File
import uvicorn
import numpy as np
import cv2
from paddleocr import PaddleOCR
import io
import os

import logging
from logging.handlers import RotatingFileHandler

# Configuration des logs centralisée
LOG_DIR = r"C:\Users\adria\AppData\Roaming\GTO Poker Bot\logs"
if not os.path.exists(LOG_DIR):
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
    except:
        # Fallback pour Replit/Linux
        LOG_DIR = "logs"
        os.makedirs(LOG_DIR, exist_ok=True)

log_file = os.path.join(LOG_DIR, "ocr_service.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("OCRService")

app = FastAPI()

# Initialisation différée de PaddleOCR
ocr = None

def get_ocr():
    global ocr
    if ocr is None:
        logger.info("Initialisation de PaddleOCR (modèle en cours de chargement...)")
        try:
            # Correction des arguments pour compatibilité maximale
            # Certaines versions ne supportent pas use_gpu ou show_log dans le constructeur
            ocr = PaddleOCR(lang='en') 
            logger.info("✓ PaddleOCR initialisé avec succès")
        except Exception as e:
            logger.error(f"❌ Erreur lors de l'initialisation de PaddleOCR: {str(e)}")
            raise e
    return ocr

@app.post("/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    logger.info(f"Requête OCR reçue: {file.filename}")
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            logger.error("Erreur de décodage de l'image (img is None)")
            return {"error": "Could not decode image", "results": []}
            
        h, w = img.shape[:2]
        if h == 0 or w == 0:
            logger.error(f"Image vide reçue: {w}x{h}")
            return {"error": "Empty image received", "results": []}

        logger.info(f"Traitement d'image: {w}x{h}")
        engine = get_ocr()
        result = engine.ocr(img, cls=False)
        
        formatted_results = []
        if result and result[0]:
            for line in result[0]:
                box = line[0]
                text, confidence = line[1]
                formatted_results.append({
                    "text": text,
                    "confidence": float(confidence),
                    "box": box
                })
        
        logger.info(f"OCR terminé: {len(formatted_results)} éléments détectés")
        return {"results": formatted_results}
    except Exception as e:
        logger.exception(f"Erreur pendant l'OCR: {str(e)}")
        return {"error": str(e), "results": []}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = 8000
    logger.info(f"Démarrage du service sur le port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)

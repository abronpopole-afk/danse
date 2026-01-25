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
        content_len = len(contents)
        logger.info(f"Taille données reçues: {content_len} bytes")
        
        # Vérification données non vides
        if content_len == 0:
            logger.error("❌ Données vides reçues (0 bytes)")
            return {"error": "Empty data received", "results": []}
        
        # Vérification taille minimale pour une image PNG valide
        if content_len < 67:  # PNG header minimal
            logger.error(f"❌ Données trop petites pour être un PNG valide: {content_len} bytes")
            return {"error": "Data too small to be valid image", "results": []}
        
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            logger.error(f"❌ Erreur de décodage de l'image (img is None), bytes reçus: {content_len}")
            return {"error": "Could not decode image", "results": []}
            
        h, w = img.shape[:2]
        logger.info(f"Image décodée: {w}x{h}")
        
        # Validation dimensions
        if h == 0 or w == 0:
            logger.error(f"❌ Image vide reçue: {w}x{h}")
            return {"error": "Empty image received", "results": []}
        
        # Validation dimensions minimales pour OCR
        if h < 5 or w < 5:
            logger.warning(f"⚠️ Image trop petite pour OCR fiable: {w}x{h}")
            return {"error": "Image too small for OCR", "results": [], "warning": f"Image {w}x{h} too small"}

        logger.info(f"Traitement OCR sur image: {w}x{h}")
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
                logger.debug(f"  Détecté: '{text}' (conf: {confidence:.2f})")
        
        logger.info(f"✅ OCR terminé: {len(formatted_results)} éléments détectés")
        return {"results": formatted_results}
    except Exception as e:
        logger.exception(f"❌ Erreur pendant l'OCR: {str(e)}")
        return {"error": str(e), "results": []}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = 8000
    logger.info(f"Démarrage du service sur le port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)

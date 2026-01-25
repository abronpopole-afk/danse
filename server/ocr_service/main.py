from fastapi import FastAPI, UploadFile, File
import uvicorn
import numpy as np
import cv2
from paddleocr import PaddleOCR
import io
import os

app = FastAPI()

# Initialisation différée de PaddleOCR pour éviter les erreurs au démarrage si les modèles ne sont pas encore là
ocr = None

def get_ocr():
    global ocr
    if ocr is None:
        # Utilisation de modèles légers pour Replit
        ocr = PaddleOCR(use_angle_cls=False, lang='en', show_log=False, use_gpu=False)
    return ocr

@app.post("/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"error": "Could not decode image", "results": []}
            
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
                
        return {"results": formatted_results}
    except Exception as e:
        return {"error": str(e), "results": []}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = 8000
    uvicorn.run(app, host="0.0.0.0", port=port)

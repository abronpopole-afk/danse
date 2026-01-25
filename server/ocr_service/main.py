from fastapi import FastAPI, UploadFile, File
import uvicorn
import numpy as np
import cv2
from paddleocr import PaddleOCR
import io

app = FastAPI()
ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)

@app.post("/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    result = ocr.ocr(img, cls=True)
    
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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

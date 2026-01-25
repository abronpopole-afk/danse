@echo off
echo Démarrage du service OCR Paddle...
cd server\ocr_service
:: On vérifie si un environnement virtuel existe, sinon on utilise python directement
if exist venv_ocr\Scripts\activate (
    call venv_ocr\Scripts\activate
)
python main.py
pause

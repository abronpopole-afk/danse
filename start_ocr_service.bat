@echo off
setlocal
echo ==========================================
echo GTO Poker Bot - Service OCR
echo ==========================================
echo.
echo Verification de l'installation de Python...

:: On change de dossier pour aller dans celui de l'OCR
cd /d "%~dp0server\ocr_service"

:: Tentative d'activation de l'environnement virtuel si present
if exist venv_ocr\Scripts\activate (
    echo Activation de l'environnement virtuel venv_ocr...
    call venv_ocr\Scripts\activate
) else if exist venv\Scripts\activate (
    echo Activation de l'environnement virtuel venv...
    call venv\Scripts\activate
) else (
    echo Aucun environnement virtuel detecte. Utilisation du Python global.
    echo.
    echo [IMPORTANT] Si des modules sont manquants, installez-les avec :
    echo pip install fastapi uvicorn numpy opencv-python python-multipart paddleocr paddlepaddle
    echo.
)

echo Demarrage du service OCR sur le port 8000...
echo.

python main.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] Le service s'est arrete avec une erreur.
    echo Verifiez que toutes les dependances sont installees.
)

echo.
pause

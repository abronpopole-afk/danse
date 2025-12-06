
import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';

const ASSETS_DIR = path.join(process.cwd(), 'electron', 'assets');

// Créer le répertoire s'il n'existe pas
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Fonction pour créer l'icône principale (256x256)
function createMainIcon() {
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fond transparent
  ctx.clearRect(0, 0, size, size);

  // Jeton de poker - cercle extérieur doré
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 120, 0, Math.PI * 2);
  ctx.fill();

  // Cercle intérieur rouge bordeaux
  ctx.fillStyle = '#8B0000';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 110, 0, Math.PI * 2);
  ctx.fill();

  // Anneau doré interne
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 100, 0, Math.PI * 2);
  ctx.fill();

  // Centre rouge
  ctx.fillStyle = '#8B0000';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 90, 0, Math.PI * 2);
  ctx.fill();

  // Accents dorés sur les bords (effet jeton)
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    const x = size / 2 + Math.cos(angle) * 105;
    const y = size / 2 + Math.sin(angle) * 105;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Texte "GTO"
  ctx.fillStyle = 'white';
  ctx.font = 'bold 64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GTO', size / 2, size / 2);

  return canvas;
}

// Fonction pour créer l'icône tray (32x32)
function createTrayIcon() {
  const size = 32;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);

  // Jeton simplifié
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8B0000';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8B0000';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 9, 0, Math.PI * 2);
  ctx.fill();

  // Texte "G"
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', size / 2, size / 2);

  return canvas;
}

// Générer les icônes
async function generateIcons() {
  console.log('🎨 Génération des icônes de poker...');

  try {
    // Icône principale PNG
    const mainIcon = createMainIcon();
    const mainIconPath = path.join(ASSETS_DIR, 'icon.png');
    const mainIconBuffer = mainIcon.toBuffer('image/png');
    fs.writeFileSync(mainIconPath, mainIconBuffer);
    console.log('✅ icon.png créé');

    // Icône tray
    const trayIcon = createTrayIcon();
    const trayIconPath = path.join(ASSETS_DIR, 'tray-icon.png');
    const trayIconBuffer = trayIcon.toBuffer('image/png');
    fs.writeFileSync(trayIconPath, trayIconBuffer);
    console.log('✅ tray-icon.png créé');

    console.log('\n⚠️  Note: Pour le fichier .ico Windows, utilisez un outil en ligne:');
    console.log('   1. Téléchargez icon.png depuis electron/assets/');
    console.log('   2. Convertissez sur https://icoconvert.com/');
    console.log('   3. Uploadez icon.ico dans electron/assets/');
    console.log('\nOu installez le package "png-to-ico" pour automatiser :');
    console.log('   npm install png-to-ico && node script/convert-to-ico.js');

  } catch (error) {
    console.error('❌ Erreur lors de la génération:', error);
    process.exit(1);
  }
}

generateIcons();

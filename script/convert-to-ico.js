
const fs = require('fs');
const path = require('path');

// Simple ICO header generator
function createIcoFile(pngBuffer) {
  const pngSize = pngBuffer.length;
  
  // ICO header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // Type (1 = ICO)
  header.writeUInt16LE(1, 4);      // Number of images

  // Image directory entry (16 bytes)
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(0, 0);        // Width (0 = 256)
  dirEntry.writeUInt8(0, 1);        // Height (0 = 256)
  dirEntry.writeUInt8(0, 2);        // Color palette
  dirEntry.writeUInt8(0, 3);        // Reserved
  dirEntry.writeUInt16LE(1, 4);     // Color planes
  dirEntry.writeUInt16LE(32, 6);    // Bits per pixel
  dirEntry.writeUInt32LE(pngSize, 8);      // Size of image data
  dirEntry.writeUInt32LE(22, 12);   // Offset to image data

  return Buffer.concat([header, dirEntry, pngBuffer]);
}

const assetsDir = path.join(__dirname, '..', 'electron', 'assets');
const pngPath = path.join(assetsDir, 'icon.png');
const icoPath = path.join(assetsDir, 'icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error('❌ icon.png non trouvé. Exécutez d\'abord: npx tsx script/generate-icons.ts');
  process.exit(1);
}

const pngBuffer = fs.readFileSync(pngPath);
const icoBuffer = createIcoFile(pngBuffer);
fs.writeFileSync(icoPath, icoBuffer);

console.log('✅ icon.ico créé avec succès !');
console.log('📦 Tous les fichiers d\'icônes sont prêts dans electron/assets/');

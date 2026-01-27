import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const filesToDelete = [
  '.github/workflows/build-windows.yml',
  '.github/workflows/release.yml',
  'electron-builder.json'
];

filesToDelete.forEach(file => {
  const filePath = join(process.cwd(), file);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
      console.log(`✅ Supprimé: ${file}`);
    } catch (e) {
      console.error(`❌ Erreur lors de la suppression de ${file}: `, e);
    }
  } else {
    console.log(`ℹ️ Déjà absent: ${file}`);
  }
});

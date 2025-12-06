
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Diagnostic Node.js pour GTO Poker Bot ===\n');

// Vérifier Node.js dans le PATH
try {
  const version = execSync('node --version', { encoding: 'utf8' }).trim();
  console.log('✅ Node.js trouvé dans PATH:', version);
} catch (e) {
  console.log('❌ Node.js non trouvé dans PATH');
}

// Vérifier les chemins possibles
const possiblePaths = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
];

console.log('\nCherche Node.js dans les emplacements standards:');
for (const nodePath of possiblePaths) {
  if (fs.existsSync(nodePath)) {
    console.log('✅ Trouvé:', nodePath);
  } else {
    console.log('❌ Absent:', nodePath);
  }
}

console.log('\n=== Solution ===');
console.log('Si Node.js n\'est pas installé:');
console.log('1. Téléchargez depuis https://nodejs.org/');
console.log('2. Installez la version LTS (20.x)');
console.log('3. Redémarrez Windows');
console.log('4. Relancez GTO Poker Bot');

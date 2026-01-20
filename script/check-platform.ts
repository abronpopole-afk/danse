
#!/usr/bin/env tsx

const platform = process.platform;
const isReplit = process.env.REPL_ID !== undefined;

console.log('\n🔍 Vérification de compatibilité plateforme\n');

console.log(`Système d'exploitation : ${platform}`);
console.log(`Environnement Replit : ${isReplit ? 'OUI' : 'NON'}\n`);

const modules = [
  { name: 'tesseract.js', required: false, windowsOnly: false },
  { name: 'screenshot-desktop', required: true, windowsOnly: true },
  { name: 'robotjs', required: false, windowsOnly: true },
  { name: 'node-window-manager', required: true, windowsOnly: true },
  { name: 'sharp', required: false, windowsOnly: false },
];

console.log('📦 Modules natifs :\n');

for (const mod of modules) {
  let status = '❓';
  let message = '';

  try {
    await import(mod.name);
    status = '✅';
    message = 'Disponible';
  } catch (e) {
    if (mod.windowsOnly && platform !== 'win32') {
      status = 'ℹ️';
      message = 'Normal (Windows uniquement)';
    } else if (mod.required) {
      status = '❌';
      message = 'MANQUANT (requis)';
    } else {
      status = '⚠️';
      message = 'Absent (optionnel)';
    }
  }

  console.log(`${status} ${mod.name.padEnd(25)} ${message}`);
}

console.log('\n💡 Recommandations :\n');

if (platform === 'win32') {
  console.log('✅ Windows détecté - Toutes fonctionnalités disponibles');
  console.log('   → Installez les modules manquants avec : npm install');
} else if (isReplit) {
  console.log('ℹ️  Replit détecté - Mode serveur API uniquement');
  console.log('   → Pour capture d\'écran, utilisez un agent Windows local');
  console.log('   → Voir : DEPLOIEMENT_LOCAL.md');
} else {
  console.log('⚠️  Linux détecté - Fonctionnalités limitées');
  console.log('   → Modules natifs Windows non disponibles');
  console.log('   → Déployez en local Windows pour capture d\'écran');
}

console.log('');

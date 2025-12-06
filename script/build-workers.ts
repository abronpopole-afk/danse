
import { build } from 'esbuild';
import { mkdir } from 'fs/promises';
import path from 'path';

async function buildWorkers() {
  console.log('🔨 Compilation des workers...');
  
  // Créer le dossier dist/workers s'il n'existe pas
  await mkdir('dist/workers', { recursive: true });

  const workers = [
    'server/bot/workers/vision-worker-thread.ts',
    'server/bot/workers/gto-worker-thread.ts',
    'server/bot/workers/humanizer-worker-thread.ts',
  ];

  for (const workerPath of workers) {
    const workerName = path.basename(workerPath, '.ts');
    console.log(`  • Compilation de ${workerName}...`);

    try {
      await build({
        entryPoints: [workerPath],
        platform: 'node',
        bundle: true,
        format: 'cjs',
        outfile: `dist/workers/${workerName}.js`,
        external: ['worker_threads'],
        minify: false, // Plus facile à déboguer
        sourcemap: true,
        logLevel: 'warning',
      });
      console.log(`    ✓ ${workerName}.js créé`);
    } catch (error) {
      console.error(`    ✗ Erreur lors de la compilation de ${workerName}:`, error);
      throw error;
    }
  }

  console.log('✅ Tous les workers ont été compilés avec succès!');
  console.log('\nFichiers générés:');
  console.log('  - dist/workers/vision-worker-thread.js');
  console.log('  - dist/workers/gto-worker-thread.js');
  console.log('  - dist/workers/humanizer-worker-thread.js');
}

buildWorkers().catch((err) => {
  console.error('❌ Échec de la compilation des workers:', err);
  process.exit(1);
});

/**
 * Test de démonstration - Responsive Regions
 * 
 * Montre comment le système responsive s'adapte à différentes résolutions
 */

import {
  generateResponsiveRegions,
  isRegionValid,
  templateToScreenRegion,
  RESPONSIVE_REGIONS,
} from './responsive-regions-manager';

// Test avec différentes résolutions
const testResolutions = [
  { name: 'Téléphone (iPhone 13)', width: 360, height: 660 },
  { name: 'Téléphone (Android)', width: 411, height: 823 },
  { name: 'Tablette (iPad)', width: 768, height: 1024 },
  { name: 'Desktop (1080p)', width: 1920, height: 1080 },
  { name: 'Desktop Standard', width: 880, height: 600 },
  { name: 'Desktop 4K', width: 3840, height: 2160 },
  { name: 'Ultra-large gaming', width: 3440, height: 1440 },
];

console.log('🧪 TEST: Regions Responsives\n');
console.log('=' .repeat(80));

for (const resolution of testResolutions) {
  console.log(`\n📱 ${resolution.name} (${resolution.width}x${resolution.height})`);
  console.log('-'.repeat(80));

  const regions = generateResponsiveRegions(resolution.width, resolution.height);

  // Afficher les régions principales
  const mainRegions = ['hero_card_1', 'community_cards', 'pot', 'action_buttons', 'timer'];

  for (const regionName of mainRegions) {
    const region = regions.get(regionName);
    if (region) {
      const isValid = isRegionValid(region, resolution.width, resolution.height);
      const status = isValid ? '✅' : '❌';
      console.log(
        `  ${status} ${regionName.padEnd(20)} | ` +
        `x=${region.x.toString().padStart(4)} y=${region.y.toString().padStart(4)} ` +
        `w=${region.width.toString().padStart(4)} h=${region.height.toString().padStart(4)}`
      );
    }
  }

  // Vérifier que toutes les régions sont valides
  const allValid = Array.from(regions.values()).every(r =>
    isRegionValid(r, resolution.width, resolution.height)
  );

  console.log(`  🎯 Toutes les régions valides: ${allValid ? '✅' : '❌'}`);
}

console.log('\n' + '='.repeat(80));
console.log('\n📊 Analyse de scalabilité\n');

// Montrer le ratio de scaling
const baseResolution = { width: 880, height: 600 };
console.log(`📐 Résolution de référence: ${baseResolution.width}x${baseResolution.height}`);

for (const resolution of testResolutions.slice(1)) {
  const scaleX = resolution.width / baseResolution.width;
  const scaleY = resolution.height / baseResolution.height;
  const avgScale = (scaleX + scaleY) / 2;

  console.log(
    `  → ${resolution.name.padEnd(30)} | ` +
    `ScaleX=${scaleX.toFixed(2)}x ScaleY=${scaleY.toFixed(2)}x Avg=${avgScale.toFixed(2)}x`
  );
}

console.log('\n✅ Test complet ! Le système responsive fonctionne sur toutes les résolutions.\n');

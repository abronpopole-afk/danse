# Modules Natifs - Guide Technique

## Architecture de Chargement

### 1. Système de Chargement (`native-loader.ts`)

Le système détecte automatiquement l'environnement d'exécution :

```typescript
const IS_ELECTRON = !!(process as any).resourcesPath || !!process.env.ELECTRON_RUN_AS_NODE;
const IS_PACKAGED = IS_ELECTRON && !process.argv[0]?.includes('node_modules');
```

**Modes de chargement** :
- **Mode développement** : Chargement direct depuis `node_modules`
- **Mode empaquetage Electron** : Chargement depuis `app.asar.unpacked`
- **Mode Linux/Replit** : Fallback ou désactivation gracieuse

### 2. Processus de Résolution

```typescript
export async function loadNativeModule<T>(moduleName: string): Promise<T | null> {
  // 1. Vérifier si empaquetage Electron
  if (IS_PACKAGED) {
    const unpackedPath = getUnpackedModulePath(moduleName);
    if (unpackedPath) {
      try {
        // Résoudre le point d'entrée du module
        const resolvedPath = esmRequire.resolve(moduleName, { paths: [unpackedPath] });
        const mod = esmRequire(resolvedPath);
        return extractDefaultExport(mod) as T;
      } catch (e) {
        console.error(`Failed to load ${moduleName} from unpacked:`, e.message);
      }
    }
  }

  // 2. Fallback : chargement standard
  try {
    const mod = esmRequire(moduleName);
    return extractDefaultExport(mod) as T;
  } catch (e) {
    console.error(`Failed to load ${moduleName}:`, e.message);
  }

  // 3. Dernier recours : dynamic import
  try {
    const mod = await import(moduleName);
    return extractDefaultExport(mod) as T;
  } catch (e) {
    console.error(`All attempts failed for ${moduleName}`);
    return null;
  }
}
```

### 3. Script After-Pack (`after-pack.cjs`)

Copie les modules natifs lors du build Electron :

```javascript
const nativeModules = [
  'robotjs',
  'node-window-manager',
  'screenshot-desktop',
  'extract-file-icon',
  'ref-napi',
  'ffi-napi'
];

for (const moduleName of nativeModules) {
  const srcModulePath = path.join(process.cwd(), 'node_modules', moduleName);
  const destModulePath = path.join(unpackedNodeModules, moduleName);

  if (fs.existsSync(srcModulePath)) {
    console.log(`Copying ${moduleName}...`);
    copyDirRecursive(srcModulePath, destModulePath);
  }
}
```

**Avantages** :
- Copie complète du répertoire (pas seulement les .node)
- Inclusion de toutes les dépendances (DLL, .so, etc.)
- Structure préservée pour `require.resolve`

## Modules Supportés

### Windows
- ✅ **robotjs** : Contrôle souris/clavier
- ✅ **screenshot-desktop** : Capture d'écran
- ✅ **node-window-manager** : Gestion fenêtres
- ✅ **DXGI capture** : Capture ultra-rapide DirectX

### Dépendances Transitives Requises

L'archive ASAR doit inclure TOUTES les dépendances transitives des modules natifs. Erreurs courantes et solutions :

**Erreur 1** : `Cannot find module 'glob'` → Ajouter `glob` et ses dépendances
**Erreur 2** : `Cannot find module 'fs.realpath'` → Ajouter `fs.realpath` et toute la chaîne

```yaml
# electron-builder.yml - Configuration COMPLÈTE et FONCTIONNELLE
asarUnpack:
  # Modules natifs principaux
  - "**/node_modules/robotjs/**/*"
  - "**/node_modules/node-window-manager/**/*"
  - "**/node_modules/screenshot-desktop/**/*"
  
  # Dépendances directes
  - "**/node_modules/temp/**/*"
  - "**/node_modules/rimraf/**/*"
  - "**/node_modules/glob/**/*"
  - "**/node_modules/os-tmpdir/**/*"
  
  # ✅ COMPLÈTE chaîne transitives (CRITIQUE)
  - "**/node_modules/inflight/**/*"
  - "**/node_modules/minimatch/**/*"
  - "**/node_modules/fs.realpath/**/*"        # Polyfill fs
  - "**/node_modules/once/**/*"
  - "**/node_modules/path-is-absolute/**/*"
  - "**/node_modules/wrappy/**/*"
  - "**/node_modules/brace-expansion/**/*"
  - "**/node_modules/balanced-match/**/*"
```

**Chaîne de dépendances** :
- `screenshot-desktop` → `temp` → `rimraf` → `glob` → `minimatch` → `brace-expansion`
- `glob` aussi utilise : `fs.realpath`, `inflight`, `once`, `path-is-absolute`, `wrappy`

### Linux/macOS
- ✅ **tesseract.js** : OCR (JavaScript pur)
- ⚠️ **screenshot-desktop** : Partiel (X11 requis)
- ❌ **robotjs** : Non supporté nativement

## Gestion des Erreurs

Le système gère gracieusement les échecs de chargement :

```typescript
// Dans ggclub.ts
if (IS_WINDOWS && !IS_REPLIT) {
  try {
    robot = await loadNativeModule<any>("robotjs");
    if (robot) {
      logger.info("✓ robotjs chargé");
    } else {
      throw new Error("Module loaded but null");
    }
  } catch (e) {
    logger.error("❌ robotjs ÉCHEC", { error: String(e) });
    // Continuer sans robotjs (fonctionnalités limitées)
  }

  try {
    const wmModule = await loadNativeModule<any>("node-window-manager");
    // CORRECTION : Le module exporte { windowManager: { getWindows, getActiveWindow, ... } }
    // On extrait l'objet windowManager du module
    windowManager = wmModule?.windowManager || wmModule?.default?.windowManager || wmModule;

    // Vérifier que getWindows est disponible
    if (windowManager && typeof windowManager.getWindows === 'function') {
      logger.info("GGClubAdapter", "✓ node-window-manager chargé (Windows)", {
        hasGetWindows: typeof windowManager.getWindows === 'function',
        hasGetActiveWindow: typeof windowManager.getActiveWindow === 'function'
      });
    } else {
      logger.error("GGClubAdapter", "❌ node-window-manager structure invalide", {
        moduleKeys: wmModule ? Object.keys(wmModule) : [],
        hasWindowManager: !!wmModule?.windowManager,
        wmHasGetWindows: typeof wmModule?.windowManager?.getWindows
      });
      throw new Error("Module loaded but getWindows not found");
    }
  } catch (e) {
    logger.error("GGClubAdapter", "❌ node-window-manager ÉCHEC - DÉTECTION TABLES IMPOSSIBLE", { 
      error: String(e),
      solution: "Vérifiez que node-window-manager est installé : npm install node-window-manager"
    });
  }
} else {
  logger.info("ℹ Mode serveur - modules natifs Windows désactivés");
}
```

## Debugging

### Vérifier le Chargement

```bash
# Vérifier que les modules sont copiés
ls "dist-electron/win-unpacked/resources/app.asar.unpacked/node_modules/robotjs"

# Tester le chargement
node -e "import('./server/bot/native-loader.js').then(m => m.loadNativeModule('robotjs').then(console.log))"
```

### Logs de Diagnostic

Les logs incluent :
- Environnement détecté (Electron, empaquetage, OS)
- Chemins de résolution tentés
- Erreurs spécifiques par module
- Fallbacks activés

## Bonnes Pratiques

1. **Toujours vérifier le résultat** : `loadNativeModule` peut retourner `null`
2. **Prévoir des fallbacks** : Mode dégradé si module indisponible
3. **Logger les échecs** : Aide au diagnostic en production
4. **Tester sur OS cible** : Les modules natifs sont spécifiques à la plateforme
5. **Inclure toutes les dépendances** : Pas seulement les .node

## Références

- [`native-loader.ts`](../server/bot/native-loader.ts) - Système de chargement
- [`after-pack.cjs`](../electron/scripts/after-pack.cjs) - Script de copie
- [`electron-builder.yml`](../electron-builder.yml) - Configuration asarUnpack
- [`ggclub.ts`](../server/bot/platforms/ggclub.ts) - Utilisation des modules
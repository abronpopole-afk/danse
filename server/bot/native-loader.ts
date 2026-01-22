import * as path from 'path';
import * as fs from 'fs';
import { createRequire } from 'module';
import { logger } from '../logger';

// Compatible CommonJS et ESM
// @ts-ignore - __dirname peut être défini par esbuild en mode CJS
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Créer require de manière compatible CJS/ESM
let esmRequire: NodeRequire;
try {
  // En ESM, utiliser createRequire
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    // @ts-ignore
    esmRequire = createRequire(import.meta.url);
  } else {
    // En CJS, utiliser require directement
    // @ts-ignore
    esmRequire = typeof require !== 'undefined' ? require : createRequire(__filename || process.cwd());
  }
} catch {
  // Fallback absolu
  // @ts-ignore
  esmRequire = require;
}

const IS_ELECTRON = !!(process as any).resourcesPath || !!process.env.ELECTRON_RUN_AS_NODE;
const IS_PACKAGED = IS_ELECTRON && !process.argv[0]?.includes('node_modules');

// Log complet de l'environnement au démarrage
logger.info("NativeLoader", "=== ENVIRONNEMENT NATIVE LOADER ===", {
  IS_ELECTRON,
  IS_PACKAGED,
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  resourcesPath: (process as any).resourcesPath || "N/A",
  cwd: process.cwd(),
  currentDir,
  argv0: process.argv[0],
  ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE || "N/A",
  execPath: process.execPath,
});

function getResourcesPath(): string {
  const resourcesPath = (process as any).resourcesPath;
  logger.debug("NativeLoader", "getResourcesPath()", { resourcesPath: resourcesPath || "N/A" });
  return resourcesPath || '';
}

function getUnpackedModulePath(moduleName: string): string | null {
  const resourcesPath = getResourcesPath();
  if (!resourcesPath) {
    logger.debug("NativeLoader", `getUnpackedModulePath(${moduleName}) - pas de resourcesPath`);
    return null;
  }
  
  const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', moduleName);
  const exists = fs.existsSync(unpackedPath);
  
  logger.info("NativeLoader", `Recherche module unpacked: ${moduleName}`, {
    unpackedPath,
    exists,
    resourcesPath
  });
  
  if (!exists) {
    // Lister le contenu du dossier app.asar.unpacked pour debug
    const unpackedRoot = path.join(resourcesPath, 'app.asar.unpacked');
    try {
      if (fs.existsSync(unpackedRoot)) {
        const contents = fs.readdirSync(unpackedRoot);
        logger.debug("NativeLoader", "Contenu app.asar.unpacked", { contents });
        
        const nodeModulesPath = path.join(unpackedRoot, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
          const modules = fs.readdirSync(nodeModulesPath).slice(0, 20);
          logger.debug("NativeLoader", "Modules dans app.asar.unpacked/node_modules", { modules });
        }
      } else {
        logger.warning("NativeLoader", "app.asar.unpacked n'existe PAS!", { unpackedRoot });
      }
    } catch (e) {
      logger.error("NativeLoader", "Erreur listage unpacked", { error: String(e) });
    }
    return null;
  }
  
  return unpackedPath;
}

function extractDefaultExport(moduleExport: any): any {
  if (moduleExport && typeof moduleExport === 'object' && moduleExport.__esModule && moduleExport.default) {
    return moduleExport.default;
  }
  if (moduleExport && typeof moduleExport === 'object' && moduleExport.default) {
    return moduleExport.default;
  }
  return moduleExport;
}

function logModuleStructure(moduleName: string, mod: any): void {
  try {
    const keys = mod ? Object.keys(mod) : [];
    const typeInfo: Record<string, string> = {};
    for (const key of keys.slice(0, 10)) {
      typeInfo[key] = typeof mod[key];
    }
    logger.info("NativeLoader", `Structure module ${moduleName}`, {
      keys,
      typeInfo,
      hasDefault: !!mod?.default,
      hasWindowManager: !!mod?.windowManager,
      defaultKeys: mod?.default ? Object.keys(mod.default) : [],
      windowManagerKeys: mod?.windowManager ? Object.keys(mod.windowManager) : [],
    });
  } catch (e) {
    logger.debug("NativeLoader", `Impossible de logger structure de ${moduleName}`, { error: String(e) });
  }
}

// Mock robotjs for non-Windows platforms or when it fails to load
const robotMock = {
  moveMouse: () => {},
  moveMouseSmooth: () => {},
  mouseClick: () => {},
  mouseToggle: () => {},
  dragMouse: () => {},
  getMousePos: () => ({ x: 0, y: 0 }),
  getPixelColor: () => "000000",
  getScreenSize: () => ({ width: 1920, height: 1080 }),
  typeString: () => {},
  typeStringDelayed: () => {},
  keyTap: () => {},
  keyToggle: () => {},
  setMouseDelay: () => {},
  setKeyboardDelay: () => {},
};

export async function loadNativeModule<T>(moduleName: string): Promise<T | null> {
  logger.info("NativeLoader", `=== CHARGEMENT MODULE: ${moduleName} ===`, {
    IS_ELECTRON,
    IS_PACKAGED,
    platform: process.platform,
  });

  // Handle robotjs separately to provide a mock on non-Windows platforms or Replit
  if (moduleName === "robotjs" && (process.platform !== "win32" || process.env.REPL_ID !== undefined)) {
    logger.info("NativeLoader", "Utilisation du wrapper mock pour robotjs (non-Windows/Replit)");
    return robotMock as unknown as T;
  }
  
  // Extra fallback: in some packaged environments, robotjs might be available 
  // but fails normal resolution. We try to be more aggressive if we are on Windows.
  
  if (IS_PACKAGED) {
    logger.info("NativeLoader", `Mode PACKAGED - recherche dans app.asar.unpacked`);
    const unpackedPath = getUnpackedModulePath(moduleName);
    if (unpackedPath) {
      try {
        logger.debug("NativeLoader", `Tentative resolve depuis unpacked`, { unpackedPath });
        const resolvedPath = esmRequire.resolve(moduleName, { paths: [unpackedPath] });
        logger.info("NativeLoader", `Resolved ${moduleName} to: ${resolvedPath}`);
        const mod = esmRequire(resolvedPath);
        logModuleStructure(moduleName, mod);
        const result = extractDefaultExport(mod);
        logger.session("NativeLoader", `✓ SUCCÈS: ${moduleName} chargé depuis unpacked`);
        return result as T;
      } catch (e: any) {
        logger.error("NativeLoader", `Échec chargement ${moduleName} depuis unpacked`, { 
          error: e.message,
          stack: e.stack?.split('\n').slice(0, 5).join('\n')
        });
        
        if (moduleName === "robotjs") {
          logger.warning("NativeLoader", "Fallback sur robotMock après échec unpacked");
          return robotMock as unknown as T;
        }

        try {
          logger.debug("NativeLoader", `Fallback: require direct de ${unpackedPath}`);
          const mod = esmRequire(unpackedPath);
          logModuleStructure(moduleName, mod);
          const result = extractDefaultExport(mod);
          logger.session("NativeLoader", `✓ SUCCÈS: ${moduleName} chargé via fallback`);
          return result as T;
        } catch (e2: any) {
          logger.error("NativeLoader", `Fallback aussi échoué`, { error: e2.message });
        }
      }
    } else {
      logger.warning("NativeLoader", `Module ${moduleName} NON TROUVÉ dans app.asar.unpacked!`);
      
      // Attempt direct require as last resort for packaged robotjs
      if (moduleName === "robotjs" && process.platform === 'win32') {
        try {
          const mod = esmRequire("robotjs");
          if (mod) return extractDefaultExport(mod) as T;
        } catch (e) {}
      }

      if (moduleName === "robotjs") return robotMock as unknown as T;
    }
  }
  
  // Mode non-packagé ou fallback
  try {
    logger.debug("NativeLoader", `Tentative createRequire pour ${moduleName}`);
    const mod = esmRequire(moduleName);
    logModuleStructure(moduleName, mod);
    const result = extractDefaultExport(mod);
    logger.session("NativeLoader", `✓ SUCCÈS: ${moduleName} chargé via createRequire`);
    return result as T;
  } catch (e: any) {
    logger.debug("NativeLoader", `createRequire échoué pour ${moduleName}`, { error: e.message });
    if (moduleName === "robotjs") {
      logger.warning("NativeLoader", "Fallback sur robotMock après échec createRequire");
      return robotMock as unknown as T;
    }
  }
  
  try {
    logger.debug("NativeLoader", `Tentative dynamic import pour ${moduleName}`);
    const mod = await import(moduleName);
    logModuleStructure(moduleName, mod);
    const result = extractDefaultExport(mod);
    logger.session("NativeLoader", `✓ SUCCÈS: ${moduleName} chargé via dynamic import`);
    return result as T;
  } catch (e: any) {
    logger.error("NativeLoader", `Dynamic import échoué pour ${moduleName}`, { error: e.message });
    if (moduleName === "robotjs") {
      logger.warning("NativeLoader", "Fallback sur robotMock après échec dynamic import");
      return robotMock as unknown as T;
    }
  }
  
  logger.error("NativeLoader", `❌ ÉCHEC TOTAL: Impossible de charger ${moduleName}`, {
    IS_ELECTRON,
    IS_PACKAGED,
    platform: process.platform,
    suggestion: "Vérifiez que le module est dans asarUnpack de electron-builder.yml"
  });
  return null;
}

export function requireNativeModule<T>(moduleName: string): T | null {
  console.log(`[native-loader] requireNativeModule ${moduleName}...`);
  
  if (IS_PACKAGED) {
    const unpackedPath = getUnpackedModulePath(moduleName);
    if (unpackedPath) {
      try {
        const mod = esmRequire(unpackedPath);
        return extractDefaultExport(mod) as T;
      } catch (e: any) {
        console.error(`[native-loader] Sync load failed for ${moduleName}:`, e.message);
      }
    }
  }
  
  try {
    const mod = esmRequire(moduleName);
    return extractDefaultExport(mod) as T;
  } catch (e: any) {
    console.error(`[native-loader] createRequire failed for ${moduleName}:`, e.message);
    return null;
  }
}

export { IS_ELECTRON, IS_PACKAGED };

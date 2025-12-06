
# DXGI Desktop Duplication - Setup

## Installation Automatique (RECOMMANDÉE)

Le script `setup.ps1` compile automatiquement le module DXGI :

```powershell
# Exécuter en PowerShell Administrateur
.\script\setup.ps1
```

**OU** utilisez le script de compilation dédié :

```batch
# Double-clic sur script\compile-dxgi.bat
script\compile-dxgi.bat
```

## Installation Manuelle

### Prérequis (Windows uniquement)

1. **Visual Studio 2022 Build Tools** (C++ compiler)
   ```powershell
   # Via Chocolatey
   choco install visualstudio2022buildtools -y
   choco install visualstudio2022-workload-vctools -y
   
   # OU télécharger depuis
   # https://visualstudio.microsoft.com/downloads/
   ```

2. **node-gyp**
   ```bash
   npm install -g node-gyp
   npm config set msvs_version 2022
   ```

3. **node-addon-api**
   ```bash
   npm install node-addon-api
   ```

4. **DirectX SDK** (généralement inclus avec Windows 10+)

### Compilation

```bash
cd native
node-gyp configure
node-gyp build
```

Le module compilé sera dans `native/build/Release/dxgi-capture.node`

### Vérification

```bash
node -e "console.log(require('./native/build/Release/dxgi-capture.node'))"
```

## Performance attendue

| Méthode | Latence | Throughput |
|---------|---------|------------|
| screenshot-desktop | ~150-200ms | ~5-7 FPS |
| **DXGI** | **~20-30ms** | **~30-50 FPS** |

**Amélioration** : 6× plus rapide, 0 tearing (synchronisé avec le refresh moniteur)

## Scripts disponibles

| Script | Description |
|--------|-------------|
| `script/setup.ps1` | Installation complète + compilation DXGI |
| `script/SETUP.bat` | Lanceur pour setup.ps1 |
| `script/compile-dxgi.bat` | Compilation DXGI uniquement |
| `script/check-modules.bat` | Vérifier si DXGI est compilé |

## Fallback automatique

Si le module natif n'est pas disponible, le système utilisera automatiquement `screenshot-desktop`.

```typescript
// Le bot vérifie automatiquement
if (dxgiAvailable) {
  // Utilise DXGI (~20-30ms)
} else {
  // Fallback vers screenshot-desktop (~150-200ms)
}
```

## Dépannage

### "node-gyp configure" échoue

1. Vérifier que VS Build Tools est installé :
   ```powershell
   choco list visualstudio2022buildtools
   ```

2. Configurer npm pour VS 2022 :
   ```bash
   npm config set msvs_version 2022
   ```

3. Redémarrer le terminal

### "Cannot find d3d11.lib"

Installer Windows SDK :
```powershell
choco install windows-sdk-10.1
```

### Le module se compile mais ne fonctionne pas

- DXGI nécessite Windows 8+
- Vérifier que vous n'êtes pas en session RDP (DXGI désactivé)
- Vérifier les permissions GPU

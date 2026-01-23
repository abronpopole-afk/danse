# Plan de Correction de Capture GGClub

## Objectif
Résoudre le problème de capture plein écran (OOM) en ciblant le bon handle de fenêtre enfant et en supprimant les fallbacks dangereux.

## Actions par étape

### 1. Recherche du Handle de Rendu (EnumChildWindows)
- Modifier `dxgi-capture.ts` (ou créer un utilitaire) pour scanner les fenêtres enfants du handle principal.
- Identifier la fenêtre de rendu via sa taille (~566x420) ou sa classe (`Qt5QWindowIcon`, `Chrome_WidgetWin_0`).
- Logguer systématiquement les dimensions de chaque fenêtre enfant trouvée.

### 2. Sécurisation de PrintWindow
- Mettre à jour la logique de capture pour utiliser le handle enfant identifié.
- Ajouter des logs de diagnostic :
    - Valeur de retour de `PrintWindow`.
    - Code d'erreur `GetLastError()` en cas d'échec.
    - Dimensions réelles du bitmap généré.

### 3. Suppression du Fallback Plein Écran
- Dans `server/bot/platforms/ggclub.ts`, désactiver le fallback vers `screenshotDesktop({ format: 'png' })` sans cible spécifique.
- Si la capture de fenêtre échoue, lever une erreur explicite au lieu de capturer l'écran entier.

### 4. Validation
- Vérifier que `getGameState` reçoit bien un buffer de la taille attendue (~566x420 * 4).
- Confirmer que le polling s'arrête ou réessaie proprement sans faire exploser la mémoire.

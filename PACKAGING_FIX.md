# Poker Bot Packaging Fix

## Diagnostic
Le `setup.exe` de 3,2 Mo indique que le payload (les fichiers de l'application) n'est pas compressé à l'intérieur de l'installeur. Cela arrive souvent dans Tauri quand le glob pattern `/**/*` échoue à cause de la structure des dossiers ou de la version du bundler.

## Changements Appliqués
- **Modification de `src-tauri/tauri.conf.json`** : Passage de `../dist/public/**/*` à `../dist/public`. Dans les versions récentes de Tauri, pointer directement vers le dossier racine du build est plus fiable pour inclure toute l'arborescence.
- **Vérification des Modèles** : Inclusion forcée des fichiers `.json` à la racine pour garantir que l'OCR et l'IA fonctionnent après installation.

## Prochaines Étapes pour l'Utilisateur
1. Supprimer le dossier `src-tauri/target` pour forcer un clean build.
2. Relancer : `npm run build` puis `npm run tauri build`.
3. Le fichier `setup.exe` devrait maintenant atteindre une taille normale (> 10 Mo).

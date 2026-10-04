# Captures visuelles du lot 1

Les dossiers `before/` et `after/` contiennent l'accueil, le match et le résultat aux formats
1440 × 900, 390 × 844 et 844 × 390. Le DPR est fixé à 1. `metrics.json` conserve le navigateur,
le moteur WebGL, les appels de dessin, les triangles et les erreurs de page de chaque série.

Pour reproduire la série finale :

```bash
npm run dev -- --host 127.0.0.1 --port 4175 --strictPort
CHROMIUM_PATH=/usr/bin/chromium npm run capture:visual -- after artifacts/visual
```

Le script utilise une partie réelle. Sa fixture lit l'engagement déjà créé par le contrôleur afin
de terminer rapidement sur une victoire ; elle ne modifie ni l'aléatoire ni les règles du jeu.
SwiftShader est imposé pour rendre les mesures reproductibles dans l'environnement cloud.

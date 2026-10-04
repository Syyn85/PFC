# Refonte graphique — lot 1

Accueil, match, résultat et arène principale « île tropicale », bureau et mobile.
Départ : `2f50b6f` (branche `claude/rps-game-threejs-cel-jfg9wx`). Aucun changement dans `src/game/`.

## Captures

`avant/` et `apres/` : accueil, match (choix du coup) et résultat (victoire) en
bureau 1440 × 900, mobile 390 × 844 et paysage 844 × 390, DPR 1, mouvement réduit.
`rapport.json` donne pour chaque format les appels de dessin, les triangles et le moteur
de rendu.

Reproduire :

```bash
npm install
npm run dev -- --port 5180          # premier terminal
npm run captures -- docs/refonte/apres   # second terminal
```

L'état « victoire » est atteint en lisant, depuis le script, le coup engagé par l'IA
(`window.pfc`, exposé seulement en développement). C'est une fixture de test : le jeu,
l'aléatoire et les règles ne sont pas modifiés.

## Mesures

| Format     | Appels (accueil / match) avant | après     | Triangles avant | après  |
| ---------- | ------------------------------ | --------- | --------------- | ------ |
| 1440 × 900 | 255 / 238                      | 232 / 226 | ~141 k          | ~144 k |
| 390 × 844  | 221 / 201                      | 212 / 205 | ~137 k          | ~136 k |
| 844 × 390  | 271 / 257                      | 239 / 234 | ~143 k          | ~147 k |

Rendu **logiciel** (SwiftShader, Chromium sans GPU) : aucune cadence n'a été mesurée ni
n'est annoncée. Les formats mobiles sont des viewports émulés, pas un vrai téléphone.
La résolution adaptative existante est conservée (baisse sous 45 i/s, remontée au-dessus
de 58 i/s pendant 6 s).

Protocole sur un vrai appareil : ouvrir le jeu sans `?qualite=max`, jouer une partie,
puis lire `window.pfc.engine.pixelRatio` (version de développement) : s'il est resté à sa
valeur de départ, l'appareil tient au moins 45 i/s.

## Ce qui a changé

- **Mains** (`src/gfx/hand.js`) : manchette épaisse à deux liserés et emblème (étoile pour
  le joueur, losange pour l'adversaire), avant-bras ivoire discret à la place des longues
  manches, doigts plus épais, éminence du pouce, adversaire en miroir (on voit le dos des
  deux gants). Chaque pose tourne la main autour de l'avant-bras : poing de profil avec le
  pouce visible, feuille à plat, ciseaux de trois quarts.
- **Cadrage** (`src/core/engine.js`) : plus serré, mains plus grandes en paysage.
- **Mise en scène** (`src/gfx/director.js`, appelé par `src/main.js`) : en fin de match, la
  caméra glisse vers la main gagnante, qui se lève doigts vers le haut ; lumière dorée en
  victoire, plus froide en défaite. Lecture seule de l'état du jeu.
- **Arène et décor** (`src/gfx/world.js`, `props.js`, `themes.js`) : dalles de pierre,
  ruines (murs, porte, tours à bannières bleue et rouge), torches, palmiers et bosquets,
  pitons rocheux lointains, mer turquoise, brouillard plus proche pour estomper le fond.
- **Interface** (`index.html`, `src/styles.css`, `src/ui/hud.js`) : jetons de couleur et
  d'espacement centralisés (bleu nuit, panneaux, or, bleu joueur, rouge adverse, ivoire),
  logo PFC ARENA, bouton Jouer dominant et menu secondaire (Partie rapide, Boutique),
  badges de score, petit VS pendant le choix, coups en boutons ronds (icônes du gant
  équipé conservées), écran de résultat avec grand titre et bilan en bas.

## Écarts restants avec la référence

- Décor bien moins détaillé que l'illustration (géométrie simple, pas de textures
  peintes) : c'est la limite du rendu procédural.
- L'ambiance « crépuscule » est devenue l'île tropicale : elle sert à l'accueil, à la partie
  rapide **et** à l'île 5 (Le Malin). Le décor de ruines est commun à toutes les îles ; les
  cinq autres ciels n'ont pas été retravaillés (lot 2).
- Carte des îles, choix des atouts et boutique gardent leurs panneaux violets (lot 2).
- Le poing reste plus « coussin » que sur l'illustration ; les interpénétrations ont été
  contrôlées à l'œil sur les captures, pas mesurées.

# PFC Arena

Pierre-feuille-ciseaux en 3D, rendu **cel shading** avec Three.js. Deux mains gantées
s'affrontent sur une arène de pierre posée sur une île flottante, au-dessus d'une mer de
nuages au crépuscule.

Cette première version pose les **fondamentaux du jeu** (boucle de partie, IA, rendu,
interface, sons) et prépare le terrain pour l'économie **play-to-earn** liée à un token
sur Robinhood Chain. Les jetons sont pour l'instant des **jetons de démo** stockés sur
l'appareil.

## Démarrer

```bash
npm install
npm run dev          # serveur de dev (accessible sur le réseau local)
npm test             # tests de la logique de jeu
npm run build        # build de production dans dist/
npm run build:single # un seul fichier HTML autonome dans dist-single/
```

Commandes clavier : `1` / `2` / `3` (ou `P` / `F` / `C`) pour jouer, `Entrée` pour lancer.

## Ce qui est en place

- **Boucle de jeu** : écran titre, matchs BO3 / BO5, compte à rebours « Pierre… Feuille…
  Ciseaux ! » synchronisé avec l'animation, verdict, séries, écran de fin.
- **IA** : stratégie `markov` (mémorise tes enchaînements de coups et les contre, avec une
  part d'aléatoire) ou `random`, au choix dans `src/config.js`.
- **Équité vérifiable (commit-reveal)** : avant ton choix, l'IA publie l'empreinte SHA-256
  de `coup:sel`. Après la révélation, le sel est dévoilé et l'empreinte recalculée. C'est le
  schéma qu'utilisera le contrat on-chain.
- **Récompenses** (démo) : manche gagnée, série de 3, match remporté — barème dans
  `src/config.js`.
- **Rendu** entièrement procédural (aucun modèle ni texture externe) :
  - mains articulées (4 doigts × 3 phalanges + pouce) animées par poses, squash & stretch ;
  - décor : arène dallée, torii, lanternes, cerisiers, cristaux, îlots flottants, pièces du
    token en orbite, pétales et lucioles, mer de nuages animée, ciel à paliers ;
  - effets : explosion « comic » à l'impact, onde de choc, étincelles, confettis, pluie de
    pièces, tremblement de caméra.
- **Sons** synthétisés en temps réel (Web Audio), coupables et mémorisés.
- **Responsive** : la caméra recadre la scène selon le format (paysage / portrait).

## Architecture

```
src/
  config.js           réglages du jeu, barème, placeholders chaîne/token
  main.js             démarrage et boucle de rendu
  core/
    engine.js         renderer, caméra adaptative, tremblements, parallaxe
    tween.js          animations pilotées par la boucle (pause auto avec l'onglet)
    random.js         aléatoire déterministe pour le décor
  game/               logique pure, testée (aucune dépendance au rendu)
    rules.js          coups, résolution, verdicts
    match.js          score, séries, fin de match, récompenses
    bot.js            IA random / markov
    fairness.js       commit-reveal SHA-256 (+ implémentation JS de secours)
    controller.js     orchestration logique ↔ 3D ↔ interface ↔ sons
  gfx/
    toon.js           matériau toon (rampes, liseré, reflet), contours, halos
    hand.js           main gantée procédurale et ses animations
    world.js          île, arène, lumières, particules d'ambiance
    props.js          torii, lanternes, arbres, rochers, pièces, nuages…
    sky.js            ciel, étoiles, mer de nuages (shaders)
    vfx.js            effets d'impact, confettis, pièces
    bake.js           fusion des meshes statiques (moins d'appels de rendu)
    icons.js          icônes des cartes rendues depuis le modèle 3D
  ui/hud.js           interface DOM
  audio/sfx.js        effets sonores synthétisés
  web3/wallet.js      portefeuille démo + interface de la future intégration
tests/game.test.js    tests de la logique
```

### Le cel shading en bref

1. `MeshToonMaterial` avec des **rampes à paliers** (texture 64×1 en `NearestFilter`) :
   2 à 4 tons francs au lieu d'un dégradé.
2. Injection GLSL (`onBeforeCompile`) d'un **liseré de lumière** (rim) et d'un **reflet
   spéculaire dur**, réglables par matériau via des uniforms.
3. **Contours « inverted hull »** : une copie de chaque mesh, aux normales lissées, rendue
   en faces arrière et gonflée dans l'espace écran pour une épaisseur constante en pixels.
4. Ombres portées nettes, brouillard teinté, palette crépusculaire cohérente entre ciel,
   mer de nuages et lumières.

## Prochaines étapes : le play-to-earn

Le jeu tourne aujourd'hui en mode démo (`DemoWallet`). Pour passer on-chain :

1. **Connexion wallet** (EIP-1193, par ex. via `viem`) sur Robinhood Chain, compatible EVM.
   Renseigner `chainId`, `rpcUrl`, adresses du token et du contrat dans `src/config.js`.
2. **Contrat de jeu** : parties en commit-reveal on-chain (le module `fairness.js` en est le
   prototype côté client), dépôt des mises en séquestre, délai de révélation avec
   pénalité en cas d'abandon.
3. **Ne jamais faire confiance au client** pour créditer des gains : soit la partie est
   arbitrée par le contrat, soit un serveur de jeu signe des réclamations (EIP-712) que le
   contrat vérifie. Le client ne fait qu'afficher le solde lu sur la chaîne.
4. **Contre l'IA**, le serveur doit détenir le sel et le coup engagés, sinon un joueur
   pourrait lire le coup de l'IA dans le code du navigateur.

### Point d'attention réglementaire

Des parties avec mise en jetons ayant une valeur monétaire, sur un jeu largement fondé sur
le hasard, peuvent relever de la réglementation des jeux d'argent (en France, l'ANJ) et
des règles sur les crypto-actifs. À faire valider par un juriste avant tout lancement
public, en particulier pour l'accès des mineurs.

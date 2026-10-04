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

Clavier : `1` / `2` / `3` (touches physiques, donc aussi en AZERTY) ou `P` / `F` / `C` pour
jouer, `B` Bouclier, `D` Double, `E` Espion, `Entrée` pour ouvrir la campagne, `Échap` pour
revenir.

## Ce qui est en place

- **Campagne « Le tour des îles »** : six gardiens à battre dans l'ordre, chacun avec une
  manie de jeu à repérer (Le Roc adore la pierre, Écho t'imite, Rouage tourne en boucle,
  Kitsune contre ton dernier coup, Le Malin apprend tes enchaînements, L'Oracle choisit la
  meilleure lecture de ton jeu). Chaque île a son ciel, ses couleurs, ses répliques, un
  bonus de première victoire, et les dernières ajoutent chrono et atouts adverses. Un indice
  s'affiche après une défaite. La progression est sauvegardée sur l'appareil.
- **Partie rapide** en BO3 / BO5 contre un adversaire qui apprend tes habitudes.
- **Atouts**, choisis avant chaque match : 1 en 2 manches gagnantes, 2 au-delà. Bouclier et
  Double sont consommés même s'ils ne servent pas : c'est un pari. L'Espion ne se cumule pas
  avec eux sur la même manche (sinon on ne pourrait plus perdre). Les derniers gardiens en
  possèdent aussi, et leur atout est scellé dans l'engagement cryptographique.
  - **Bouclier** : si tu perds la manche, l'adversaire ne marque pas ;
  - **Double** : si tu gagnes la manche, elle vaut 2 points ;
  - **Espion** : révèle un coup que l'adversaire n'a pas joué.
- **Chronomètre** de choix sur les îles avancées, en secondes réelles (indépendant de la
  fluidité, en pause quand l'onglet est caché) : sans réponse, un coup est joué au hasard.
- **Séries** de manches gagnées reportées d'un match gagné au suivant.
- **Équité vérifiable (commit-reveal)** : avant ton choix, l'IA publie l'empreinte SHA-256
  de `coup:atout:sel`. Après la révélation, le sel est dévoilé et l'empreinte recalculée.
  C'est le schéma qu'utilisera le contrat on-chain.
- **Récompenses** (démo) : manche gagnée, série de 3, match remporté, bonus de première
  victoire par île. Les gains contre l'IA sont **plafonnés par jour** (anti-farming), hors
  bonus d'île. Barème dans `src/config.js`.
- **Rendu** entièrement procédural (aucun modèle ni texture externe) :
  - mains articulées (4 doigts × 3 phalanges + pouce) animées par poses, squash & stretch,
    recolorées pour chaque adversaire, qui entre en scène en glissant ;
  - six ambiances : crépuscule, aube, zénith, orage avec éclairs, nuit de lune, aurores
    boréales animées, avec transitions douces ;
  - décor : arène dallée, torii, lanternes, cerisiers, cristaux, îlots flottants, pièces du
    token en orbite, pétales et lucioles, mer de nuages animée ;
  - effets : explosion « comic » à l'impact, bouclier hexagonal, textes « ×2 » / « Bloqué ! »,
    onde de choc, étincelles, confettis, pluie de pièces, tremblement de caméra ;
  - bulles de dialogue accrochées à la main adverse.
- **Sons et musique** synthétisés en temps réel (Web Audio) : effets, et une musique
  pentatonique façon koto qui s'enrichit d'une rythmique en match. Coupables séparément.
- **Responsive et adaptatif** : la caméra recadre la scène selon le format, et la résolution
  baisse si l'appareil n'atteint pas 45 images/s, puis remonte quand il redevient fluide
  (`?qualite=max` pour désactiver).
- **Accessible** : jouable entièrement au clavier, annonces pour lecteurs d'écran,
  contrastes AA, réglage « animations réduites » respecté.
- **Robuste** : sauvegardes relues avant écriture (plusieurs onglets), plafond et solde
  conservés même si le stockage du navigateur est bloqué ou plein, retour au menu au lieu
  d'un blocage en cas d'erreur.

## Architecture

```
src/
  config.js           réglages du jeu, barème, plafond quotidien, placeholders chaîne/token
  main.js             démarrage et boucle de rendu
  core/
    engine.js         renderer, caméra adaptative, résolution adaptative, tremblements
    tween.js          animations pilotées par la boucle (pause auto avec l'onglet)
    storage.js        accès sûr au stockage local
    random.js         aléatoire déterministe pour le décor
  game/               logique pure, testée (aucune dépendance au rendu)
    rules.js          coups, résolution, verdicts
    match.js          score, atouts, séries, fin de match, récompenses
    bot.js            7 stratégies d'IA, décision d'atout, indice de l'Espion
    opponents.js      les gardiens de la campagne et la partie rapide
    progress.js       progression de campagne, plafond de gains quotidien
    fairness.js       commit-reveal SHA-256 (+ implémentation JS de secours)
    controller.js     orchestration logique ↔ 3D ↔ interface ↔ sons
  gfx/
    toon.js           matériau toon (rampes, liseré, reflet), contours, halos
    hand.js           main gantée procédurale, poses, palettes, animations
    world.js          île, arène, lumières, ambiances et transitions
    themes.js         les six ciels
    props.js          torii, lanternes, arbres, rochers, pièces, nuages…
    sky.js            ciel (aurores, éclairs), étoiles, mer de nuages (shaders)
    vfx.js            impacts, bouclier, textes flottants, confettis, pièces
    bake.js           fusion des meshes statiques (moins d'appels de rendu)
    icons.js          icônes des cartes et portraits rendus depuis le modèle 3D
  ui/hud.js           interface DOM
  audio/
    sfx.js            effets sonores synthétisés
    music.js          musique générative
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
   pourrait lire le coup de l'IA dans le code du navigateur. Le plafond quotidien et la
   progression de campagne devront aussi être tenus côté serveur.

### Point d'attention réglementaire

Des parties avec mise en jetons ayant une valeur monétaire, sur un jeu largement fondé sur
le hasard, peuvent relever de la réglementation des jeux d'argent (en France, l'ANJ) et
des règles sur les crypto-actifs. À faire valider par un juriste avant tout lancement
public, en particulier pour l'accès des mineurs.

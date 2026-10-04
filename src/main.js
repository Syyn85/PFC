import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './styles.css';

import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Tweens, ease } from './core/tween.js';
import { createWorld } from './gfx/world.js';
import { HandRig } from './gfx/hand.js';
import { Effects } from './gfx/vfx.js';
import { renderHandIcons } from './gfx/icons.js';
import { Hud } from './ui/hud.js';
import { Sfx } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { DemoWallet } from './web3/wallet.js';
import { GameController } from './game/controller.js';
import { CAMPAIGN } from './game/opponents.js';

const HAND_HEIGHT = 1.55;

function boot() {
  const engine = new Engine(document.querySelector('#scene'));
  const tweens = new Tweens();
  const world = createWorld(engine.scene);
  engine.pixelRatioUniforms.push(...world.pixelRatioUniforms);

  const player = new HandRig({ team: 'player' });
  const bot = new HandRig({ team: 'bot' });
  engine.scene.add(player.root, bot.root);
  let stageHandX = 1.9;
  engine.onLayout = ({ handX }) => {
    stageHandX = handX;
    player.place(new THREE.Vector3(-handX, HAND_HEIGHT, 0), { facing: 1 });
    bot.place(new THREE.Vector3(handX, HAND_HEIGHT, 0), { facing: -1 });
  };
  engine.resize();

  const effects = new Effects(engine.scene, engine.camera, tweens);
  const hud = new Hud();
  const sfx = new Sfx();
  const music = new Music(sfx);
  sfx.onUnlock = () => music.start();
  const wallet = new DemoWallet();

  // Portraits des adversaires, rendus depuis le modèle 3D (les cartes de coup sont
  // rendues par le contrôleur, aux couleurs du gant équipé)
  const portraits = renderHandIcons(
    CAMPAIGN.map((o) => ({ key: o.id, pose: o.pose, team: 'bot', palette: o.palette })),
  );

  const game = new GameController({
    engine,
    tweens,
    world,
    player,
    bot,
    effects,
    hud,
    sfx,
    music,
    wallet,
    portraits,
    renderIcons: renderHandIcons,
  });
  game.enterTitle();
  world.setTheme('crepuscule', 0);
  let endBlend = 0;
  let endStaged = false;

  // Compile les shaders (y compris ceux des effets, masqués au repos) et fait une
  // image d'amorçage pour la passe d'ombre : pas de saccade à la première manche.
  effects.setPoolsVisible(true);
  engine.updateCamera(0, 0);
  engine.renderer.compile(engine.scene, engine.camera);
  engine.render();
  effects.setPoolsVisible(false);

  let last = performance.now();
  engine.renderer.setAnimationLoop((now) => {
    const frame = (now - last) / 1000;
    const dt = Math.min(frame, 1 / 20);
    last = now;
    engine.monitor(frame);
    const time = now / 1000;
    tweens.update(dt);
    world.update(dt, time);

    // Mise en scène du résultat sans toucher à la logique du match : la main
    // gagnante prend le centre, l'autre quitte doucement le cadre. Le retour au
    // menu rétablit les positions de duel avec la même interpolation.
    const ended = game.state === 'ended';
    const targetEnd = ended ? 1 : 0;
    endBlend += (targetEnd - endBlend) * (1 - Math.exp(-dt * 4.8));
    const playerWon = game.match?.winner === 'player';
    if (ended && !endStaged) {
      (playerWon ? player : bot).setPose(tweens, 'paper', { duration: 0.42, easing: ease.outBack });
      endStaged = true;
    } else if (!ended) {
      endStaged = false;
    }
    const portrait = engine.layout?.portrait;
    const winnerX = portrait ? 0 : -0.35;
    const winnerY = portrait ? 2.15 : 2.0;
    const loserX = stageHandX + 5.2;
    const playerTargetX = playerWon ? winnerX : -loserX;
    const botTargetX = playerWon ? loserX : -winnerX;
    player.basePosition.set(
      THREE.MathUtils.lerp(-stageHandX, playerTargetX, endBlend),
      THREE.MathUtils.lerp(HAND_HEIGHT, playerWon ? winnerY : HAND_HEIGHT - 0.35, endBlend),
      0,
    );
    bot.basePosition.set(
      THREE.MathUtils.lerp(stageHandX, botTargetX, endBlend),
      THREE.MathUtils.lerp(HAND_HEIGHT, playerWon ? HAND_HEIGHT - 0.35 : winnerY, endBlend),
      0,
    );
    const playerScale = THREE.MathUtils.lerp(1, playerWon ? 1.24 : 0.9, endBlend);
    const botScale = THREE.MathUtils.lerp(1, playerWon ? 0.9 : 1.24, endBlend);
    player.root.scale.setScalar(playerScale);
    bot.root.scale.setScalar(botScale);
    player.root.rotation.z = THREE.MathUtils.lerp(0, Math.PI / 2, endBlend);
    bot.root.rotation.z = THREE.MathUtils.lerp(0, Math.PI / 2, endBlend);
    player.update(dt, time);
    bot.update(dt, time);
    effects.update(dt);
    game.update(dt, time);
    // Cadrages stables pour juger les silhouettes : légère vie au menu, face-à-face
    // strict pendant le match. La parallaxe pointeur mesurée reste gérée par Engine.
    if (game.state === 'title') engine.rig.orbit *= 0.24;
    else if (!['map', 'shop'].includes(game.state)) engine.rig.orbit = 0;
    if (endBlend > 0.001) {
      engine.rig.zoom = THREE.MathUtils.lerp(engine.rig.zoom, portrait ? 0.9 : 0.86, endBlend);
      engine.rig.lift = THREE.MathUtils.lerp(engine.rig.lift, portrait ? 0.58 : 0.42, endBlend);
      engine.rig.orbit *= 1 - endBlend;
    }
    engine.updateCamera(dt, time);
    engine.render();
  });

  requestAnimationFrame(() => requestAnimationFrame(() => hud.ready()));
  return game;
}

try {
  const game = boot();
  if (import.meta.env.DEV) window.pfc = game;
} catch (error) {
  console.error(error);
  const loader = document.querySelector('#loader p');
  if (loader) {
    loader.textContent =
      'Impossible de lancer la 3D sur cet appareil (WebGL indisponible ?). Essaie avec un navigateur récent.';
  }
}

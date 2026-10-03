import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './styles.css';

import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Tweens } from './core/tween.js';
import { createWorld } from './gfx/world.js';
import { HandRig } from './gfx/hand.js';
import { Effects } from './gfx/vfx.js';
import { renderHandIcons } from './gfx/icons.js';
import { Hud } from './ui/hud.js';
import { Sfx } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { DemoWallet } from './web3/wallet.js';
import { GameController } from './game/controller.js';
import { MOVES } from './game/rules.js';
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
  engine.onLayout = ({ handX }) => {
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

  // Icônes des cartes et portraits des adversaires, rendus depuis le modèle 3D
  const icons = renderHandIcons([
    ...MOVES.map((move) => ({ key: move, pose: move })),
    ...CAMPAIGN.map((o) => ({ key: o.id, pose: o.pose, team: 'bot', palette: o.palette })),
  ]);
  hud.setCardArt(icons);

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
    portraits: icons,
  });
  game.enterTitle();
  world.setTheme('crepuscule', 0);

  // Compile les shaders avant la première image pour éviter les saccades.
  engine.renderer.compile(engine.scene, engine.camera);

  let last = performance.now();
  engine.renderer.setAnimationLoop((now) => {
    const frame = (now - last) / 1000;
    const dt = Math.min(frame, 1 / 20);
    last = now;
    engine.monitor(frame);
    const time = now / 1000;
    tweens.update(dt);
    world.update(dt, time);
    player.update(dt, time);
    bot.update(dt, time);
    effects.update(dt);
    game.update(dt, time);
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

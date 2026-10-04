import * as THREE from 'three';
import { seededRandom } from '../core/random.js';
import { createCloudSea, createSky, createStars } from './sky.js';
import { THEMES } from './themes.js';
import { RAMPS, canvasTexture, toonMaterial, toonMesh } from './toon.js';
import { bakeStatic } from './bake.js';
import {
  createBush,
  createCloud,
  createCoin,
  createGate,
  createIslet,
  createPalm,
  createRock,
  createRuinWall,
  createSpire,
  createTorch,
  createTower,
  createTree,
} from './props.js';

/**
 * Le monde : une arène de pierre entourée de ruines, posée sur une île flottante
 * au-dessus de la mer. Tout est procédural (aucun asset externe) ; l'ambiance
 * (ciel, lumières, brouillard) change selon l'île via setTheme().
 */

const OUTLINE = { color: '#14213a', thickness: 2.2 };
const HIGHLIGHT_WARM = new THREE.Color('#ffd27a');
const HIGHLIGHT_COLD = new THREE.Color('#b9c8ff');
export const ARENA_RADIUS = 4.3;

export function createWorld(scene) {
  const rand = seededRandom(20251003);

  // --- Lumières (couleurs fixées par le thème) ---
  const sunDirection = new THREE.Vector3(-0.55, 0.16, -1);
  scene.background = new THREE.Color();
  // Brouillard assez proche : les ruines et les îles lointaines s'estompent derrière les mains
  scene.fog = new THREE.Fog(new THREE.Color(), 16, 120);

  const hemi = new THREE.HemisphereLight('#d9ccff', '#7a4a86', 1.15);
  scene.add(hemi);

  const key = new THREE.DirectionalLight('#fff0dc', 2.9);
  key.position.set(5.5, 10, 7.5);
  key.castShadow = true;
  // Carte d'ombre sur toute l'île : arbres, lanternes et bras (qui sortent du cadre) gardent
  // leur ombre. En 2048², un texel couvre 0,009 unité, assez fin pour le bord seuillé des
  // ombres toon (voir toonShadow dans toon.js).
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  scene.add(key, key.target);

  // --- Ciel, étoiles, mer de nuages ---
  const sky = createSky(sunDirection);
  scene.add(sky);
  const stars = createStars(420, rand);
  scene.add(stars);
  const sea = createCloudSea();
  scene.add(sea);

  // --- Île ---
  const island = new THREE.Group();
  scene.add(island);
  island.add(createIslandBody(rand));
  island.add(createArena());

  // Ruines derrière l'arène : murs, porte centrale et deux tours à bannières.
  // Elles restent en arrière-plan (moins contrastées que les mains, voir brouillard).
  for (const [x, z, rot, w, h] of [
    [-3.9, -7.0, 0.32, 3.2, 2.3],
    [3.9, -7.0, -0.32, 3.2, 2.0],
    [-7.3, -3.9, 1.1, 2.6, 1.6],
    [7.3, -3.7, -1.1, 2.6, 2.2],
  ]) {
    const wall = createRuinWall(rand, { width: w, height: h });
    wall.position.set(x, -0.82, z);
    wall.rotation.y = rot;
    island.add(wall);
  }
  const gate = createGate(rand);
  gate.position.set(0, -0.82, -8.4);
  island.add(gate);
  for (const [x, z, h, banner] of [
    [-6.2, -6.3, 4.6, '#2f86e8'],
    [6.4, -6.0, 5.2, '#e9505c'],
  ]) {
    const tower = createTower(rand, { height: h, banner });
    tower.position.set(x, -0.82, z);
    island.add(tower);
  }

  // Torches de part et d'autre de l'arène (scintillement : voir update)
  const lanterns = [];
  for (const [x, z] of [
    [-5.3, -1.6],
    [5.3, -1.6],
  ]) {
    const torch = createTorch();
    torch.position.set(x, -0.8, z);
    island.add(torch);
    lanterns.push(torch);
  }

  // Végétation regroupée en bosquets (palmiers, arbres, buissons)
  for (const [x, z, s, kind] of [
    [-6.8, -2.6, 1.15, 'palm'],
    [-7.9, 0.6, 0.95, 'bush'],
    [-5.0, -5.0, 1.0, 'tree'],
    [6.9, -2.4, 1.2, 'palm'],
    [7.9, 0.4, 0.9, 'bush'],
    [5.0, -5.2, 0.95, 'tree'],
    [-2.6, -9.0, 1.1, 'palm'],
    [2.8, -9.1, 1.0, 'palm'],
    [-8.6, -4.8, 1.0, 'palm'],
    [8.6, -5.0, 1.05, 'tree'],
  ]) {
    const plant =
      kind === 'palm'
        ? createPalm(rand, { scale: s })
        : kind === 'bush'
          ? createBush(rand, { scale: s })
          : createTree(rand, { scale: s });
    plant.position.set(x, -0.82, z);
    island.add(plant);
  }

  // Rochers
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const r = 5.2 + rand() * 3.4;
    const rock = createRock(rand, { size: 0.25 + rand() * 0.35 });
    rock.position.set(Math.cos(a) * r, -0.75, Math.sin(a) * r * 0.9);
    island.add(rock);
  }

  bakeStatic(island);

  // --- Pièces du token en orbite (hautes et peu nombreuses : elles ne masquent rien) ---
  const coins = [];
  for (let i = 0; i < 4; i++) {
    const coin = createCoin({ radius: 0.34, thickness: 0.09 });
    coin.userData.orbit = {
      angle: (i / 4) * Math.PI * 2,
      speed: 0.1,
      rx: 8.6,
      rz: 6.2,
      y: 5.4 + Math.sin(i * 1.7) * 0.5,
      spin: 1.2 + rand(),
    };
    scene.add(coin);
    coins.push(coin);
  }

  // --- Décor lointain : îlots et nuages ---
  const islets = [];
  for (let i = 0; i < 9; i++) {
    let a = Math.PI * (0.95 + (i / 8) * 1.1) + (rand() - 0.5) * 0.2; // derrière et sur les côtés
    // Jamais pile derrière l'arène : cette zone reste dégagée entre les deux mains
    if (Math.abs(a - Math.PI * 1.5) < 0.3) a += a < Math.PI * 1.5 ? -0.35 : 0.35;
    const r = 15 + rand() * 12;
    const islet = createIslet(rand, { radius: 0.8 + rand() * 1.1 });
    islet.position.set(Math.cos(a) * r, -1.5 + rand() * 5, Math.sin(a) * r);
    islet.userData.bob = { base: islet.position.y, phase: rand() * 10, speed: 0.4 + rand() * 0.3 };
    bakeStatic(islet, { castShadow: false });
    scene.add(islet);
    islets.push(islet);
  }

  // Pitons rocheux lointains : profondeur et silhouettes, comme des îles à l'horizon
  for (const [a, r, h, rad] of [
    [1.05, 30, 16, 2.6],
    [1.22, 38, 22, 3.2],
    [1.38, 27, 12, 2.0],
    [1.62, 36, 19, 2.8],
    [1.78, 29, 14, 2.3],
    [1.93, 40, 24, 3.4],
  ]) {
    const spire = createSpire(rand, { height: h, radius: rad });
    spire.position.set(Math.cos(Math.PI * a) * r, -6 + h * 0.35, Math.sin(Math.PI * a) * r);
    bakeStatic(spire, { castShadow: false });
    scene.add(spire);
  }

  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.9 + rand() * 1.2);
    const r = 24 + rand() * 40;
    const low = i < 5;
    const cloud = createCloud(rand, {
      scale: low ? 1.8 + rand() * 1.2 : 1.1 + rand() * 1.4,
      color: low ? '#f4fbff' : '#ffffff',
    });
    cloud.position.set(Math.cos(a) * r, low ? -6 - rand() * 2 : 1 + rand() * 9, Math.sin(a) * r);
    cloud.userData.drift = 0.15 + rand() * 0.25;
    bakeStatic(cloud, { castShadow: false, receiveShadow: false });
    scene.add(cloud);
    clouds.push(cloud);
  }

  // --- Particules : feuilles portées par le vent et lucioles ---
  const petals = createPetals(rand, 60);
  scene.add(petals.mesh);
  const fireflies = createFireflies(rand, 70);
  scene.add(fireflies.points);

  // --- Ambiance : thèmes et transitions ---
  const uniforms = {
    sky: sky.material.uniforms,
    sea: sea.material.uniforms,
    stars: stars.material.uniforms,
    fireflies: fireflies.points.material.uniforms,
  };
  let current = themeState(THEMES.crepuscule);
  let transition = null;
  const lightning = { enabled: false, timer: 4, flash: 0, second: 0 };
  // Mouvement réduit : éclairs gardés (son, rythme) mais flash lumineux très atténué.
  const flashScale = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.15 : 1;
  // Mise en valeur de fin de match : > 0 lumière dorée, < 0 lumière plus froide
  let highlight = 0;
  const world = {
    update,
    setTheme,
    setHighlight: (value) => (highlight = value),
    onLightning: null,
    key,
    hemi,
    sunDirection,
    coins,
  };

  function applyAmbience(state) {
    const { sky: k, sea: w } = uniforms;
    k.uTop.value.copy(state.top);
    k.uMid.value.copy(state.mid);
    k.uHorizon.value.copy(state.horizon);
    k.uGlow.value.copy(state.glow);
    k.uBelow.value.copy(state.below);
    k.uSun.value.copy(state.sun);
    k.uAurora.value = state.aurora;
    w.uDeep.value.copy(state.deep);
    w.uMid.value.copy(state.seaMid);
    w.uLight.value.copy(state.light);
    w.uFoam.value.copy(state.foam);
    w.uFogColor.value.copy(state.horizon);
    scene.background.copy(state.horizon);
    scene.fog.color.copy(state.fog);
    hemi.color.copy(state.hemiSky);
    hemi.groundColor.copy(state.hemiGround);
    hemi.intensity = state.hemiIntensity;
    key.color.copy(state.keyColor);
    key.intensity = state.keyIntensity;
    uniforms.stars.uAlpha.value = state.stars;
    uniforms.fireflies.uAlpha.value = 0.35 + 0.65 * state.lanterns;
  }
  applyAmbience(current);

  /** Change d'ambiance en douceur (durée en secondes, 0 = immédiat). */
  function setTheme(name, duration = 1.8) {
    const theme = THEMES[name] ?? THEMES.crepuscule;
    const target = themeState(theme);
    lightning.enabled = theme.lightning;
    if (duration <= 0) {
      current = target;
      transition = null;
      applyAmbience(current);
      return;
    }
    transition = { from: cloneState(current), to: target, t: 0, duration };
  }

  function update(dt, time) {
    sea.material.uniforms.uTime.value = time;
    stars.material.uniforms.uTime.value = time;
    uniforms.sky.uTime.value = time;

    if (transition) {
      transition.t += dt;
      const x = Math.min(transition.t / transition.duration, 1);
      lerpState(transition.from, transition.to, x * x * (3 - 2 * x), current);
      applyAmbience(current);
      if (x >= 1) transition = null;
    }

    // Éclairs d'orage : double flash puis décroissance
    if (lightning.enabled) {
      lightning.timer -= dt;
      if (lightning.timer <= 0) {
        lightning.flash = 1;
        lightning.second = 0.12;
        lightning.timer = 5 + Math.random() * 7;
        world.onLightning?.();
      }
      if (lightning.second > 0) {
        lightning.second -= dt;
        if (lightning.second <= 0) lightning.flash = Math.max(lightning.flash, 0.8);
      }
    }
    lightning.flash *= Math.exp(-dt * 7);
    const flash = lightning.flash * flashScale;
    uniforms.sky.uFlash.value = flash;
    hemi.intensity = current.hemiIntensity + flash * 1.6;
    key.color.copy(current.keyColor);
    key.intensity = current.keyIntensity;
    if (highlight > 0) {
      key.color.lerp(HIGHLIGHT_WARM, 0.55 * highlight);
      key.intensity *= 1 + 0.18 * highlight;
    } else if (highlight < 0) {
      key.color.lerp(HIGHLIGHT_COLD, -0.5 * highlight);
      key.intensity *= 1 + 0.15 * highlight;
    }

    for (const coin of coins) {
      const o = coin.userData.orbit;
      o.angle += o.speed * dt;
      coin.position.set(
        Math.cos(o.angle) * o.rx,
        o.y + Math.sin(time * 1.3 + o.angle * 3) * 0.18,
        Math.sin(o.angle) * o.rz - 1,
      );
      coin.rotation.y = time * o.spin;
    }
    for (const islet of islets) {
      const b = islet.userData.bob;
      islet.position.y = b.base + Math.sin(time * b.speed + b.phase) * 0.35;
      islet.rotation.y += dt * 0.03;
    }
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 70) cloud.position.x = -70;
    }
    for (const [i, lantern] of lanterns.entries()) {
      const flicker = 0.85 + 0.1 * Math.sin(time * 9 + i * 2) + 0.05 * Math.sin(time * 23 + i);
      lantern.userData.glow.material.opacity = 0.9 * current.lanterns * flicker;
      lantern.userData.glow.scale.setScalar((1.6 + 1.4 * current.lanterns) * flicker);
    }
    petals.update(dt, time);
    fireflies.update(time);
  }

  const pixelRatioUniforms = [
    stars.material.uniforms.uPixelRatio,
    fireflies.points.material.uniforms.uPixelRatio,
  ];

  world.pixelRatioUniforms = pixelRatioUniforms;
  return world;
}

// --- États d'ambiance -----------------------------------------------------------

function themeState(theme) {
  const c = (value) => new THREE.Color(value);
  return {
    top: c(theme.sky.top),
    mid: c(theme.sky.mid),
    horizon: c(theme.sky.horizon),
    glow: c(theme.sky.glow),
    below: c(theme.sky.below),
    sun: c(theme.sky.sun),
    fog: c(theme.fog),
    deep: c(theme.sea.deep),
    seaMid: c(theme.sea.mid),
    light: c(theme.sea.light),
    foam: c(theme.sea.foam),
    hemiSky: c(theme.hemi.sky),
    hemiGround: c(theme.hemi.ground),
    hemiIntensity: theme.hemi.intensity,
    keyColor: c(theme.key.color),
    keyIntensity: theme.key.intensity,
    stars: theme.stars,
    lanterns: theme.lanterns,
    aurora: theme.aurora,
  };
}

function cloneState(state) {
  return Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v?.isColor ? v.clone() : v]));
}

function lerpState(from, to, k, out) {
  for (const key of Object.keys(out)) {
    if (out[key]?.isColor) out[key].lerpColors(from[key], to[key], k);
    else out[key] = from[key] + (to[key] - from[key]) * k;
  }
}

// --- Corps de l'île ----------------------------------------------------------

function createIslandBody(rand) {
  const g = new THREE.Group();

  // Plateau herbeux au bord irrégulier
  const grassGeo = new THREE.CylinderGeometry(9.2, 9.0, 0.5, 64, 1);
  const p = grassGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1) continue;
    const a = Math.atan2(z, x);
    const k = 1 + 0.05 * Math.sin(a * 5 + 1.3) + 0.035 * Math.sin(a * 11 + 0.4);
    p.setX(i, x * k);
    p.setZ(i, z * k * 0.92);
  }
  grassGeo.computeVertexNormals();
  // Le corps de l'île reçoit les ombres mais n'en projette pas : sous le plateau,
  // elles ne tomberaient que sur la roche, hors champ (autant de moins dans la carte d'ombre).
  const grass = toonMesh(
    grassGeo,
    toonMaterial({ color: '#86d96a', ramp: RAMPS.hard, rim: 0.35, rimColor: '#f0ffd0' }),
    { outline: OUTLINE, cast: false },
  );
  grass.position.y = -1.05;
  g.add(grass);

  // Masse rocheuse stratifiée (couleurs par sommet)
  const rockGeo = new THREE.CylinderGeometry(9.0, 1.2, 7.5, 18, 7);
  const rp = rockGeo.attributes.position;
  const colors = [];
  const strata = ['#c9b49a', '#b39d84', '#9a8670', '#82725f', '#6a5d50'].map(
    (c) => new THREE.Color(c),
  );
  const jitter = new Map();
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const y = rp.getY(i);
    const z = rp.getZ(i);
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    if (!jitter.has(key)) jitter.set(key, [rand(), rand()]);
    const [j1, j2] = jitter.get(key);
    const t = (3.75 - y) / 7.5; // 0 en haut, 1 en bas
    const k = y > 3.7 ? 1 : 1 + (j1 - 0.5) * 0.28;
    rp.setXYZ(i, x * k, y + (y > 3.7 ? 0 : (j2 - 0.5) * 0.5), z * k * 0.92);
    colors.push(...strata[Math.min(strata.length - 1, Math.floor(t * strata.length))].toArray());
  }
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  rockGeo.computeVertexNormals();
  const rock = toonMesh(
    rockGeo,
    toonMaterial({
      color: '#ffffff',
      vertexColors: true,
      flatShading: true,
      ramp: RAMPS.hard,
      rim: 0.25,
    }),
    { outline: OUTLINE, cast: false },
  );
  rock.position.y = -1.3 - 3.75;
  g.add(rock);

  // Rochers suspendus sous l'île
  for (let i = 0; i < 6; i++) {
    const hanging = createRock(rand, { size: 0.6 + rand() * 0.6, color: '#7f7263' });
    hanging.castShadow = false;
    const a = rand() * Math.PI * 2;
    hanging.position.set(Math.cos(a) * 3.2, -8.6 - rand() * 1.2, Math.sin(a) * 3.2);
    g.add(hanging);
  }
  return g;
}

// --- Arène -------------------------------------------------------------------

function drawArenaFloor(ctx, size) {
  const c = size / 2;
  const R = size / 2;
  const rand = seededRandom(77);
  ctx.fillStyle = '#9d978e';
  ctx.fillRect(0, 0, size, size);

  // Dallage concentrique : chaque dalle a sa teinte de pierre
  const rings = [0.98, 0.84, 0.68, 0.5, 0.3];
  const shades = ['#c3bdb2', '#b7b1a6', '#aca69a', '#bfb8ab', '#a6a094'];
  for (let i = 0; i < rings.length; i++) {
    const outer = rings[i] * R;
    const inner = (rings[i + 1] ?? 0.22) * R;
    const tiles = Math.round(10 + rings[i] * 26);
    for (let t = 0; t < tiles; t++) {
      const a0 = (t / tiles) * Math.PI * 2 + i * 0.3;
      const a1 = ((t + 1) / tiles) * Math.PI * 2 + i * 0.3;
      ctx.beginPath();
      ctx.arc(c, c, outer, a0, a1);
      ctx.arc(c, c, inner, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = shades[Math.floor(rand() * shades.length)];
      ctx.fill();
    }
  }
  // Joints sombres entre les dalles
  ctx.strokeStyle = 'rgba(40, 44, 56, 0.55)';
  ctx.lineWidth = size * 0.005;
  for (let i = 0; i < rings.length; i++) {
    const outer = rings[i] * R;
    const inner = (rings[i + 1] ?? 0.22) * R;
    ctx.beginPath();
    ctx.arc(c, c, outer, 0, Math.PI * 2);
    ctx.stroke();
    const tiles = Math.round(10 + rings[i] * 26);
    for (let t = 0; t < tiles; t++) {
      const a = (t / tiles) * Math.PI * 2 + i * 0.3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * outer, c + Math.sin(a) * outer);
      ctx.stroke();
    }
  }

  // Bordure dorée
  ctx.strokeStyle = '#e8b23a';
  ctx.lineWidth = size * 0.014;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.93, 0, Math.PI * 2);
  ctx.stroke();

  // Emblème central : le cycle pierre → ciseaux → feuille
  const er = R * 0.22;
  ctx.fillStyle = '#152b45';
  ctx.beginPath();
  ctx.arc(c, c, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffcb47';
  ctx.lineWidth = size * 0.012;
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.014;
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 - Math.PI / 2 + 0.25;
    const a1 = a0 + (Math.PI * 2) / 3 - 0.5;
    const ar = er * 0.62;
    ctx.beginPath();
    ctx.arc(c, c, ar, a0, a1);
    ctx.stroke();
    const tip = [c + Math.cos(a1) * ar, c + Math.sin(a1) * ar];
    const dir = a1 + Math.PI / 2;
    const s = size * 0.025;
    ctx.fillStyle = '#ffcb47';
    ctx.beginPath();
    ctx.moveTo(tip[0] + Math.cos(dir) * s, tip[1] + Math.sin(dir) * s);
    ctx.lineTo(tip[0] + Math.cos(dir + 2.4) * s, tip[1] + Math.sin(dir + 2.4) * s);
    ctx.lineTo(tip[0] + Math.cos(dir - 2.4) * s, tip[1] + Math.sin(dir - 2.4) * s);
    ctx.closePath();
    ctx.fill();
    const dot = a0 - 0.25;
    ctx.beginPath();
    ctx.arc(c + Math.cos(dot) * ar, c + Math.sin(dot) * ar, size * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
}

function createArena() {
  const g = new THREE.Group();
  const stone = toonMaterial({ color: '#bdb6aa', ramp: RAMPS.soft, rim: 0.25 });
  const stoneDark = toonMaterial({ color: '#8a8378', ramp: RAMPS.soft, rim: 0.2 });
  const gold = toonMaterial({
    color: '#ffc94a',
    ramp: RAMPS.soft,
    rim: 0.45,
    spec: 0.9,
    specSize: 0.9,
  });

  const profile = [
    [0, 0],
    [ARENA_RADIUS - 0.12, 0],
    [ARENA_RADIUS, -0.06],
    [ARENA_RADIUS + 0.06, -0.2],
    [ARENA_RADIUS + 0.06, -0.42],
    [ARENA_RADIUS - 0.06, -0.56],
    [0, -0.56],
  ]
    .reverse() // profil parcouru de bas en haut : normales vers l'extérieur
    .map(([r, y]) => new THREE.Vector2(r, y));
  g.add(toonMesh(new THREE.LatheGeometry(profile, 72), stone, { outline: OUTLINE }));

  const tier = [
    [0, -0.5],
    [ARENA_RADIUS + 0.45, -0.5],
    [ARENA_RADIUS + 0.55, -0.6],
    [ARENA_RADIUS + 0.55, -0.85],
    [0, -0.85],
  ]
    .reverse()
    .map(([r, y]) => new THREE.Vector2(r, y));
  g.add(toonMesh(new THREE.LatheGeometry(tier, 72), stoneDark, { outline: OUTLINE }));

  // Sol décoré
  const floorTex = canvasTexture(1024, 1024, (ctx, w) => drawArenaFloor(ctx, w));
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_RADIUS - 0.1, 72).rotateX(-Math.PI / 2),
    toonMaterial({ color: '#ffffff', map: floorTex, ramp: RAMPS.soft, rim: 0 }),
  );
  floor.position.y = 0.012;
  floor.receiveShadow = true; // reçoit l'ombre des mains sans en projeter
  g.add(floor);

  // Liseré doré
  const trim = toonMesh(new THREE.TorusGeometry(ARENA_RADIUS - 0.04, 0.07, 10, 96), gold, {
    outline: { color: '#14213a', thickness: 1.4 },
  });
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.02;
  g.add(trim);

  // Bornes dorées sur le pourtour
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const stud = toonMesh(new THREE.SphereGeometry(0.11, 14, 10), gold, {
      outline: { color: '#14213a', thickness: 1.4 },
    });
    stud.position.set(
      Math.cos(a) * (ARENA_RADIUS + 0.07),
      -0.3,
      Math.sin(a) * (ARENA_RADIUS + 0.07),
    );
    g.add(stud);
  }
  return g;
}

// --- Pétales de cerisier -----------------------------------------------------

function createPetals(rand, count) {
  const geo = new THREE.PlaneGeometry(0.12, 0.08);
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  const palette = ['#8fd66a', '#b8ec84', '#6fbf52', '#f6f2c8'].map((c) => new THREE.Color(c));
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      pos: new THREE.Vector3(rand() * 22 - 11, rand() * 10 - 1, rand() * 16 - 11),
      speed: 0.25 + rand() * 0.35,
      sway: rand() * 10,
      spin: new THREE.Vector3(rand() * 2, rand() * 2, rand() * 2),
    });
    mesh.setColorAt(i, palette[Math.floor(rand() * palette.length)]);
  }
  const dummy = new THREE.Object3D();
  return {
    mesh,
    update(dt, time) {
      for (let i = 0; i < count; i++) {
        const it = items[i];
        it.pos.y -= it.speed * dt;
        it.pos.x += (0.25 + Math.sin(time * 0.7 + it.sway) * 0.35) * dt;
        if (it.pos.y < -2.5 || it.pos.x > 12) {
          it.pos.set(rand() * 22 - 12, 8 + rand() * 2, rand() * 16 - 11);
        }
        dummy.position.copy(it.pos);
        dummy.rotation.set(time * it.spin.x + it.sway, time * it.spin.y, time * it.spin.z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// --- Lucioles -----------------------------------------------------------------

function createFireflies(rand, count) {
  const base = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 4.8 + rand() * 4.5;
    base.set([Math.cos(a) * r, -0.6 + rand() * 3.5, Math.sin(a) * r * 0.9], i * 3);
    seeds[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uAlpha;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * ( 0.3 + aSeed * 0.4 ) + aSeed * 30.0;
        p += vec3( sin( t ) * 0.6, sin( t * 1.7 ) * 0.35, cos( t * 0.8 ) * 0.6 );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_Position = projectionMatrix * mv;
        vAlpha = uAlpha * ( 0.35 + 0.65 * pow( 0.5 + 0.5 * sin( uTime * ( 2.0 + aSeed * 3.0 ) + aSeed * 50.0 ), 3.0 ) );
        gl_PointSize = ( 10.0 + aSeed * 8.0 ) * uPixelRatio * ( 10.0 / -mv.z );
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length( gl_PointCoord - 0.5 );
        float core = smoothstep( 0.5, 0.0, d );
        gl_FragColor = vec4( vec3( 1.0, 0.86, 0.5 ), core * core * vAlpha );
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return {
    points,
    update(time) {
      material.uniforms.uTime.value = time;
    },
  };
}

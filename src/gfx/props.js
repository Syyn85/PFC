import * as THREE from 'three';
import { RAMPS, canvasTexture, glowSprite, toonMaterial, toonMesh } from './toon.js';

/**
 * Éléments de décor procéduraux : arbres en fleurs, lanternes, rochers,
 * cristaux, pièces du token, torii, nuages…
 */

const OUTLINE = { color: '#231a3d', thickness: 2 };
const THIN = { color: '#231a3d', thickness: 1.3 };

const mats = {};
function mat(key, params) {
  mats[key] ??= toonMaterial(params);
  return mats[key];
}

// Déformation par bruit simple (pour les rochers / l'île)
function displace(geometry, rand, amount, { flatBottom = false } = {}) {
  const p = geometry.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!offsets.has(key)) offsets.set(key, 1 + (rand() - 0.5) * amount);
    const k = offsets.get(key);
    const y = p.getY(i);
    p.setXYZ(i, p.getX(i) * k, flatBottom && y < 0 ? y : y * k, p.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// --- Rochers & cristaux ------------------------------------------------------

export function createRock(rand, { size = 0.5, color = '#a99bc4' } = {}) {
  const geo = displace(new THREE.DodecahedronGeometry(size, 0), rand, 0.35);
  geo.scale(1, 0.7, 1);
  const rock = toonMesh(
    geo,
    mat(`rock-${color}`, { color, flatShading: true, ramp: RAMPS.hard, rim: 0.2 }),
    { outline: OUTLINE },
  );
  rock.rotation.y = rand() * Math.PI;
  return rock;
}

export function createCrystalCluster(rand, { color = '#5ff2e0' } = {}) {
  const group = new THREE.Group();
  const material = mat(`crystal-${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 0.35,
    flatShading: true,
    rim: 0.5,
    rimColor: '#ffffff',
    spec: 0.8,
    specSize: 0.9,
  });
  const count = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const h = 0.5 + rand() * 0.9;
    const geo = new THREE.OctahedronGeometry(0.22, 0);
    geo.scale(1, h / 0.22 / 2, 1);
    const crystal = toonMesh(geo, material, { outline: THIN });
    crystal.position.set((rand() - 0.5) * 0.5, h * 0.4, (rand() - 0.5) * 0.5);
    crystal.rotation.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6);
    group.add(crystal);
  }
  const glow = glowSprite(color, 2.2, 0.35);
  glow.position.y = 0.6;
  group.add(glow);
  return group;
}

// --- Arbres ------------------------------------------------------------------

const FOLIAGE = [
  ['#ff9cc8', '#ffc7df'], // cerisier
  ['#ff86b6', '#ffb8d6'],
  ['#8fe3b5', '#c6f5d8'], // menthe
];

export function createTree(rand, { scale = 1 } = {}) {
  const tree = new THREE.Group();
  const trunkMat = mat('trunk', { color: '#7a4a5a', ramp: RAMPS.hard, rim: 0.15 });
  const trunkHeight = 1.4 + rand() * 0.6;
  const trunk = toonMesh(
    new THREE.CylinderGeometry(0.1, 0.18, trunkHeight, 8).translate(0, trunkHeight / 2, 0),
    trunkMat,
    { outline: OUTLINE },
  );
  trunk.rotation.z = (rand() - 0.5) * 0.2;
  tree.add(trunk);

  const [base, light] = FOLIAGE[Math.floor(rand() * FOLIAGE.length)];
  const leafMat = mat(`leaf-${base}`, {
    color: base,
    flatShading: true,
    ramp: RAMPS.soft,
    rim: 0.35,
    rimColor: light,
  });
  const blobs = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < blobs; i++) {
    const r = 0.55 + rand() * 0.35;
    const blob = toonMesh(displace(new THREE.IcosahedronGeometry(r, 1), rand, 0.18), leafMat, {
      outline: OUTLINE,
    });
    const a = (i / blobs) * Math.PI * 2 + rand();
    blob.position.set(
      Math.cos(a) * 0.45 * (i > 0 ? 1 : 0),
      trunkHeight + 0.2 + rand() * 0.4,
      Math.sin(a) * 0.45 * (i > 0 ? 1 : 0),
    );
    tree.add(blob);
  }
  tree.scale.setScalar(scale);
  tree.rotation.y = rand() * Math.PI * 2;
  return tree;
}

// --- Lanterne de pierre (tōrō) -----------------------------------------------

export function createLantern() {
  const g = new THREE.Group();
  const stone = mat('lantern-stone', { color: '#cdbfdc', ramp: RAMPS.soft, rim: 0.25 });
  const dark = mat('lantern-dark', { color: '#8e7fb0', ramp: RAMPS.soft, rim: 0.2 });
  const flame = new THREE.MeshBasicMaterial({ color: '#ffd27a' });

  const add = (geo, material, y, outline = OUTLINE) => {
    const m = toonMesh(geo, material, { outline });
    m.position.y = y;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 6), dark, 0.09);
  add(new THREE.CylinderGeometry(0.13, 0.16, 0.9, 10), stone, 0.63);
  add(new THREE.CylinderGeometry(0.34, 0.28, 0.12, 6), dark, 1.12);
  add(new THREE.BoxGeometry(0.4, 0.36, 0.4), stone, 1.36);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.24), flame);
  light.position.y = 1.36;
  g.add(light);
  const light2 = light.clone();
  light2.rotation.y = Math.PI / 2;
  g.add(light2);
  add(new THREE.ConeGeometry(0.52, 0.34, 4).rotateY(Math.PI / 4), dark, 1.71);
  add(new THREE.SphereGeometry(0.08, 10, 8), stone, 1.92, THIN);

  const glow = glowSprite('#ffb35c', 2.4, 0.55);
  glow.position.y = 1.36;
  g.add(glow);
  g.userData.glow = glow;
  g.userData.flame = light;
  return g;
}

// --- Torii -------------------------------------------------------------------

export function createTorii() {
  const g = new THREE.Group();
  const red = mat('torii-red', {
    color: '#ff5a4f',
    ramp: RAMPS.soft,
    rim: 0.35,
    rimColor: '#ffd0a8',
  });
  const black = mat('torii-black', { color: '#3a2a4f', ramp: RAMPS.soft, rim: 0.25, spec: 0.3 });
  const gold = mat('gold', {
    color: '#ffcb47',
    ramp: RAMPS.soft,
    rim: 0.4,
    spec: 0.9,
    specSize: 0.9,
  });

  for (const x of [-2.6, 2.6]) {
    const pillar = toonMesh(
      new THREE.CylinderGeometry(0.2, 0.24, 4.6, 16).translate(0, 2.3, 0),
      red,
      { outline: OUTLINE },
    );
    pillar.position.x = x;
    g.add(pillar);
    const foot = toonMesh(new THREE.CylinderGeometry(0.3, 0.32, 0.4, 16), black, {
      outline: OUTLINE,
    });
    foot.position.set(x, 0.2, 0);
    g.add(foot);
  }

  // Linteau supérieur incurvé (kasagi) : extrusion d'un profil courbe
  const shape = new THREE.Shape();
  const W = 3.7;
  shape.moveTo(-W, 0.15);
  shape.quadraticCurveTo(0, -0.12, W, 0.15);
  shape.lineTo(W + 0.15, 0.48);
  shape.quadraticCurveTo(0, 0.18, -W - 0.15, 0.48);
  shape.closePath();
  const kasagiGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 24,
  }).translate(0, 0, -0.25);
  const kasagi = toonMesh(kasagiGeo, black, { outline: OUTLINE });
  kasagi.position.y = 4.55;
  g.add(kasagi);
  const shimaki = toonMesh(new THREE.BoxGeometry(6.6, 0.28, 0.42), red, { outline: OUTLINE });
  shimaki.position.y = 4.55;
  g.add(shimaki);

  const nuki = toonMesh(new THREE.BoxGeometry(6.2, 0.22, 0.28), red, { outline: OUTLINE });
  nuki.position.y = 3.55;
  g.add(nuki);

  // Plaque centrale (gakuzuka) dorée
  const plaque = toonMesh(new THREE.BoxGeometry(0.5, 0.75, 0.16), gold, { outline: THIN });
  plaque.position.y = 4.05;
  g.add(plaque);
  return g;
}

// --- Pièces du token ---------------------------------------------------------

let coinFaceTexture = null;
function drawCoinFace(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffd04a';
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = w * 0.035;
  ctx.strokeStyle = '#e59a12';
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  // petites étoiles sur le pourtour
  ctx.fillStyle = '#fff1b0';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * w * 0.45, cy + Math.sin(a) * w * 0.45, w * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = `${Math.round(w * 0.26)}px "Lilita One", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w * 0.03;
  ctx.strokeStyle = '#8a4b00';
  ctx.strokeText('PFC', cx, cy + w * 0.015);
  ctx.fillStyle = '#fff6d6';
  ctx.fillText('PFC', cx, cy + w * 0.015);
}

export function getCoinFaceTexture() {
  if (coinFaceTexture) return coinFaceTexture;
  coinFaceTexture = canvasTexture(256, 256, drawCoinFace);
  // Redessine une fois la police chargée
  document.fonts?.load('64px "Lilita One"').then(() => {
    drawCoinFace(coinFaceTexture.image.getContext('2d'), 256, 256);
    coinFaceTexture.needsUpdate = true;
  });
  return coinFaceTexture;
}

const coinGeometryCache = {};
export function createCoin({ radius = 0.5, thickness = 0.12, outline = OUTLINE } = {}) {
  const key = `${radius}:${thickness}`;
  coinGeometryCache[key] ??= new THREE.CylinderGeometry(radius, radius, thickness, 40, 1).rotateX(
    Math.PI / 2,
  );
  const g = new THREE.Group();
  const gold = mat('coin-edge', {
    color: '#f2a91c',
    ramp: RAMPS.soft,
    rim: 0.4,
    spec: 0.8,
    specSize: 0.9,
  });
  // Choix de performance : les pièces en orbite ne projettent pas d'ombre (bord et
  // faces). Leurs taches mobiles sur le bord de l'arène coûtaient 21 appels de rendu
  // dans la passe d'ombre.
  g.add(toonMesh(coinGeometryCache[key], gold, { outline, cast: false }));
  const faceMat = mat('coin-face', {
    color: '#ffffff',
    map: getCoinFaceTexture(),
    rim: 0.25,
    spec: 0.6,
    specSize: 0.93,
  });
  const faceGeo = new THREE.CircleGeometry(radius * 0.97, 40);
  for (const side of [1, -1]) {
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.z = (thickness / 2 + 0.002) * side;
    if (side < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  return g;
}

// --- Nuages ------------------------------------------------------------------

export function createCloud(rand, { scale = 1, color = '#fff0f4' } = {}) {
  const g = new THREE.Group();
  const material = mat(`cloud-${color}`, {
    color,
    ramp: RAMPS.hard,
    rim: 0.3,
    rimColor: '#ffffff',
  });
  const puffs = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < puffs; i++) {
    const r = 0.8 + rand() * 0.9;
    // Tessellation légère : nuages lointains, le contour lissé garde la silhouette ronde
    const puff = toonMesh(new THREE.SphereGeometry(r, 10, 7), material, {
      outline: { color: '#8f5f9e', thickness: 1.6 },
      cast: false,
      receive: false,
    });
    puff.position.set(
      (i - puffs / 2) * 1.1 + rand() * 0.4,
      rand() * 0.6 + (r - 0.8) * 0.4,
      (rand() - 0.5) * 1.2,
    );
    puff.scale.y = 0.75;
    g.add(puff);
  }
  g.scale.setScalar(scale);
  return g;
}

// --- Îlots flottants ---------------------------------------------------------

export function createIslet(rand, { radius = 1.2 } = {}) {
  const g = new THREE.Group();
  const rockGeo = displace(
    new THREE.ConeGeometry(radius, radius * 1.8, 7, 3).rotateX(Math.PI),
    rand,
    0.25,
  );
  const rock = toonMesh(
    rockGeo,
    mat('islet-rock', { color: '#b98a8f', flatShading: true, ramp: RAMPS.hard, rim: 0.25 }),
    {
      outline: OUTLINE,
    },
  );
  rock.position.y = -radius * 0.9;
  g.add(rock);
  const grass = toonMesh(
    new THREE.CylinderGeometry(radius * 1.04, radius * 0.98, 0.22, 7),
    mat('islet-grass', { color: '#7fd67a', ramp: RAMPS.hard, rim: 0.3, rimColor: '#e6ffd2' }),
    { outline: OUTLINE },
  );
  grass.position.y = 0.05;
  g.add(grass);
  if (rand() > 0.4) {
    const tree = createTree(rand, { scale: radius * 0.45 });
    tree.position.y = 0.12;
    g.add(tree);
  }
  return g;
}

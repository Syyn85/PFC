import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAMPS, glowSprite, toonMaterial, toonMesh } from './toon.js';
import { ease } from '../core/tween.js';

/**
 * Main gantée façon cartoon, construite 100 % procéduralement, entièrement
 * articulée (4 doigts × 3 phalanges + pouce) et animable par poses.
 *
 * Repère local : les doigts pointent vers +X, le dos de la main regarde +Z,
 * les doigts se replient vers -Z (paume), le pouce est du côté +Y.
 */

const PALM = { w: 0.78, h: 0.84, d: 0.46, r: 0.21 };
const PALM_FRONT = PALM.w / 2 - 0.07;
const ARM_LENGTH = 3.6;

const FINGERS = [
  { name: 'index', y: 0.27, radius: 0.112, lengths: [0.28, 0.21, 0.17] },
  { name: 'middle', y: 0.09, radius: 0.116, lengths: [0.31, 0.23, 0.18] },
  { name: 'ring', y: -0.09, radius: 0.11, lengths: [0.28, 0.21, 0.17] },
  { name: 'pinky', y: -0.265, radius: 0.098, lengths: [0.22, 0.17, 0.14] },
];
const THUMB = { radius: 0.122, lengths: [0.25, 0.2], position: [-0.06, PALM.h / 2 - 0.1, 0.02] };

// [écartement, phalange 1, phalange 2, phalange 3] ; pouce : [écartement, rotation, flexion]
const CURLED = [1.45, 1.62, 1.15];
export const POSES = {
  relaxed: {
    index: [0.07, 0.32, 0.42, 0.28],
    middle: [0.02, 0.38, 0.46, 0.3],
    ring: [-0.04, 0.44, 0.52, 0.34],
    pinky: [-0.1, 0.5, 0.58, 0.38],
    thumb: [0.6, 0.28, 0.25],
  },
  rock: {
    index: [0.02, ...CURLED],
    middle: [0, ...CURLED],
    ring: [-0.02, ...CURLED],
    pinky: [-0.04, 1.42, 1.58, 1.1],
    thumb: [0.05, 0.42, 0.42],
  },
  paper: {
    index: [0.17, 0.04, 0.05, 0.03],
    middle: [0.05, 0.02, 0.04, 0.02],
    ring: [-0.07, 0.04, 0.05, 0.03],
    pinky: [-0.21, 0.07, 0.08, 0.05],
    thumb: [0.98, 0.06, 0.1],
  },
  scissors: {
    index: [0.26, 0.02, 0.03, 0.02],
    middle: [-0.17, 0.02, 0.03, 0.02],
    ring: [-0.02, ...CURLED],
    pinky: [-0.04, 1.42, 1.58, 1.1],
    thumb: [-0.22, 1.0, 0.55],
  },
  // Poses de portrait (carte des îles)
  point: {
    index: [0.08, 0.02, 0.03, 0.02],
    middle: [0, ...CURLED],
    ring: [-0.02, ...CURLED],
    pinky: [-0.04, 1.42, 1.58, 1.1],
    thumb: [-0.22, 1.0, 0.55],
  },
  fox: {
    index: [0.22, 0.05, 0.1, 0.05],
    middle: [0.02, 1.15, 0.65, 0.2],
    ring: [-0.02, 1.15, 0.65, 0.2],
    pinky: [-0.26, 0.05, 0.1, 0.05],
    thumb: [-0.35, 0.9, 0.2],
  },
};

export const HAND_PALETTES = {
  player: {
    glove: '#fff4e4',
    stitch: '#d8b9a8',
    cuff: '#43d1ff',
    cuffLip: '#e9fbff',
    sleeve: '#2f63f0',
    sleeveDark: '#1f3fae',
    accent: '#ffd23f',
    outline: '#1d1840',
    glove_spec: 0,
  },
  bot: {
    glove: '#e6e9f8',
    stitch: '#a9b0cf',
    cuff: '#ff4f7b',
    cuffLip: '#ffe1ea',
    sleeve: '#4a4470',
    sleeveDark: '#2f2a4a',
    accent: '#ff4f7b',
    outline: '#1d1840',
    glove_spec: 0.55,
  },
};

// --- Géométries (partagées entre toutes les mains) ---------------------------

const geometryCache = new Map();
function cached(key, build) {
  if (!geometryCache.has(key)) geometryCache.set(key, build());
  return geometryCache.get(key);
}

function palmGeometry() {
  return cached('palm', () => {
    const box = new RoundedBoxGeometry(PALM.w, PALM.h, PALM.d, 6, PALM.r);
    box.deleteAttribute('normal');
    box.deleteAttribute('uv');
    const geo = mergeVertices(box);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const back = THREE.MathUtils.clamp(-x / (PALM.w / 2), 0, 1);
      const ny = y / (PALM.h / 2);
      const taper = 1 - 0.26 * back * back;
      const puff = 1 + 0.16 * (1 - ny * ny) * (1 - back * 0.6);
      p.setXYZ(i, x, y * taper, z * puff * (1 - 0.1 * back));
    }
    geo.computeVertexNormals();
    return geo;
  });
}

/** Capsule orientée selon +X, dont l'articulation (pivot) est à l'origine. */
function segmentGeometry(radius, length) {
  return cached(`seg:${radius.toFixed(4)}:${length}`, () => {
    const geo = new THREE.CapsuleGeometry(radius, length, 8, 16);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(length / 2, 0, 0);
    return geo;
  });
}

function cuffGeometry() {
  return cached('cuff', () => {
    // Profil fermé (extérieur puis intérieur) d'un revers évasé, axe +Y
    const pts = [
      [0.27, 0.0],
      [0.3, -0.06],
      [0.36, -0.16],
      [0.44, -0.25],
      [0.49, -0.3],
      [0.5, -0.34],
      [0.47, -0.37],
      [0.41, -0.36],
      [0.33, -0.3],
      [0.27, -0.2],
      [0.24, -0.06],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    pts.push(pts[0].clone());
    // LatheGeometry oriente ses normales vers l'extérieur pour un profil parcouru
    // de bas en haut : on inverse l'ordre (sinon le contour recouvre la pièce).
    pts.reverse();
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.rotateZ(-Math.PI / 2); // axe Y -> axe X
    return geo;
  });
}

// --- Rig ---------------------------------------------------------------------

export class HandRig {
  /**
   * @param {object} opts
   * @param {'player'|'bot'} opts.team
   * @param {boolean} [opts.withArm=true] bras + manche (désactivé pour les icônes)
   */
  constructor({ team = 'player', withArm = true, palette = {} } = {}) {
    this.team = team;
    this.palette = { ...HAND_PALETTES[team], ...palette };
    this.phase = team === 'player' ? 0 : 1.7;
    this.idle = 1;
    this.basePosition = new THREE.Vector3();
    this.forward = new THREE.Vector3(1, 0, 0);

    // Valeurs animées (interpolées par le gestionnaire de tweens)
    this.motion = { lift: 0, wrist: 0, twist: 0, push: 0, drop: 0, stretch: 1, glow: 0 };
    this.poseValues = {};
    this.channels = [];

    this.#buildMaterials();
    this.root = new THREE.Group();
    this.root.name = `hand-${team}`;
    this.pivot = new THREE.Group();
    this.pivot.position.x = -ARM_LENGTH;
    this.arm = new THREE.Group();
    this.arm.position.x = ARM_LENGTH;
    this.wrist = new THREE.Group();
    this.root.add(this.pivot);
    this.pivot.add(this.arm);
    this.arm.add(this.wrist);

    this.#buildHand();
    if (withArm) this.#buildArm();
    this.snapPose('relaxed');
  }

  #buildMaterials() {
    const p = this.palette;
    this.mats = {
      glove: toonMaterial({
        color: p.glove,
        ramp: RAMPS.smooth,
        rim: 0.32,
        spec: p.glove_spec,
        specSize: 0.94,
      }),
      stitch: toonMaterial({ color: p.stitch, rim: 0 }),
      cuff: toonMaterial({ color: p.cuff, rim: 0.3, spec: 0.35 }),
      cuffLip: toonMaterial({ color: p.cuffLip, rim: 0.2 }),
      sleeve: toonMaterial({ color: p.sleeve, rim: 0.4, rimColor: '#c9d8ff' }),
      sleeveDark: toonMaterial({ color: p.sleeveDark, rim: 0.35, spec: 0.4 }),
      accent: toonMaterial({ color: p.accent, rim: 0.3, spec: 0.6, specSize: 0.9 }),
      led: new THREE.MeshBasicMaterial({ color: p.accent }),
    };
    this.outline = { color: p.outline, thickness: 2.4 };
    this.thinOutline = { color: p.outline, thickness: 1.4 };
  }

  /** Recolore la main (changement d'adversaire). */
  setPalette(palette = {}) {
    this.palette = { ...HAND_PALETTES[this.team], ...palette };
    const p = this.palette;
    const { mats } = this;
    mats.glove.color.set(p.glove);
    mats.glove.userData.toon.uSpecStrength.value = p.glove_spec;
    mats.stitch.color.set(p.stitch);
    mats.cuff.color.set(p.cuff);
    mats.cuffLip.color.set(p.cuffLip);
    mats.sleeve.color.set(p.sleeve);
    mats.sleeveDark.color.set(p.sleeveDark);
    mats.accent.color.set(p.accent);
    mats.led.color.set(p.accent);
    this.ledGlow?.material.color.set(p.accent);
  }

  #buildHand() {
    const { glove, stitch } = this.mats;

    this.palm = new THREE.Group();
    this.palm.position.x = 0.62;
    this.wrist.add(this.palm);

    const palmMesh = toonMesh(palmGeometry(), glove, { outline: this.outline });
    this.palm.add(palmMesh);

    // Les trois coutures emblématiques sur le dos du gant
    const stitchGeo = segmentGeometry(0.018, 0.3);
    for (const y of [-0.17, 0, 0.17]) {
      const s = toonMesh(stitchGeo, stitch, { outline: null, cast: false });
      s.position.set(-0.24, y * 0.92, PALM.d / 2 + 0.035);
      s.rotation.z = y * 0.25;
      this.palm.add(s);
    }

    for (const finger of FINGERS) {
      const base = new THREE.Group();
      base.position.set(PALM_FRONT, finger.y, 0);
      this.palm.add(base);
      this.#channel(`${finger.name}.0`, base, 'z');

      let parent = base;
      finger.lengths.forEach((length, i) => {
        const joint = new THREE.Group();
        joint.position.x = i === 0 ? 0 : finger.lengths[i - 1];
        parent.add(joint);
        this.#channel(`${finger.name}.${i + 1}`, joint, 'y');
        const radius = finger.radius * (1 - i * 0.045);
        joint.add(toonMesh(segmentGeometry(radius, length), glove, { outline: this.outline }));
        parent = joint;
      });
    }

    const thumbBase = new THREE.Group();
    thumbBase.position.set(...THUMB.position);
    this.palm.add(thumbBase);
    this.#channel('thumb.0', thumbBase, 'z');
    const thumbYaw = new THREE.Group();
    thumbBase.add(thumbYaw);
    this.#channel('thumb.1', thumbYaw, 'y');
    thumbYaw.add(
      toonMesh(segmentGeometry(THUMB.radius, THUMB.lengths[0]), glove, { outline: this.outline }),
    );
    const thumbTip = new THREE.Group();
    thumbTip.position.x = THUMB.lengths[0];
    thumbYaw.add(thumbTip);
    this.#channel('thumb.2', thumbTip, 'y');
    thumbTip.add(
      toonMesh(segmentGeometry(THUMB.radius * 0.95, THUMB.lengths[1]), glove, {
        outline: this.outline,
      }),
    );

    // Revers du gant
    const cuff = toonMesh(cuffGeometry(), this.mats.cuff, { outline: this.outline });
    cuff.position.x = 0.32;
    this.wrist.add(cuff);
    const lip = toonMesh(new THREE.TorusGeometry(0.48, 0.055, 12, 48), this.mats.cuffLip, {
      outline: this.thinOutline,
    });
    lip.rotation.y = Math.PI / 2;
    lip.position.x = 0.32 - 0.34;
    this.wrist.add(lip);
  }

  #buildArm() {
    const { sleeve, sleeveDark, accent, led } = this.mats;
    const sleeveLength = ARM_LENGTH + 4.5;
    const sleeveMesh = toonMesh(segmentGeometry(0.34, sleeveLength), sleeve, {
      outline: this.outline,
    });
    sleeveMesh.position.x = -sleeveLength;
    this.arm.add(sleeveMesh);

    if (this.team === 'player') {
      // Manche en tissu : bandes et coutures
      for (const [x, mat] of [
        [-0.32, sleeveDark],
        [-0.62, accent],
        [-0.86, sleeveDark],
      ]) {
        const band = toonMesh(new THREE.TorusGeometry(0.345, 0.05, 10, 40), mat, {
          outline: this.thinOutline,
        });
        band.rotation.y = Math.PI / 2;
        band.position.x = x;
        this.arm.add(band);
      }
    } else {
      // Bras robotique : anneaux segmentés, rivets et LED
      for (let i = 0; i < 4; i++) {
        const x = -0.3 - i * 0.55;
        const ring = toonMesh(
          new THREE.CylinderGeometry(0.39, 0.39, 0.16, 32).rotateZ(Math.PI / 2),
          sleeveDark,
          { outline: this.thinOutline },
        );
        ring.position.x = x;
        this.arm.add(ring);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + i * 0.4;
          const rivet = toonMesh(new THREE.SphereGeometry(0.035, 10, 8), accent, {
            outline: null,
            cast: false,
          });
          rivet.position.set(x, Math.cos(a) * 0.395, Math.sin(a) * 0.395);
          this.arm.add(rivet);
        }
      }
      this.ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.352, 0.03, 8, 48), led);
      this.ledRing.rotation.y = Math.PI / 2;
      this.ledRing.position.x = -0.58;
      this.arm.add(this.ledRing);
      this.ledGlow = glowSprite(this.palette.accent, 1.3, 0.35);
      this.ledGlow.position.set(-0.58, 0, 0.2);
      this.arm.add(this.ledGlow);
    }
  }

  #channel(key, object, axis) {
    this.channels.push({ key, object, axis });
    this.poseValues[key] = 0;
  }

  static flattenPose(name) {
    const pose = POSES[name];
    if (!pose) throw new Error(`Pose inconnue : ${name}`);
    const flat = {};
    for (const [part, values] of Object.entries(pose)) {
      values.forEach((v, i) => (flat[`${part}.${i}`] = v));
    }
    return flat;
  }

  /** Place la hiérarchie dans la scène (position du poignet + orientation). */
  place(position, { facing = 1, tilt = -0.22, yaw = 0 } = {}) {
    this.basePosition.copy(position);
    this.root.position.copy(position);
    this.root.rotation.set(tilt, facing > 0 ? yaw : Math.PI + yaw, 0);
    this.forward.set(facing, 0, 0);
    return this;
  }

  snapPose(name) {
    Object.assign(this.poseValues, HandRig.flattenPose(name));
    this.poseName = name;
    this.#applyPose();
  }

  setPose(tweens, name, { duration = 0.22, easing = ease.outBack } = {}) {
    this.poseName = name;
    return tweens.to(this.poseValues, HandRig.flattenPose(name), { duration, ease: easing });
  }

  #applyPose() {
    for (const { key, object, axis } of this.channels) object.rotation[axis] = this.poseValues[key];
  }

  /** Position monde du bout de la main (pour placer les effets). */
  getFrontPosition(target = new THREE.Vector3()) {
    return this.palm.localToWorld(target.set(PALM_FRONT + 0.25, 0, 0));
  }

  update(dt, time) {
    this.#applyPose();
    const m = this.motion;
    const idle = this.idle;
    const bob = Math.sin(time * 2.2 + this.phase) * 0.03 * idle;
    const sway = Math.sin(time * 1.35 + this.phase * 2) * 0.05 * idle;

    this.pivot.rotation.z = m.lift + bob;
    this.wrist.rotation.z = m.wrist + sway;
    this.wrist.rotation.x = m.twist;
    const s = m.stretch;
    this.wrist.scale.set(s, 1 / Math.sqrt(s), 1 / Math.sqrt(s));
    this.root.position.copy(this.basePosition).addScaledVector(this.forward, m.push);
    this.root.position.y += m.drop;

    if (this.ledRing) {
      const pulse = 0.55 + 0.45 * Math.sin(time * (3 + m.glow * 9));
      this.ledGlow.material.opacity = 0.18 + 0.4 * pulse * (0.5 + m.glow);
      this.ledRing.material.color.set(this.palette.accent).multiplyScalar(0.75 + 0.5 * pulse);
    }
  }

  // --- Animations de haut niveau (toutes asynchrones) ---

  /** Un coup de poing "Pierre… Feuille… Ciseaux" : se résout à l'impact en bas. */
  async pump(tweens, { height = 0.3, onApex } = {}) {
    await tweens.to(
      this.motion,
      { lift: height, wrist: 0.24 },
      { duration: 0.21, ease: ease.outCubic },
    );
    onApex?.();
    await tweens.to(
      this.motion,
      { lift: -0.04, wrist: -0.2 },
      { duration: 0.13, ease: ease.inQuad },
    );
    tweens.to(this.motion, { lift: 0, wrist: 0 }, { duration: 0.16, ease: ease.outQuad });
  }

  /** Dévoile un coup avec un effet "pop" (squash & stretch). */
  reveal(tweens, move) {
    this.motion.stretch = 1.32;
    tweens.to(this.motion, { stretch: 1 }, { duration: 0.65, ease: ease.outElastic });
    return this.setPose(tweens, move, { duration: 0.16 });
  }

  async lunge(tweens) {
    await tweens.to(
      this.motion,
      { push: 0.5, wrist: -0.1 },
      { duration: 0.11, ease: ease.outCubic },
    );
    await tweens.to(this.motion, { push: 0, wrist: 0 }, { duration: 0.45, ease: ease.outBack });
  }

  async recoil(tweens) {
    await tweens.to(
      this.motion,
      { push: -0.55, twist: 0.5, lift: 0.08 },
      { duration: 0.12, ease: ease.outCubic },
    );
    await tweens.to(
      this.motion,
      { push: 0, twist: 0, lift: 0 },
      { duration: 0.7, ease: ease.outElastic },
    );
  }

  async celebrate(tweens) {
    await tweens.to(this.motion, { lift: 0.16 }, { duration: 0.2, ease: ease.outBack });
    for (let i = 0; i < 3; i++) {
      await tweens.to(
        this.motion,
        { wrist: 0.32, twist: 0.25 },
        { duration: 0.12, ease: ease.outQuad },
      );
      await tweens.to(
        this.motion,
        { wrist: -0.1, twist: -0.25 },
        { duration: 0.12, ease: ease.outQuad },
      );
    }
    await tweens.to(
      this.motion,
      { lift: 0, wrist: 0, twist: 0 },
      { duration: 0.35, ease: ease.outBack },
    );
  }

  async slump(tweens) {
    this.setPose(tweens, 'relaxed', { duration: 0.6, easing: ease.outCubic });
    await tweens.to(
      this.motion,
      { lift: -0.13, wrist: -0.45, drop: -0.05 },
      { duration: 0.6, ease: ease.outCubic },
    );
  }

  /** Entrée d'un nouvel adversaire : la main sort du cadre, change de couleurs et revient. */
  async swapIn(tweens, palette) {
    await tweens.to(
      this.motion,
      { push: -4.5, lift: 0.05 },
      { duration: 0.35, ease: ease.inCubic },
    );
    if (palette) this.setPalette(palette);
    this.snapPose('relaxed');
    await tweens.to(this.motion, { push: 0, lift: 0 }, { duration: 0.6, ease: ease.outBack });
  }

  async recover(tweens) {
    await tweens.to(
      this.motion,
      { lift: 0, wrist: 0, twist: 0, drop: 0, push: 0 },
      { duration: 0.45, ease: ease.outBack },
    );
  }
}

import * as THREE from 'three';
import { ease } from '../core/tween.js';
import { RAMPS, addInstancedOutline, toonMaterial } from './toon.js';

/**
 * Effets visuels : explosion "comic" à l'impact, onde de choc au sol,
 * étincelles, confettis et pluie de pièces.
 */

class ParticlePool {
  constructor(geometry, material, capacity, { outline = null } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    if (outline) addInstancedOutline(this.mesh, outline);
    this.particles = Array.from({ length: capacity }, () => ({
      alive: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      spin: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      size: 1,
      gravity: 9,
      drag: 0,
      floor: -Infinity,
    }));
    this.cursor = 0;
    // Réserve vide = rien à dessiner : le mesh (et son contour, enfant) reste masqué
    // tant qu'aucune particule n'est vivante, y compris dans la carte d'ombre.
    this.alive = 0;
    this.mesh.visible = false;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, this._zero);
  }

  spawn(init) {
    const index = this.cursor;
    const p = this.particles[index];
    this.cursor = (this.cursor + 1) % this.particles.length;
    if (!p.alive) this.alive += 1;
    this.mesh.visible = true;
    p.alive = true;
    p.life = 0;
    p.pos.copy(init.pos);
    p.vel.copy(init.vel);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin.set(...(init.spin ?? [0, 0, 0]));
    p.maxLife = init.life ?? 1;
    p.size = init.size ?? 1;
    p.gravity = init.gravity ?? 9;
    p.drag = init.drag ?? 0;
    p.floor = init.floor ?? -Infinity;
    p.bounce = init.bounce ?? 0.4;
    this.mesh.setColorAt(index, init.color ?? new THREE.Color('#ffffff'));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    if (this.alive === 0) return;
    this.particles.forEach((p, i) => {
      if (!p.alive) return;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.alive -= 1;
        this.mesh.setMatrixAt(i, this._zero);
        return;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) {
        p.pos.y = p.floor;
        p.vel.y = Math.abs(p.vel.y) * p.bounce;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const t = p.life / p.maxLife;
      const scale = p.size * (t < 0.1 ? t / 0.1 : 1 - Math.max(0, t - 0.7) / 0.3);
      this._q.setFromEuler(p.rot);
      this._s.setScalar(Math.max(scale, 0.0001));
      this._m.compose(p.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.alive === 0) this.mesh.visible = false;
  }
}

function starShape(points = 10, outer = 1, inner = 0.52) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner * (0.9 + (0.2 * ((i * 7) % 3)) / 2);
    const a = (i / (points * 2)) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape);
}

export class Effects {
  constructor(scene, camera, tweens) {
    this.scene = scene;
    this.camera = camera;
    this.tweens = tweens;
    this.billboards = [];

    // Étincelles
    this.sparks = new ParticlePool(
      new THREE.OctahedronGeometry(0.07, 0),
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      220,
    );
    // Confettis
    this.confetti = new ParticlePool(
      new THREE.PlaneGeometry(0.13, 0.07),
      new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
      320,
    );
    // Pièces
    this.coins = new ParticlePool(
      new THREE.CylinderGeometry(0.15, 0.15, 0.045, 20).rotateX(Math.PI / 2),
      toonMaterial({ color: '#ffcf3f', ramp: RAMPS.soft, rim: 0.45, spec: 0.9, specSize: 0.88 }),
      90,
      { outline: { color: '#7a3d00', thickness: 1.2 } },
    );
    this.coins.mesh.castShadow = true;
    scene.add(this.sparks.mesh, this.confetti.mesh, this.coins.mesh);

    // Explosion comic (étoile + contour), réutilisée
    const starGeo = starShape();
    this.burst = new THREE.Group();
    this.burstInk = new THREE.Mesh(
      starGeo,
      new THREE.MeshBasicMaterial({ color: '#231a3d', transparent: true, depthTest: false }),
    );
    this.burstInk.scale.setScalar(1.14);
    this.burstFill = new THREE.Mesh(
      starGeo,
      new THREE.MeshBasicMaterial({ color: '#ffe25a', transparent: true, depthTest: false }),
    );
    this.burstCore = new THREE.Mesh(
      starGeo,
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthTest: false }),
    );
    this.burstCore.scale.setScalar(0.55);
    this.burstFill.position.z = 0.001;
    this.burstCore.position.z = 0.002;
    this.burst.add(this.burstInk, this.burstFill, this.burstCore);
    this.burst.renderOrder = 10;
    this.burst.traverse((o) => (o.renderOrder = 10));
    this.burst.visible = false;
    this.burstState = { scale: 0, opacity: 0, spin: 0 };
    scene.add(this.burst);
    this.billboards.push(this.burst);

    // Onde de choc au sol
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }),
    );
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.ringState = { scale: 0.1, opacity: 0 };
    scene.add(this.ring);

    // Bouclier hexagonal (atout)
    const flat = (color, opacity) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    this.shield = new THREE.Group();
    this.shieldParts = [
      [new THREE.Mesh(new THREE.CircleGeometry(0.86, 6), flat('#7fe7ff', 0.28)), 0.28],
      [new THREE.Mesh(new THREE.RingGeometry(0.9, 0.99, 6), flat('#231a3d', 1)), 1],
      [new THREE.Mesh(new THREE.RingGeometry(0.78, 0.9, 6), flat('#e6fdff', 1)), 1],
      [new THREE.Mesh(new THREE.RingGeometry(0.4, 0.47, 6), flat('#bff6ff', 0.8)), 0.8],
    ];
    this.shieldParts.forEach(([mesh], i) => {
      mesh.position.z = i * 0.002;
      this.shield.add(mesh);
    });
    this.shield.visible = false;
    this.shieldState = { scale: 0, opacity: 0 };
    scene.add(this.shield);

    this.badges = [];
    this.badgeTextures = new Map();
  }

  /** Bouclier qui apparaît devant une main et encaisse le coup. */
  async shieldBlock(position) {
    this.shield.position.copy(position);
    this.shield.visible = true;
    Object.assign(this.shieldState, { scale: 0.2, opacity: 1 });
    await this.tweens.to(this.shieldState, { scale: 1 }, { duration: 0.28, ease: ease.outBack });
    await this.tweens.wait(0.7);
    await this.tweens.to(this.shieldState, { opacity: 0, scale: 1.25 }, { duration: 0.35 });
  }

  /** Texte "comic" qui monte et s'efface (×2, Bloqué !…). */
  badge(text, position, { fill = '#ffd23f', size = 1 } = {}) {
    const key = `${text}|${fill}`;
    if (!this.badgeTextures.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.font = '150px "Lilita One", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 30;
      ctx.strokeStyle = '#231a3d';
      ctx.strokeText(text, 256, 138);
      ctx.fillStyle = fill;
      ctx.fillText(text, 256, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.badgeTextures.set(key, texture);
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.badgeTextures.get(key),
        transparent: true,
        depthTest: false,
        fog: false,
      }),
    );
    sprite.renderOrder = 11;
    sprite.position.copy(position);
    sprite.scale.set(1.7 * size, 0.85 * size, 1);
    this.scene.add(sprite);
    const state = { rise: 0, opacity: 1, pop: 0.3 };
    this.badges.push({ sprite, state, base: position.clone(), size });
    this.tweens.to(state, { pop: 1 }, { duration: 0.3, ease: ease.outBack });
    this.tweens.to(state, { rise: 0.7 }, { duration: 1.4, ease: ease.outCubic });
    this.tweens.to(state, { opacity: 0 }, { duration: 0.4, delay: 1.0 });
  }

  /** Impact au moment de la révélation. */
  impact(position, { color = '#ffe25a', strength = 1 } = {}) {
    this.burst.position.copy(position);
    this.burst.visible = true;
    this.burstFill.material.color.set(color);
    const s = this.burstState;
    s.scale = 0.1;
    s.opacity = 1;
    s.spin = Math.random() * Math.PI;
    this.tweens.to(s, { scale: 1.05 * strength }, { duration: 0.18, ease: ease.outBack });
    this.tweens.to(
      s,
      { opacity: 0, spin: s.spin + 0.5 },
      { duration: 0.4, delay: 0.22, ease: ease.inQuad },
    );

    this.ring.position.x = position.x;
    this.ring.position.z = position.z;
    this.ring.visible = true;
    Object.assign(this.ringState, { scale: 0.3, opacity: 0.9 });
    this.tweens.to(
      this.ringState,
      { scale: 4.2, opacity: 0 },
      { duration: 0.7, ease: ease.outCubic },
    );

    const palette = ['#ffffff', '#ffe25a', '#ffb347', color].map((c) => new THREE.Color(c));
    for (let i = 0; i < 26 * strength; i++) {
      const dir = new THREE.Vector3().randomDirection();
      dir.z *= 0.5;
      this.sparks.spawn({
        pos: position,
        vel: dir.multiplyScalar(3 + Math.random() * 4),
        spin: [8, 6, 4],
        life: 0.4 + Math.random() * 0.35,
        size: 0.7 + Math.random() * 0.9,
        gravity: 6,
        drag: 2.5,
        color: palette[i % palette.length],
      });
    }
  }

  /** Pluie de confettis (victoire). */
  celebrate(origin, count = 120) {
    const palette = ['#43d1ff', '#ffd23f', '#ff4f7b', '#7cf29a', '#b88bff', '#ffffff'].map(
      (c) => new THREE.Color(c),
    );
    for (let i = 0; i < count; i++) {
      this.confetti.spawn({
        pos: new THREE.Vector3(origin.x + (Math.random() - 0.5) * 1.5, origin.y, origin.z),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          5 + Math.random() * 5,
          (Math.random() - 0.5) * 3,
        ),
        spin: [Math.random() * 12, Math.random() * 12, Math.random() * 12],
        life: 2.2 + Math.random() * 1.2,
        size: 0.8 + Math.random() * 0.6,
        gravity: 4.5,
        drag: 1.6,
        color: palette[i % palette.length],
      });
    }
  }

  /** Pièces qui jaillissent puis rebondissent sur l'arène. */
  coinShower(origin, count = 12) {
    for (let i = 0; i < count; i++) {
      this.coins.spawn({
        pos: new THREE.Vector3(origin.x, origin.y, origin.z),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3.2,
          4.5 + Math.random() * 3,
          (Math.random() - 0.2) * 2.4,
        ),
        spin: [Math.random() * 3, 9 + Math.random() * 6, Math.random() * 2],
        life: 2.2 + Math.random() * 0.6,
        size: 1,
        gravity: 12,
        drag: 0.2,
        floor: 0.06,
        bounce: 0.45,
      });
    }
  }

  update(dt) {
    this.sparks.update(dt);
    this.confetti.update(dt);
    this.coins.update(dt);

    const s = this.burstState;
    if (this.burst.visible) {
      this.burst.quaternion.copy(this.camera.quaternion);
      this.burst.rotateZ(s.spin);
      this.burst.scale.setScalar(Math.max(s.scale, 0.001));
      this.burstInk.material.opacity = s.opacity;
      this.burstFill.material.opacity = s.opacity;
      this.burstCore.material.opacity = s.opacity;
      if (s.opacity <= 0.001) this.burst.visible = false;
    }
    if (this.ring.visible) {
      this.ring.scale.setScalar(this.ringState.scale);
      this.ring.material.opacity = this.ringState.opacity;
      if (this.ringState.opacity <= 0.001) this.ring.visible = false;
    }
    if (this.shield.visible) {
      const st = this.shieldState;
      this.shield.quaternion.copy(this.camera.quaternion);
      this.shield.scale.setScalar(Math.max(st.scale, 0.001));
      for (const [mesh, opacity] of this.shieldParts) mesh.material.opacity = opacity * st.opacity;
      if (st.opacity <= 0.001) this.shield.visible = false;
    }
    this.badges = this.badges.filter(({ sprite, state, base, size }) => {
      sprite.position.set(base.x, base.y + state.rise, base.z);
      sprite.scale.set(1.7 * size * state.pop, 0.85 * size * state.pop, 1);
      sprite.material.opacity = state.opacity;
      if (state.opacity > 0.001) return true;
      sprite.removeFromParent();
      sprite.material.dispose();
      return false;
    });
  }
}

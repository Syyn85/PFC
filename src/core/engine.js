import * as THREE from 'three';
import { outlineUniforms } from '../gfx/toon.js';

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Rendu + caméra. La caméra recadre automatiquement la scène selon le format
 * de l'écran (paysage / portrait) et gère tremblements et parallaxe.
 */
export class Engine {
  constructor(canvas) {
    this.isMobile = matchMedia('(pointer: coarse)').matches;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1200);

    // Paramètres animables de la caméra
    this.rig = {
      zoom: 1, // multiplicateur de distance
      orbit: 0, // rotation autour de l'arène (radians)
      lift: 0, // décalage vertical de la cible
      trauma: 0, // intensité du tremblement (0..1)
    };
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.layout = null;
    this.pixelRatioUniforms = [];
    this.onLayout = null;

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (event) => {
      this.pointer.set((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1);
    });
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.75 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    outlineUniforms.uResolution.value.set(width * dpr, height * dpr);
    outlineUniforms.uPixelRatio.value = dpr;
    for (const uniform of this.pixelRatioUniforms) uniform.value = dpr;

    const aspect = width / height;
    const wide = smoothstep(0.55, 1.4, aspect);
    const fov = THREE.MathUtils.lerp(50, 36, wide);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const handX = THREE.MathUtils.lerp(1.78, 1.95, wide);
    const halfWidth = THREE.MathUtils.lerp(2.4, 3.7, wide);
    const halfHeight = 2.1;
    const distance = Math.max(halfHeight / tanHalf, halfWidth / (tanHalf * aspect));

    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.layout = { aspect, handX, distance, targetY: 1.5, portrait: aspect < 0.85 };
    this.onLayout?.(this.layout);
  }

  addShake(amount) {
    if (this.reducedMotion) return;
    this.rig.trauma = Math.min(1, this.rig.trauma + amount);
  }

  updateCamera(dt, time) {
    const { rig, layout, camera } = this;
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    const parallax = this.reducedMotion ? 0 : 1;

    const distance = layout.distance * rig.zoom;
    const yaw = rig.orbit + this.pointerSmooth.x * 0.05 * parallax;
    const target = new THREE.Vector3(0, layout.targetY + rig.lift, 0);
    const height = distance * 0.16 - this.pointerSmooth.y * 0.25 * parallax;

    camera.position.set(
      target.x + Math.sin(yaw) * distance,
      target.y + height,
      target.z + Math.cos(yaw) * distance,
    );

    // Tremblement "trauma" : amplitude au carré, bruit sinusoïdal
    rig.trauma = Math.max(0, rig.trauma - dt * 1.8);
    const shake = rig.trauma * rig.trauma;
    if (shake > 0) {
      camera.position.x += Math.sin(time * 61.3) * 0.18 * shake;
      camera.position.y += Math.sin(time * 47.7 + 1.3) * 0.14 * shake;
    }
    camera.lookAt(target);
    if (shake > 0) camera.rotateZ(Math.sin(time * 37.1) * 0.03 * shake);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

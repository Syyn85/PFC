import * as THREE from 'three';
import { outlineUniforms } from '../gfx/toon.js';

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Résolution adaptative
const MIN_PIXEL_RATIO = 0.75;
const PIXEL_RATIO_STEP = 0.25;
const MAX_FRAME = 0.25; // au-delà, image anormale (onglet masqué, appli en pause) : ignorée
const SLOW_FPS = 45; // sous ce seuil (moyenne sur 2 s), on baisse d'un cran
const FAST_FPS = 58; // au-dessus pendant FAST_DURATION, on remonte d'un cran
const FAST_DURATION = 6;
const RAISE_COOLDOWN = 10; // pas de remontée dans les 10 s qui suivent une baisse
const MAX_RAISE_COOLDOWN = 80;

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
    // Résolution adaptative : si l'appareil peine, on baisse la densité de pixels ;
    // s'il redevient fluide, on la remonte, sans jamais dépasser la valeur de départ.
    // ?qualite=max dans l'URL désactive l'ajustement.
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.75 : 2);
    this.maxPixelRatio = this.pixelRatio;
    this.adaptive = new URLSearchParams(location.search).get('qualite') !== 'max';
    this.frameStats = {
      time: 0, // fenêtre de mesure en cours (s)
      frames: 0,
      warmup: 3, // délai avant de mesurer (chargement, compilation des shaders)
      fast: 0, // durée cumulée de fenêtres consécutives rapides (s)
      sinceDrop: Infinity, // temps écoulé depuis la dernière baisse (s)
      cooldown: RAISE_COOLDOWN, // délai minimal entre une baisse et une remontée (s)
      sinceRaise: Infinity, // temps écoulé depuis la dernière remontée (s)
    };
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.cameraTarget = new THREE.Vector3();
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
    const dpr = this.pixelRatio;
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

  /**
   * À appeler à chaque image avec sa durée réelle (non bornée) : baisse la
   * résolution si la cadence chute, la remonte d'un cran après une période
   * fluide prolongée.
   */
  monitor(dt) {
    if (!this.adaptive) return;
    const stats = this.frameStats;
    // Image anormalement longue (retour d'un onglet masqué, appli en pause…) :
    // elle ne dit rien des performances. On repart d'une mesure vierge après
    // une courte chauffe, sinon chaque aller-retour coûterait un cran de DPR.
    if (dt > MAX_FRAME) {
      stats.time = 0;
      stats.frames = 0;
      stats.fast = 0;
      stats.warmup = Math.max(stats.warmup, 1);
      return;
    }
    stats.sinceDrop += dt;
    stats.sinceRaise += dt;
    if (stats.warmup > 0) {
      stats.warmup -= dt;
      return;
    }
    stats.time += dt;
    stats.frames += 1;
    if (stats.time < 2) return;
    const span = stats.time;
    const fps = stats.frames / span;
    stats.time = 0;
    stats.frames = 0;

    if (fps < SLOW_FPS) {
      stats.fast = 0;
      if (this.pixelRatio <= MIN_PIXEL_RATIO) return;
      // Baisse peu après une remontée : ce cran était de trop. On double le délai
      // avant le prochain essai pour ne pas osciller entre deux résolutions.
      stats.cooldown =
        stats.sinceRaise < RAISE_COOLDOWN
          ? Math.min(stats.cooldown * 2, MAX_RAISE_COOLDOWN)
          : RAISE_COOLDOWN;
      stats.sinceDrop = 0;
      this.stepPixelRatio(-PIXEL_RATIO_STEP);
    } else if (fps >= FAST_FPS && this.pixelRatio < this.maxPixelRatio) {
      stats.fast += span;
      if (stats.fast >= FAST_DURATION && stats.sinceDrop >= stats.cooldown) {
        stats.fast = 0;
        stats.sinceRaise = 0;
        this.stepPixelRatio(PIXEL_RATIO_STEP);
      }
    } else {
      stats.fast = 0;
    }
  }

  /** Change la densité de pixels d'un cran, entre le minimum et la valeur de départ. */
  stepPixelRatio(delta) {
    const next = Math.round((this.pixelRatio + delta) * 4) / 4;
    const clamped = Math.min(this.maxPixelRatio, Math.max(MIN_PIXEL_RATIO, next));
    if (clamped === this.pixelRatio) return;
    this.pixelRatio = clamped;
    this.resize();
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
    // Vecteur réutilisé : pas d'allocation à chaque image
    const target = this.cameraTarget.set(0, layout.targetY + rig.lift, 0);
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

/**
 * Mini moteur d'animation piloté par la boucle de rendu (pas de setTimeout :
 * tout se met en pause avec requestAnimationFrame et reste synchronisé).
 */

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  outElastic: (t) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

export class Tweens {
  constructor() {
    this.items = new Set();
  }

  /**
   * Interpole `target[key]` vers `to[key]` pour chaque clé de `to`.
   * Retourne une promesse résolue à la fin (ou à l'annulation).
   */
  to(target, to, { duration = 0.3, ease: easing = ease.outCubic, delay = 0, onUpdate } = {}) {
    // Une nouvelle animation sur les mêmes propriétés remplace l'ancienne.
    for (const item of this.items) {
      if (item.target !== target) continue;
      for (const key of Object.keys(to)) delete item.to[key];
      if (Object.keys(item.to).length === 0) this.#finish(item);
    }

    return new Promise((resolve) => {
      this.items.add({
        target,
        from: null,
        to: { ...to },
        duration: Math.max(duration, 1e-4),
        easing,
        delay,
        elapsed: 0,
        onUpdate,
        resolve,
      });
    });
  }

  /** Attend `seconds` secondes de temps de jeu. */
  wait(seconds) {
    return new Promise((resolve) => {
      this.items.add({ wait: true, duration: seconds, delay: 0, elapsed: 0, resolve });
    });
  }

  update(dt) {
    for (const item of this.items) {
      let step = dt;
      if (item.delay > 0) {
        item.delay -= step;
        if (item.delay > 0) continue;
        step = -item.delay;
        item.delay = 0;
      }
      item.elapsed += step;
      const t = Math.min(item.elapsed / item.duration, 1);

      if (!item.wait) {
        if (!item.from) {
          item.from = {};
          for (const key of Object.keys(item.to)) item.from[key] = item.target[key];
        }
        const k = item.easing(t);
        for (const key of Object.keys(item.to)) {
          item.target[key] = item.from[key] + (item.to[key] - item.from[key]) * k;
        }
        item.onUpdate?.(k);
      }

      if (t >= 1) this.#finish(item);
    }
  }

  #finish(item) {
    this.items.delete(item);
    item.resolve();
  }
}

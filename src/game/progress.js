import { readJSON, safeStorage, writeJSON } from '../core/storage.js';

/**
 * Progression de la campagne et plafond de gains quotidien.
 * Tout est local en mode démo ; en mode on-chain ces règles devront être
 * appliquées côté serveur (le client ne peut pas être cru sur parole).
 */

export class CampaignProgress {
  constructor(opponents, { storage = safeStorage(), key = 'pfc:campaign' } = {}) {
    this.opponents = opponents;
    this.storage = storage;
    this.key = key;
    this.cleared = new Set();
    this.reload();
  }

  /**
   * Relit la sauvegarde et la fusionne avec l'état en mémoire : un autre onglet
   * a pu libérer des îles entre-temps, et on ne doit jamais en perdre.
   */
  reload() {
    const saved = readJSON(this.key, null, this.storage);
    if (Array.isArray(saved?.cleared)) {
      for (const id of saved.cleared) if (typeof id === 'string') this.cleared.add(id);
    }
  }

  isCleared(id) {
    return this.cleared.has(id);
  }

  /** Une île est accessible si c'est la première, ou si la précédente est vaincue. */
  isUnlocked(id) {
    const index = this.opponents.findIndex((o) => o.id === id);
    if (index <= 0) return index === 0;
    return this.cleared.has(this.opponents[index - 1].id);
  }

  /** Retourne true si c'est la première victoire contre cet adversaire. */
  markCleared(id) {
    this.reload();
    if (this.cleared.has(id)) return false;
    this.cleared.add(id);
    writeJSON(this.key, { cleared: [...this.cleared] }, this.storage);
    return true;
  }

  get clearedCount() {
    return this.opponents.filter((o) => this.cleared.has(o.id)).length;
  }
}

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Plafonne les gains de jeu contre l'IA par jour (anti-"farming"). */
export class DailyRewards {
  constructor({ cap, storage = safeStorage(), key = 'pfc:daily', now = () => new Date() } = {}) {
    this.cap = cap;
    this.storage = storage;
    this.key = key;
    this.now = now;
    // Plancher en mémoire : le plafond doit tenir même si le stockage est
    // indisponible, plein ou corrompu pendant la session.
    this.memory = { day: null, earned: 0 };
  }

  /**
   * État du jour, relu à chaque accès : la sauvegarde peut avoir été modifiée
   * par un autre onglet. On retient le plus grand des deux montants (sauvegarde
   * valide du jour, mémoire de la session).
   */
  #load() {
    const today = dayKey(this.now());
    const saved = readJSON(this.key, null, this.storage);
    const valid =
      saved && saved.day === today && Number.isFinite(saved.earned) && saved.earned >= 0;
    const remembered = this.memory.day === today ? this.memory.earned : 0;
    return { day: today, earned: Math.max(valid ? saved.earned : 0, remembered) };
  }

  get earnedToday() {
    return this.#load().earned;
  }

  get remaining() {
    return Math.max(0, this.cap - this.earnedToday);
  }

  /** Accorde au plus `amount`, dans la limite du plafond. Retourne le montant accordé. */
  grant(amount) {
    const state = this.#load();
    const granted = Math.max(0, Math.min(amount, this.cap - state.earned));
    if (granted > 0) {
      state.earned += granted;
      this.memory = { ...state };
      writeJSON(this.key, state, this.storage);
    }
    return granted;
  }
}

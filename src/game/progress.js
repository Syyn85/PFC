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
    const saved = readJSON(key, null, storage);
    this.cleared = new Set(Array.isArray(saved?.cleared) ? saved.cleared : []);
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
    this.state = readJSON(key, { day: null, earned: 0 }, storage);
  }

  #refresh() {
    const today = dayKey(this.now());
    if (this.state.day !== today) this.state = { day: today, earned: 0 };
  }

  get earnedToday() {
    this.#refresh();
    return this.state.earned;
  }

  get remaining() {
    return Math.max(0, this.cap - this.earnedToday);
  }

  /** Accorde au plus `amount`, dans la limite du plafond. Retourne le montant accordé. */
  grant(amount) {
    this.#refresh();
    const granted = Math.max(0, Math.min(amount, this.cap - this.state.earned));
    if (granted > 0) {
      this.state.earned += granted;
      writeJSON(this.key, this.state, this.storage);
    }
    return granted;
  }
}

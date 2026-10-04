import { CONFIG } from '../config.js';
import { readJSON, safeStorage, writeJSON } from '../core/storage.js';

/**
 * Couche "portefeuille".
 *
 * Aujourd'hui : DemoWallet, des jetons fictifs conservés sur l'appareil.
 *
 * Demain : une implémentation on-chain (Robinhood Chain, compatible EVM) exposant
 * la même interface. Règle d'or : en mode on-chain, le client ne crédite JAMAIS
 * lui-même un solde. Les gains doivent être attestés côté serveur ou par le
 * contrat (ex. coups engagés/révélés on-chain, ou réclamation signée par un
 * serveur de jeu) ; le client se contente d'afficher le solde lu sur la chaîne.
 *
 * Interface commune :
 *   mode            'demo' | 'onchain'
 *   address         adresse connectée (null en démo)
 *   balance         solde affiché
 *   connect()       Promise<void>
 *   credit(n, why)  démo uniquement
 *   spend(n, why)   démo uniquement (boutique de cosmétiques) ; false si solde insuffisant
 *   subscribe(fn)   notifié à chaque changement, retourne une fonction de désabonnement
 *
 * Chaque écriture incrémente `revision` : une sauvegarde plus ancienne que l'état
 * en mémoire signifie qu'une écriture a échoué (stockage plein), et on garde la
 * mémoire ; une sauvegarde plus récente vient d'un autre onglet, et on la reprend.
 */
export class DemoWallet {
  mode = 'demo';
  address = null;
  symbol = CONFIG.token.symbol;

  #listeners = new Set();
  #state;

  constructor({ key = 'pfc:demo-wallet', storage = safeStorage() } = {}) {
    this.storageKey = key;
    this.storage = storage;
    this.#state = this.#load();
    // Un autre onglet a crédité des jetons : on se resynchronise.
    globalThis.addEventListener?.('storage', (event) => {
      if (event.key !== this.storageKey) return;
      this.#state = this.#load();
      this.#notify();
    });
  }

  get balance() {
    return this.#state.balance;
  }

  get history() {
    return [...this.#state.history];
  }

  async connect() {
    throw new Error(
      `La connexion à ${CONFIG.chain.name} n'est pas encore disponible : les jetons actuels sont des jetons de démo.`,
    );
  }

  credit(amount, reason) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.#apply(amount, reason);
  }

  /** Dépense des jetons de démo. Retourne false (sans rien débiter) si le solde ne suffit pas. */
  spend(amount, reason) {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (this.#load().balance < amount) return false;
    this.#apply(-amount, reason);
    return true;
  }

  // Lecture-modification-écriture : ne jamais écraser une opération faite ailleurs.
  #apply(amount, reason) {
    const state = this.#load();
    state.balance += amount;
    state.revision = (state.revision ?? 0) + 1;
    state.history.unshift({ amount, reason, at: Date.now() });
    state.history.length = Math.min(state.history.length, 50);
    this.#state = state;
    writeJSON(this.storageKey, state, this.storage);
    this.#notify();
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this);
    return () => this.#listeners.delete(listener);
  }

  #notify() {
    for (const listener of this.#listeners) listener(this);
  }

  #load() {
    const saved = readJSON(this.storageKey, null, this.storage);
    const valid = saved && Number.isFinite(saved.balance) && Array.isArray(saved.history);
    const savedRevision = valid ? (saved.revision ?? 0) : -1;
    const memoryRevision = this.#state?.revision ?? 0;
    if (valid && !(this.#state && savedRevision < memoryRevision)) {
      return { ...saved, history: [...saved.history], revision: savedRevision };
    }
    // Stockage indisponible ou en retard : on garde l'état en mémoire plutôt que de le perdre
    return this.#state
      ? { ...this.#state, history: [...this.#state.history] }
      : { balance: 0, history: [], revision: 0 };
  }
}

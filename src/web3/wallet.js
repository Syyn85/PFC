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
 *   spend(n, why, { item })
 *                   démo uniquement (boutique) ; false si solde insuffisant ou objet déjà acheté.
 *                   L'objet acheté est enregistré dans la MÊME écriture que le débit : on ne
 *                   peut pas payer sans recevoir l'objet, ni l'inverse.
 *   owns(item)      objet acheté ?
 *   subscribe(fn)   notifié à chaque changement, retourne une fonction de désabonnement
 *
 * Plusieurs onglets et stockage plein : chaque opération relit la sauvegarde avant
 * d'écrire. Une opération dont l'écriture échoue reste en attente (#pending) et est
 * rejouée par-dessus la sauvegarde à chaque lecture, jusqu'à la prochaine écriture
 * réussie : rien n'est perdu, et rien de ce qu'a fait un autre onglet n'est écrasé.
 */

const HISTORY_SIZE = 50;

function parseState(saved) {
  if (!saved || !Number.isFinite(saved.balance) || !Array.isArray(saved.history)) return null;
  const purchases = Array.isArray(saved.purchases) ? saved.purchases : [];
  return {
    balance: saved.balance,
    history: [...saved.history],
    purchases: purchases.filter((id) => typeof id === 'string'),
  };
}

function cloneState(state) {
  return { ...state, history: [...state.history], purchases: [...state.purchases] };
}

// Un achat déjà présent (fait entre-temps dans un autre onglet) n'est pas débité deux fois
function applyOp(state, op) {
  if (op.item) {
    if (state.purchases.includes(op.item)) return;
    state.purchases.push(op.item);
  }
  state.balance += op.amount;
  state.history.unshift({ amount: op.amount, reason: op.reason, at: op.at });
  state.history.length = Math.min(state.history.length, HISTORY_SIZE);
}

export class DemoWallet {
  mode = 'demo';
  address = null;
  symbol = CONFIG.token.symbol;

  #listeners = new Set();
  #pending = [];
  #state;

  /**
   * legacyKey : sauvegarde de la version sans boutique, reprise une fois. Elle n'est plus
   * relue ensuite, pour qu'un onglet resté sur l'ancienne version (où le solde ne
   * pouvait que croître) ne ressuscite pas des jetons dépensés.
   */
  constructor({
    key = 'pfc:demo-wallet:v2',
    legacyKey = 'pfc:demo-wallet',
    storage = safeStorage(),
  } = {}) {
    this.storageKey = key;
    this.legacyKey = legacyKey;
    this.storage = storage;
    this.#state = this.#load();
    // Un autre onglet a crédité ou dépensé des jetons : on se resynchronise.
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

  owns(item) {
    return this.#state.purchases.includes(item);
  }

  async connect() {
    throw new Error(
      `La connexion à ${CONFIG.chain.name} n'est pas encore disponible : les jetons actuels sont des jetons de démo.`,
    );
  }

  credit(amount, reason) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.#apply({ amount, reason });
  }

  /**
   * Dépense des jetons de démo, en enregistrant l'objet acheté (item) avec le débit.
   * Retourne false, sans rien débiter, si le solde ne suffit pas ou si l'objet est déjà
   * acheté (éventuellement dans un autre onglet).
   */
  spend(amount, reason, { item = null } = {}) {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const state = this.#load();
    if (state.balance < amount || (item && state.purchases.includes(item))) {
      // L'affichage était peut-être en retard sur un autre onglet : on le remet à jour
      this.#state = state;
      this.#notify();
      return false;
    }
    this.#apply({ amount: -amount, reason, item });
    return true;
  }

  // Lecture-modification-écriture : ne jamais écraser une opération faite ailleurs.
  #apply(op) {
    const entry = { ...op, at: Date.now() };
    const state = this.#load();
    applyOp(state, entry);
    this.#state = state;
    if (writeJSON(this.storageKey, state, this.storage)) this.#pending = [];
    else this.#pending.push(entry);
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
    const saved =
      parseState(readJSON(this.storageKey, null, this.storage)) ??
      (this.#state ? null : parseState(readJSON(this.legacyKey, null, this.storage)));
    if (saved) {
      for (const op of this.#pending) applyOp(saved, op);
      return saved;
    }
    // Stockage indisponible : l'état en mémoire contient déjà les opérations en attente
    return this.#state ? cloneState(this.#state) : { balance: 0, history: [], purchases: [] };
  }
}

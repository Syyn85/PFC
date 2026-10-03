import { CONFIG } from '../config.js';

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
 *   subscribe(fn)   notifié à chaque changement, retourne une fonction de désabonnement
 */
export class DemoWallet {
  mode = 'demo';
  address = null;
  symbol = CONFIG.token.symbol;

  #listeners = new Set();
  #state;

  constructor(storageKey = 'pfc:demo-wallet') {
    this.storageKey = storageKey;
    this.#state = this.#load();
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
    this.#state.balance += amount;
    this.#state.history.unshift({ amount, reason, at: Date.now() });
    this.#state.history.length = Math.min(this.#state.history.length, 50);
    this.#save();
    for (const listener of this.#listeners) listener(this);
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this);
    return () => this.#listeners.delete(listener);
  }

  #load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Number.isFinite(parsed.balance) && Array.isArray(parsed.history)) return parsed;
    } catch {
      /* stockage indisponible ou corrompu : on repart de zéro */
    }
    return { balance: 0, history: [] };
  }

  #save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.#state));
    } catch {
      /* navigation privée : le solde reste en mémoire */
    }
  }
}

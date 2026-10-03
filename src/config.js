/**
 * Configuration centrale du jeu.
 * Tout ce qui touche à la chaîne / au token est volontairement vide pour l'instant :
 * le jeu tourne en "mode démo" (jetons fictifs stockés localement).
 */
export const CONFIG = {
  game: {
    formats: [
      { id: 'bo3', label: '2 manches gagnantes', short: 'BO3', winsNeeded: 2 },
      { id: 'bo5', label: '3 manches gagnantes', short: 'BO5', winsNeeded: 3 },
    ],
    defaultFormat: 'bo3',
    // 'random' = aléatoire pur, 'markov' = l'IA apprend tes habitudes
    botStrategy: 'markov',
  },

  // Barème de récompenses (en jetons de démo pour l'instant)
  rewards: {
    roundWin: 2,
    matchWin: 10,
    streakEvery: 3,
    streakBonus: 5,
  },

  token: {
    symbol: 'PFC',
    name: 'PFC Token',
    decimals: 18,
  },

  // À compléter lors de l'intégration on-chain (Robinhood Chain, compatible EVM).
  chain: {
    name: 'Robinhood Chain',
    chainId: null,
    rpcUrl: null,
    explorerUrl: null,
    tokenAddress: null,
    gameContractAddress: null,
  },
};

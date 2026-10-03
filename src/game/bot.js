import { MOVES, counterOf } from './rules.js';
import { secureRandom } from './fairness.js';

/**
 * Adversaires IA. Chaque stratégie a une "signature" que le joueur peut
 * apprendre à exploiter : c'est ce qui transforme le hasard en jeu de lecture.
 *
 *  random       coups uniformément aléatoires
 *  rocky        a un faible pour la pierre
 *  mirror       rejoue souvent le dernier coup du joueur
 *  cycle        enchaîne pierre → feuille → ciseaux en boucle
 *  counterLast  joue ce qui bat le dernier coup du joueur
 *  markov       mémorise les enchaînements du joueur et contre le plus probable
 *  meta         teste plusieurs lectures du joueur et suit la plus fiable
 *
 * Le bot ne voit jamais le coup en cours du joueur : il s'engage (commit) avant.
 */
export const STRATEGIES = ['random', 'rocky', 'mirror', 'cycle', 'counterLast', 'markov', 'meta'];

// Probabilité de jouer au hasard plutôt que selon la signature
const DEFAULT_NOISE = {
  random: 1,
  rocky: 0,
  mirror: 0.2,
  cycle: 0.15,
  counterLast: 0.2,
  markov: 0.3,
  meta: 0.12,
};

const ROCKY_WEIGHTS = { rock: 0.6, paper: 0.22, scissors: 0.18 };

/** Lectures du joueur utilisées par la stratégie "meta" : chacune prédit son prochain coup. */
const PREDICTORS = {
  frequent: (s) => s.argmax(s.totals),
  markov: (s) => (s.lastPlayer ? s.argmax(s.transitions[s.lastPlayer]) : null),
  repeat: (s) => s.lastPlayer,
  rotate: (s) => (s.lastPlayer ? counterOf(s.lastPlayer) : null),
  beatBot: (s) => (s.lastBot ? counterOf(s.lastBot) : null),
  copyBot: (s) => s.lastBot,
};

export function createBot({ strategy = 'markov', random = secureRandom, noise } = {}) {
  if (!STRATEGIES.includes(strategy)) throw new Error(`Stratégie inconnue : ${strategy}`);
  const randomness = noise ?? DEFAULT_NOISE[strategy];

  const pickIndex = (n) => Math.min(n - 1, Math.floor(random() * n));
  const state = {
    totals: Object.fromEntries(MOVES.map((m) => [m, 0])),
    transitions: Object.fromEntries(
      MOVES.map((m) => [m, Object.fromEntries(MOVES.map((n) => [n, 0]))]),
    ),
    scores: Object.fromEntries(Object.keys(PREDICTORS).map((k) => [k, 0])),
    lastPlayer: null,
    lastBot: null,
    observed: 0,
    argmax(counts) {
      const best = Math.max(...MOVES.map((m) => counts[m]));
      if (best <= 0) return null;
      const candidates = MOVES.filter((m) => counts[m] === best);
      return candidates[pickIndex(candidates.length)];
    },
  };

  const randomMove = () => MOVES[pickIndex(MOVES.length)];

  function signatureMove() {
    switch (strategy) {
      case 'rocky': {
        let r = random();
        for (const move of MOVES) {
          r -= ROCKY_WEIGHTS[move];
          if (r < 0) return move;
        }
        return 'scissors';
      }
      case 'mirror':
        return state.lastPlayer;
      case 'cycle':
        // Coup suivant du cycle : ce qui bat son propre coup précédent
        return state.lastBot ? counterOf(state.lastBot) : null;
      case 'counterLast':
        return state.lastPlayer ? counterOf(state.lastPlayer) : null;
      case 'markov': {
        if (state.observed < 3) return null;
        const row = state.lastPlayer && state.transitions[state.lastPlayer];
        const rowTotal = row ? MOVES.reduce((sum, m) => sum + row[m], 0) : 0;
        const predicted = rowTotal >= 2 ? state.argmax(row) : state.argmax(state.totals);
        return predicted && counterOf(predicted);
      }
      case 'meta': {
        if (state.observed < 2) return null;
        const ranked = Object.keys(PREDICTORS)
          .map((name) => ({ name, score: state.scores[name], guess: PREDICTORS[name](state) }))
          .filter((p) => p.guess)
          .sort((a, b) => b.score - a.score);
        return ranked.length ? counterOf(ranked[0].guess) : null;
      }
      default:
        return null;
    }
  }

  return {
    strategy,

    pick() {
      const move = random() < randomness ? null : signatureMove();
      return move ?? randomMove();
    },

    /** À appeler après chaque manche avec les deux coups joués. */
    observe(playerMove, botMove) {
      // Les lectures "meta" sont notées sur l'état d'AVANT ce coup
      for (const [name, predict] of Object.entries(PREDICTORS)) {
        const guess = predict(state);
        state.scores[name] = state.scores[name] * 0.85 + (guess === playerMove ? 1 : 0);
      }
      state.totals[playerMove] += 1;
      if (state.lastPlayer) state.transitions[state.lastPlayer][playerMove] += 1;
      state.lastPlayer = playerMove;
      state.lastBot = botMove ?? null;
      state.observed += 1;
    },
  };
}

/**
 * Décision d'atout de l'IA (prise AVANT le choix du joueur, et incluse dans
 * l'engagement cryptographique).
 */
export function chooseBotBoost(
  { available = {}, playerScore, botScore, winsNeeded },
  random = secureRandom,
) {
  const has = (kind) => (available[kind] ?? 0) > 0;
  const playerAtMatchPoint = playerScore === winsNeeded - 1;
  if (has('shield') && playerAtMatchPoint && random() < 0.6) return 'shield';
  if (has('double') && botScore < playerScore && random() < 0.45) return 'double';
  if (has('double') && random() < 0.15) return 'double';
  if (has('shield') && random() < 0.12) return 'shield';
  return null;
}

/** Un coup que l'IA n'a PAS joué (atout Espion), tiré au hasard parmi les deux autres. */
export function spyHint(botMove, random = secureRandom) {
  const others = MOVES.filter((m) => m !== botMove);
  return others[Math.min(others.length - 1, Math.floor(random() * others.length))];
}

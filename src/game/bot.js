import { MOVES, counterOf } from './rules.js';
import { secureRandom } from './fairness.js';

/**
 * Adversaire IA.
 *  - 'random' : coups uniformément aléatoires.
 *  - 'markov' : mémorise quel coup le joueur enchaîne après chacun de ses coups
 *    et contre le plus probable, avec une part d'aléatoire pour rester imprévisible.
 *
 * Le bot ne voit jamais le coup en cours du joueur : il s'engage (commit) avant.
 */
export function createBot({ strategy = 'markov', random = secureRandom, explore = 0.35 } = {}) {
  const transitions = Object.fromEntries(
    MOVES.map((m) => [m, Object.fromEntries(MOVES.map((n) => [n, 0]))]),
  );
  const totals = Object.fromEntries(MOVES.map((m) => [m, 0]));
  let lastPlayerMove = null;
  let observed = 0;

  const randomMove = () => MOVES[Math.min(MOVES.length - 1, Math.floor(random() * MOVES.length))];

  function predictPlayerMove() {
    if (lastPlayerMove) {
      const row = transitions[lastPlayerMove];
      const rowTotal = MOVES.reduce((sum, m) => sum + row[m], 0);
      if (rowTotal >= 2) return argmax(row);
    }
    return argmax(totals);
  }

  function argmax(counts) {
    const best = Math.max(...MOVES.map((m) => counts[m]));
    const candidates = MOVES.filter((m) => counts[m] === best);
    return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  }

  return {
    strategy,

    pick() {
      if (strategy === 'random' || observed < 3 || random() < explore) return randomMove();
      return counterOf(predictPlayerMove());
    },

    observe(playerMove) {
      totals[playerMove] += 1;
      if (lastPlayerMove) transitions[lastPlayerMove][playerMove] += 1;
      lastPlayerMove = playerMove;
      observed += 1;
    },
  };
}

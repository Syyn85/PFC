import { resolveRound } from './rules.js';

/**
 * État d'un match : pure logique, aucune dépendance au rendu.
 * Les égalités ne rapportent aucun point mais comptent comme une manche jouée.
 */
export class Match {
  constructor({ winsNeeded = 2 } = {}) {
    this.winsNeeded = winsNeeded;
    this.playerScore = 0;
    this.botScore = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.rounds = [];
    this.winner = null;
  }

  get isOver() {
    return this.winner !== null;
  }

  get roundNumber() {
    return this.rounds.length + 1;
  }

  playRound(playerMove, botMove) {
    if (this.isOver) throw new Error('Le match est terminé');
    const outcome = resolveRound(playerMove, botMove);

    if (outcome === 'win') {
      this.playerScore += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else if (outcome === 'lose') {
      this.botScore += 1;
      this.streak = 0;
    }

    if (this.playerScore >= this.winsNeeded) this.winner = 'player';
    else if (this.botScore >= this.winsNeeded) this.winner = 'bot';

    const round = {
      number: this.rounds.length + 1,
      playerMove,
      botMove,
      outcome,
      playerScore: this.playerScore,
      botScore: this.botScore,
      streak: this.streak,
      matchOver: this.isOver,
      winner: this.winner,
    };
    this.rounds.push(round);
    return round;
  }
}

/** Récompenses d'une manche selon le barème de la config. */
export function computeRoundRewards(round, rewards) {
  const items = [];
  if (round.outcome === 'win') {
    items.push({ label: 'Manche gagnée', amount: rewards.roundWin });
    if (round.streak > 0 && round.streak % rewards.streakEvery === 0) {
      items.push({ label: `Série de ${round.streak}`, amount: rewards.streakBonus });
    }
  }
  if (round.matchOver && round.winner === 'player') {
    items.push({ label: 'Match remporté', amount: rewards.matchWin });
  }
  return { items, total: items.reduce((sum, item) => sum + item.amount, 0) };
}

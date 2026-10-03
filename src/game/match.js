import { resolveRound } from './rules.js';

/**
 * Atouts, utilisables une fois chacun par match :
 *  shield  Bouclier : une défaite sur cette manche ne donne pas de point à l'adversaire
 *  double  Double   : une victoire sur cette manche rapporte 2 points
 *  spy     Espion   : révèle un coup que l'adversaire n'a PAS joué (n'affecte pas le score)
 *
 * Bouclier et Double se jouent sur une manche, en même temps que le coup, et
 * sont consommés même s'ils ne servent pas : c'est tout le pari.
 */
export const ROUND_BOOSTS = ['shield', 'double'];
export const DEFAULT_PLAYER_BOOSTS = Object.freeze({ shield: 1, double: 1, spy: 1 });

/**
 * État d'un match : pure logique, aucune dépendance au rendu.
 * Les égalités ne rapportent aucun point mais comptent comme une manche jouée.
 */
export class Match {
  constructor({ winsNeeded = 2, playerBoosts = DEFAULT_PLAYER_BOOSTS, botBoosts = {} } = {}) {
    this.winsNeeded = winsNeeded;
    this.playerScore = 0;
    this.botScore = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.rounds = [];
    this.winner = null;
    this.boosts = { player: { ...playerBoosts }, bot: { ...botBoosts } };
  }

  get isOver() {
    return this.winner !== null;
  }

  get roundNumber() {
    return this.rounds.length + 1;
  }

  canUse(side, kind) {
    return (this.boosts[side][kind] ?? 0) > 0;
  }

  consume(side, kind) {
    if (!this.canUse(side, kind)) throw new Error(`Atout indisponible : ${side}/${kind}`);
    this.boosts[side][kind] -= 1;
  }

  playRound(playerMove, botMove, { playerBoost = null, botBoost = null } = {}) {
    if (this.isOver) throw new Error('Le match est terminé');
    for (const [side, boost] of [
      ['player', playerBoost],
      ['bot', botBoost],
    ]) {
      if (boost === null) continue;
      if (!ROUND_BOOSTS.includes(boost)) throw new Error(`Atout de manche invalide : ${boost}`);
      this.consume(side, boost);
    }

    const outcome = resolveRound(playerMove, botMove);
    let playerPoints = 0;
    let botPoints = 0;
    let blockedBy = null;
    if (outcome === 'win') {
      if (botBoost === 'shield') blockedBy = 'bot';
      else playerPoints = playerBoost === 'double' ? 2 : 1;
    } else if (outcome === 'lose') {
      if (playerBoost === 'shield') blockedBy = 'player';
      else botPoints = botBoost === 'double' ? 2 : 1;
    }

    this.playerScore += playerPoints;
    this.botScore += botPoints;
    if (playerPoints > 0) {
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else if (botPoints > 0) {
      this.streak = 0;
    }

    if (this.playerScore >= this.winsNeeded) this.winner = 'player';
    else if (this.botScore >= this.winsNeeded) this.winner = 'bot';

    const round = {
      number: this.rounds.length + 1,
      playerMove,
      botMove,
      outcome,
      playerBoost,
      botBoost,
      playerPoints,
      botPoints,
      blockedBy,
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

/** Récompenses d'une manche selon le barème de la config (avant plafond quotidien). */
export function computeRoundRewards(round, rewards) {
  const items = [];
  if (round.playerPoints > 0) {
    const doubled = round.playerPoints > 1;
    items.push({
      label: doubled ? 'Manche gagnée ×2' : 'Manche gagnée',
      amount: rewards.roundWin * round.playerPoints,
    });
    if (round.streak % rewards.streakEvery === 0) {
      items.push({ label: `Série de ${round.streak}`, amount: rewards.streakBonus });
    }
  }
  if (round.matchOver && round.winner === 'player') {
    items.push({ label: 'Match remporté', amount: rewards.matchWin });
  }
  return { items, total: items.reduce((sum, item) => sum + item.amount, 0) };
}

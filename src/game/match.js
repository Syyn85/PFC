import { resolveRound } from './rules.js';

/**
 * Atouts :
 *  shield  Bouclier : une défaite sur cette manche ne donne pas de point à l'adversaire
 *  double  Double   : une victoire sur cette manche rapporte 2 points
 *  spy     Espion   : révèle un coup que l'adversaire n'a PAS joué (n'affecte pas le score)
 *
 * Bouclier et Double se jouent sur une manche, en même temps que le coup, et
 * sont consommés même s'ils ne servent pas : c'est tout le pari.
 * L'Espion ne se cumule pas avec Bouclier ou Double sur la même manche : avec
 * l'information de l'Espion, on peut toujours choisir un coup qui ne perd pas.
 *
 * Avant chaque match, le joueur choisit ses atouts (voir draftSize) : 1 pour
 * un match en 2 manches gagnantes, 2 au-delà.
 */
export const ROUND_BOOSTS = ['shield', 'double'];
export const ALL_BOOSTS = ['shield', 'double', 'spy'];
export const DEFAULT_PLAYER_BOOSTS = Object.freeze({ shield: 1, double: 1, spy: 1 });

/** Nombre d'atouts que le joueur emporte dans un match. */
export function draftSize(winsNeeded) {
  return winsNeeded >= 3 ? 2 : 1;
}

/** Convertit une sélection d'atouts (['spy', 'shield']) en inventaire de match. */
export function boostsFromDraft(kinds) {
  const boosts = { shield: 0, double: 0, spy: 0 };
  for (const kind of kinds) {
    if (!ALL_BOOSTS.includes(kind)) throw new Error(`Atout inconnu : ${kind}`);
    boosts[kind] += 1;
  }
  return boosts;
}

/**
 * État d'un match : pure logique, aucune dépendance au rendu.
 * Les égalités ne rapportent aucun point mais comptent comme une manche jouée.
 */
export class Match {
  /**
   * @param {object} opts
   * @param {number} [opts.streak=0] série de manches gagnées héritée du match précédent
   */
  constructor({
    winsNeeded = 2,
    playerBoosts = DEFAULT_PLAYER_BOOSTS,
    botBoosts = {},
    streak = 0,
  } = {}) {
    this.winsNeeded = winsNeeded;
    this.playerScore = 0;
    this.botScore = 0;
    this.streak = streak;
    this.bestStreak = streak;
    this.rounds = [];
    this.winner = null;
    this.boosts = { player: { ...playerBoosts }, bot: { ...botBoosts } };
    this.spiedThisRound = false;
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

  /** Le joueur peut-il armer Bouclier ou Double pour cette manche ? */
  canArm(kind) {
    return ROUND_BOOSTS.includes(kind) && this.canUse('player', kind) && !this.spiedThisRound;
  }

  /** Le joueur peut-il utiliser l'Espion (aucun atout de manche armé) ? */
  canSpy(armed = null) {
    return this.canUse('player', 'spy') && !armed && !this.spiedThisRound;
  }

  /** Consomme l'Espion pour la manche en cours. */
  useSpy() {
    if (this.spiedThisRound) throw new Error('Espion déjà utilisé sur cette manche');
    this.consume('player', 'spy');
    this.spiedThisRound = true;
  }

  playRound(playerMove, botMove, { playerBoost = null, botBoost = null } = {}) {
    if (this.isOver) throw new Error('Le match est terminé');
    if (playerBoost && this.spiedThisRound) {
      throw new Error("L'Espion ne se cumule pas avec un autre atout sur la même manche");
    }
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
      spied: this.spiedThisRound,
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
    this.spiedThisRound = false;
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

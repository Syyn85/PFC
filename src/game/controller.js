import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ease } from '../core/tween.js';
import { createBot } from './bot.js';
import { createCommitment, verifyCommitment } from './fairness.js';
import { Match, computeRoundRewards } from './match.js';
import { MOVE_LABELS, verdictFor } from './rules.js';

const COUNTDOWN = ['Pierre…', 'Feuille…', 'Ciseaux !'];
const RESULT_TITLES = { win: 'Gagné !', lose: 'Perdu…', draw: 'Égalité !' };
const IMPACT_COLORS = { win: '#ffe25a', lose: '#ff7a9c', draw: '#cdbbff' };

/**
 * Chef d'orchestre : enchaîne les états du jeu et synchronise logique,
 * animations 3D, interface et sons.
 *
 * title → committing → choosing → resolving → (committing… | ended)
 */
export class GameController {
  constructor({ engine, tweens, player, bot, effects, hud, sfx, wallet }) {
    Object.assign(this, { engine, tweens, player, bot, effects, hud, sfx, wallet });
    this.state = 'boot';
    this.formatId = CONFIG.game.defaultFormat;
    this.opponent = createBot({ strategy: CONFIG.game.botStrategy });
    this.titleBlend = { value: 1 };
    this.match = null;
    this.commitment = null;
    this.matchEarnings = 0;

    hud
      .on('play', () => this.startMatch())
      .on('again', () => this.startMatch())
      .on('menu', () => this.enterTitle())
      .on('choose', (move) => this.choose(move))
      .on('hover', () => this.sfx.hover())
      .on('format', (id) => {
        this.formatId = id;
        this.sfx.unlock();
        this.sfx.click();
      })
      .on('sound', () => {
        this.sfx.unlock();
        this.sfx.setMuted(!this.sfx.muted);
        this.hud.setSound(!this.sfx.muted);
        this.sfx.click();
      })
      .on('wallet', () => {
        this.sfx.unlock();
        this.sfx.click();
        this.hud.toast(
          `Jetons de démo, conservés sur cet appareil. La connexion à ${CONFIG.chain.name} arrivera dans une prochaine version.`,
        );
      });

    wallet.subscribe((w) => this.hud.setBalance(w.balance));
    hud.setFormats(CONFIG.game.formats);
    hud.setFormat(this.formatId);
  }

  enterTitle() {
    this.state = 'title';
    const { hud, tweens } = this;
    hud.showTitle(true);
    hud.showHud(false);
    hud.showChoices(false);
    hud.hideEnd();
    hud.hideRoundResult();
    hud.clearCallout();
    this.player.setPose(tweens, 'relaxed', { duration: 0.5, easing: ease.outCubic });
    this.bot.setPose(tweens, 'relaxed', { duration: 0.5, easing: ease.outCubic });
    this.player.recover(tweens);
    this.bot.recover(tweens);
    tweens.to(this.titleBlend, { value: 1 }, { duration: 1.2, ease: ease.inOutCubic });
  }

  async startMatch() {
    if (!['title', 'ended'].includes(this.state)) return;
    this.state = 'starting';
    const { hud, sfx, tweens } = this;
    sfx.unlock();
    sfx.click();

    const format = CONFIG.game.formats.find((f) => f.id === this.formatId);
    this.match = new Match({ winsNeeded: format.winsNeeded });
    this.matchEarnings = 0;

    hud.showTitle(false);
    hud.hideEnd();
    hud.showHud(true);
    hud.setScore(0, 0);
    hud.setRound(1, []);
    hud.setStreak(0);
    tweens.to(this.titleBlend, { value: 0 }, { duration: 1.1, ease: ease.inOutCubic });
    await this.nextRound();
  }

  async nextRound() {
    this.state = 'committing';
    const { hud, tweens, player, bot } = this;
    hud.hideRoundResult();
    hud.clearCallout();
    await Promise.all([player.recover(tweens), bot.recover(tweens)]);
    player.setPose(tweens, 'rock', { duration: 0.35 });
    bot.setPose(tweens, 'rock', { duration: 0.35 });

    // L'IA choisit et s'engage AVANT que le joueur ne voie les cartes.
    bot.motion.glow = 1;
    tweens.to(bot.motion, { glow: 0.15 }, { duration: 1.2, ease: ease.outCubic });
    this.commitment = await createCommitment(this.opponent.pick());

    hud.setFairness({ hash: this.commitment.hash });
    hud.setRound(this.match.roundNumber, this.match.rounds);
    this.state = 'choosing';
    hud.showChoices(true);
  }

  async choose(move) {
    if (this.state !== 'choosing') return;
    this.state = 'resolving';
    const { hud, sfx, tweens, player, bot, engine, effects, commitment } = this;
    sfx.unlock();
    sfx.click();
    hud.showChoices(false);

    // "Pierre… Feuille… Ciseaux !" : trois coups de poing, révélation au troisième
    for (let i = 0; i < COUNTDOWN.length; i++) {
      const last = i === COUNTDOWN.length - 1;
      hud.callout(COUNTDOWN[i], { final: last });
      sfx.whoosh();
      const onApex = last
        ? () => {
            player.reveal(tweens, move);
            bot.reveal(tweens, commitment.move);
          }
        : undefined;
      await Promise.all([
        player.pump(tweens, { height: last ? 0.27 : 0.22, onApex }),
        bot.pump(tweens, { height: last ? 0.27 : 0.22 }),
      ]);
      if (!last) {
        sfx.thump(1 + i * 0.12);
        engine.addShake(0.15);
        await tweens.wait(0.06);
      }
    }

    // Impact !
    const round = this.match.playRound(move, commitment.move);
    this.opponent.observe(move);
    const impactAt = player
      .getFrontPosition(new THREE.Vector3())
      .lerp(bot.getFrontPosition(new THREE.Vector3()), 0.5);
    impactAt.y += 0.15;
    sfx.impact();
    engine.addShake(0.55);
    effects.impact(impactAt, {
      color: IMPACT_COLORS[round.outcome],
      strength: round.outcome === 'draw' ? 0.6 : 1,
    });

    const verified = await verifyCommitment(commitment);
    hud.setFairness({ ...commitment, verified });

    await tweens.wait(0.22);
    hud.clearCallout();
    this.#playOutcome(round);

    const rewards = computeRoundRewards(round, CONFIG.rewards);
    hud.setScore(round.playerScore, round.botScore, {
      bumped: { win: 'player', lose: 'bot' }[round.outcome] ?? null,
    });
    hud.setRound(round.number, this.match.rounds);
    hud.setStreak(round.streak);
    hud.showRoundResult({
      outcome: round.outcome,
      title: RESULT_TITLES[round.outcome],
      sub:
        verdictFor(round.playerMove, round.botMove) ??
        `${MOVE_LABELS[round.playerMove]} contre ${MOVE_LABELS[round.botMove]}, on rejoue`,
      reward: rewards.total > 0 ? rewardLabel(rewards) : null,
    });

    if (rewards.total > 0) {
      this.matchEarnings += rewards.total;
      effects.coinShower(
        player.getFrontPosition(new THREE.Vector3()),
        Math.min(6 + rewards.total, 24),
      );
      for (let i = 0; i < 3; i++) sfx.coin(0.25 + i * 0.12);
      await tweens.wait(0.5);
      this.wallet.credit(rewards.total, rewards.items.map((item) => item.label).join(', '));
      hud.setBalance(this.wallet.balance, { bump: true });
    }

    await tweens.wait(round.matchOver ? 1.1 : 1.7);
    if (round.matchOver) await this.endMatch(round);
    else await this.nextRound();
  }

  #playOutcome(round) {
    const { tweens, sfx, player, bot } = this;
    if (round.outcome === 'win') {
      sfx.win();
      player.lunge(tweens);
      bot.recoil(tweens);
    } else if (round.outcome === 'lose') {
      sfx.lose();
      bot.lunge(tweens);
      player.recoil(tweens);
    } else {
      sfx.draw();
      player.recoil(tweens);
      bot.recoil(tweens);
    }
  }

  async endMatch(round) {
    this.state = 'ended';
    const { hud, sfx, tweens, player, bot, effects, match } = this;
    const won = round.winner === 'player';
    hud.hideRoundResult();

    if (won) {
      sfx.fanfare();
      effects.celebrate(new THREE.Vector3(0, 3.2, 0.5), 160);
      player.celebrate(tweens);
      bot.slump(tweens);
    } else {
      sfx.lose();
      bot.celebrate(tweens);
      player.slump(tweens);
    }

    const roundsWon = match.rounds.filter((r) => r.outcome === 'win').length;
    hud.showEnd({
      won,
      title: won ? 'Victoire !' : 'Défaite…',
      sub: won
        ? `Tu bats l'IA ${match.playerScore} à ${match.botScore}`
        : `L'IA l'emporte ${match.botScore} à ${match.playerScore}`,
      stats: [
        ['Manches', match.rounds.length],
        ['Gagnées', roundsWon],
        ['Série max', match.bestStreak],
      ],
      reward:
        this.matchEarnings > 0 ? `+${this.matchEarnings} ${CONFIG.token.symbol} gagnés` : null,
    });
  }

  update(dt, time) {
    const blend = this.titleBlend.value;
    const rig = this.engine.rig;
    rig.orbit = blend * Math.sin(time * 0.12) * 0.32;
    rig.zoom = 1 + blend * 0.32;
    rig.lift = blend * 0.55;
  }
}

function rewardLabel(rewards) {
  const detail =
    rewards.items.length > 1 ? ` (${rewards.items.map((i) => i.label).join(' + ')})` : '';
  return `+${rewards.total} ${CONFIG.token.symbol}${detail}`;
}

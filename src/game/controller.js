import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { ease } from '../core/tween.js';
import { chooseBotBoost, createBot, spyHint } from './bot.js';
import { createCommitment, secureRandomInt, verifyCommitment } from './fairness.js';
import { ALL_BOOSTS, Match, boostsFromDraft, computeRoundRewards, draftSize } from './match.js';
import { CAMPAIGN, QUICK_MATCH, findOpponent, nextOpponent, pickLine } from './opponents.js';
import { CampaignProgress, DailyRewards } from './progress.js';
import { MOVES, MOVE_LABELS, verdictFor } from './rules.js';

const COUNTDOWN = ['Pierre…', 'Feuille…', 'Ciseaux !'];
const IMPACT_COLORS = { win: '#ffe25a', lose: '#ff7a9c', draw: '#cdbbff' };
const BOOST_LABELS = { shield: 'Bouclier', double: 'Double', spy: 'Espion' };
const BOOST_PROMPTS = {
  shield: 'Bouclier armé : une défaite ne comptera pas',
  double: 'Double armé : une victoire vaudra 2 points',
};
const SYMBOL = CONFIG.token.symbol;
const DRAFT_KEY = 'pfc:draft';
// Le chrono ne démarre qu'une fois les cartes posées (animation d'entrée, styles.css)
const CARDS_ENTRANCE = 0.6;

const randomMove = () => MOVES[secureRandomInt(MOVES.length)];

/**
 * Chef d'orchestre : enchaîne les états du jeu et synchronise logique,
 * animations 3D, interface et sons.
 *
 * title ⇄ map → starting → drafting → committing → choosing → resolving → (committing… | ended)
 */
export class GameController {
  constructor({ engine, tweens, world, player, bot, effects, hud, sfx, music, wallet, portraits }) {
    Object.assign(this, { engine, tweens, world, player, bot, effects, hud, sfx, music, wallet });
    this.portraits = portraits;
    this.state = 'boot';
    this.formatId = CONFIG.game.defaultFormat;
    this.progress = new CampaignProgress(CAMPAIGN);
    this.daily = new DailyRewards({ cap: CONFIG.rewards.dailyCap });
    this.titleBlend = { value: 1 };
    this.def = QUICK_MATCH;
    this.pendingWins = 2;
    this.botPaletteId = QUICK_MATCH.id;
    this.ai = null;
    this.match = null;
    this.commitment = null;
    this.armed = null;
    this.excluded = null;
    this.spyText = null;
    this.timer = null;
    this.bubbleTime = 0;
    this.matchEarnings = 0;
    this.capped = false;
    const savedDraft = readJSON(DRAFT_KEY, []);
    this.lastDraft = Array.isArray(savedDraft)
      ? savedDraft.filter((k) => ALL_BOOSTS.includes(k))
      : [];
    this._v = new THREE.Vector3();

    const withAudio =
      (fn) =>
      (...args) => {
        this.sfx.unlock();
        fn(...args);
      };
    hud
      .on(
        'openMap',
        withAudio(() => this.openMap()),
      )
      .on(
        'closeMap',
        withAudio(() => this.enterTitle()),
      )
      .on(
        'island',
        withAudio((id) => this.#guard(this.startMatch(findOpponent(id)))),
      )
      .on(
        'quickMatch',
        withAudio(() => this.#guard(this.startMatch(QUICK_MATCH))),
      )
      .on(
        'again',
        withAudio(() => this.#guard(this.startMatch(this.def))),
      )
      .on(
        'next',
        withAudio(() => this.#guard(this.startMatch(nextOpponent(this.def.id)))),
      )
      .on(
        'menu',
        withAudio(() => (this.def === QUICK_MATCH ? this.enterTitle() : this.openMap())),
      )
      .on('draftToggle', () => this.sfx.click())
      .on('draftConfirm', (kinds) => this.#guard(this.#beginMatch(kinds)))
      .on('draftCancel', () => this.#cancelDraft())
      .on('choose', (move) => this.#guard(this.choose(move)))
      .on('boost', (kind) => this.useBoost(kind))
      .on('hover', () => this.sfx.hover())
      .on(
        'format',
        withAudio((id) => {
          this.formatId = id;
          this.sfx.click();
        }),
      )
      .on(
        'sound',
        withAudio(() => {
          this.sfx.setMuted(!this.sfx.muted);
          this.hud.setSound(!this.sfx.muted);
          this.sfx.click();
        }),
      )
      .on(
        'music',
        withAudio(() => {
          this.music.setMuted(!this.music.muted);
          this.hud.setMusic(!this.music.muted);
          this.sfx.click();
        }),
      )
      .on(
        'wallet',
        withAudio(() => {
          this.sfx.click();
          this.hud.toast(
            `Jetons de démo, conservés sur cet appareil. Gains du jour contre l'IA : ` +
              `${this.daily.earnedToday} / ${this.daily.cap} ${SYMBOL}. ` +
              `La connexion à ${CONFIG.chain.name} arrivera dans une prochaine version.`,
          );
        }),
      );

    // Le chrono se met en pause quand l'onglet est caché (la boucle de rendu s'arrête aussi)
    document.addEventListener('visibilitychange', () => this.#onVisibilityChange());
    world.onLightning = () => this.sfx.thunder();
    wallet.subscribe((w) => this.hud.setBalance(w.balance));
    hud.setFormats(CONFIG.game.formats);
    hud.setFormat(this.formatId);
    hud.setSound(!sfx.muted);
    hud.setMusic(!music.muted);
  }

  /**
   * Toute erreur dans une chaîne asynchrone (animation, stockage…) ramène au menu
   * au lieu de figer la partie dans un état sans issue.
   */
  #guard(promise) {
    promise?.catch?.((error) => {
      console.error(error);
      this.timer = null;
      this.hud.setTimer(null);
      this.hud.hideDraft();
      this.hud.toast('Oups, la partie a été interrompue. Retour au menu.');
      this.enterTitle();
    });
  }

  // --- Navigation ---------------------------------------------------------------

  enterTitle() {
    this.state = 'title';
    const { hud, tweens } = this;
    this.progress.reload();
    hud.showTitle(true, {
      progress:
        `${this.progress.clearedCount} / ${CAMPAIGN.length} îles libérées · ` +
        `gains du jour ${this.daily.earnedToday} / ${this.daily.cap} ${SYMBOL}`,
    });
    hud.showMap(false);
    hud.hideDraft();
    hud.showHud(false);
    hud.showChoices(false);
    hud.hideEnd();
    hud.hideRoundResult();
    hud.hideVersus();
    hud.clearCallout();
    this.timer = null;
    hud.setTimer(null);
    this.music.setIntensity(0);
    this.#resetStage();
    tweens.to(this.titleBlend, { value: 1 }, { duration: 1.2, ease: ease.inOutCubic });
  }

  openMap() {
    if (!['title', 'ended', 'drafting'].includes(this.state)) return;
    this.state = 'map';
    this.sfx.click();
    const { hud, progress } = this;
    progress.reload();
    let nextMarked = false;
    const entries = CAMPAIGN.map((opponent, i) => {
      const cleared = progress.isCleared(opponent.id);
      const state = cleared ? 'cleared' : progress.isUnlocked(opponent.id) ? 'open' : 'locked';
      const isNext = state === 'open' && !nextMarked;
      if (isNext) nextMarked = true;
      return {
        opponent,
        portrait: this.portraits[opponent.id],
        state,
        isNext,
        lockedBy: CAMPAIGN[i - 1]?.name,
      };
    });
    hud.renderMap(entries, { symbol: SYMBOL });
    hud.showTitle(false);
    hud.hideDraft();
    hud.hideEnd();
    hud.showHud(false);
    hud.showMap(true);
    this.music.setIntensity(0);
    this.#resetStage();
    this.tweens.to(this.titleBlend, { value: 1 }, { duration: 1.2, ease: ease.inOutCubic });
  }

  /** Efface les traces du match précédent : ciel, poses, positions. */
  #resetStage() {
    const { tweens } = this;
    this.world.setTheme('crepuscule');
    this.player.setPose(tweens, 'relaxed', { duration: 0.5, easing: ease.outCubic });
    this.bot.setPose(tweens, 'relaxed', { duration: 0.5, easing: ease.outCubic });
    this.player.recover(tweens);
    this.bot.recover(tweens);
  }

  // --- Préparation du match : adversaire, puis choix des atouts --------------------

  async startMatch(def) {
    if (!def || !['title', 'map', 'ended'].includes(this.state)) return;
    if (def !== QUICK_MATCH && !this.progress.isUnlocked(def.id)) return;
    this.state = 'starting';
    const { hud, sfx, tweens, bot, world } = this;
    sfx.click();
    this.music.start();
    this.music.setIntensity(1);

    const winsNeeded =
      def.winsNeeded ?? CONFIG.game.formats.find((f) => f.id === this.formatId).winsNeeded;
    this.def = def;
    this.pendingWins = winsNeeded;

    hud.showTitle(false);
    hud.showMap(false);
    hud.hideEnd();
    hud.hideRoundResult();
    hud.showHud(false);
    world.setTheme(def.theme);
    tweens.to(this.titleBlend, { value: 0 }, { duration: 1.1, ease: ease.inOutCubic });

    if (this.botPaletteId !== def.id) {
      this.botPaletteId = def.id;
      sfx.swoosh();
      await bot.swapIn(tweens, def.palette);
    }

    this.state = 'drafting';
    const size = draftSize(winsNeeded);
    hud.showDraft({
      island: def.island ? `Île ${def.island}` : 'Partie rapide',
      name: def.name,
      title: def.title,
      tags: this.#opponentTags(def, winsNeeded),
      size,
      preselected: this.lastDraft,
    });
    hud.announce(
      `${def.name}, ${def.title}. Choisis ${size > 1 ? `${size} atouts` : '1 atout'} pour ce match.`,
    );
  }

  #opponentTags(def, winsNeeded) {
    const botBoosts = Object.entries(def.botBoosts)
      .filter(([, n]) => n > 0)
      .map(([kind]) => BOOST_LABELS[kind]);
    return [
      `${winsNeeded} manches gagnantes`,
      def.timer ? `Chrono ${def.timer} s` : null,
      botBoosts.length ? `Atouts adverses : ${botBoosts.join(', ')}` : null,
      `Gains possibles aujourd'hui : ${this.daily.remaining} ${SYMBOL}`,
    ].filter(Boolean);
  }

  #cancelDraft() {
    if (this.state !== 'drafting') return;
    this.hud.hideDraft();
    if (this.def === QUICK_MATCH) this.enterTitle();
    else this.openMap();
  }

  async #beginMatch(kinds) {
    if (this.state !== 'drafting') return;
    this.state = 'starting';
    const { hud, tweens, def } = this;
    const winsNeeded = this.pendingWins;
    this.lastDraft = kinds;
    writeJSON(DRAFT_KEY, kinds);
    hud.hideDraft();
    this.sfx.boost();

    // Une série de manches gagnées se prolonge d'un match gagné au suivant
    const previous = this.match;
    const streak = previous?.winner === 'player' ? previous.streak : 0;
    this.ai = createBot({ strategy: def.strategy });
    this.match = new Match({
      winsNeeded,
      playerBoosts: boostsFromDraft(kinds),
      botBoosts: def.botBoosts,
      streak,
    });
    this.matchEarnings = 0;
    this.capped = false;

    hud.showHud(true);
    hud.resetFairness();
    hud.setOpponentName(def.name);
    hud.setScore(0, 0);
    hud.setRound(1, []);
    hud.setStreak(streak);
    hud.setBotBoosts(def.botBoosts, this.match.boosts.bot);
    hud.setBoostKinds(kinds);
    hud.showVersus({
      island: def.island
        ? `Île ${def.island} · ${winsNeeded} manches gagnantes`
        : `Partie rapide · ${winsNeeded} manches gagnantes`,
      name: def.name,
      title: def.title,
    });
    this.#say('intro');
    await tweens.wait(1.5);
    hud.hideVersus();
    await this.nextRound();
  }

  // --- Manche -------------------------------------------------------------------

  async nextRound() {
    this.state = 'committing';
    const { hud, tweens, player, bot, match } = this;
    hud.hideRoundResult();
    hud.clearCallout();
    hud.markExcluded(null);
    this.armed = null;
    this.excluded = null;
    this.spyText = null;
    await Promise.all([player.recover(tweens), bot.recover(tweens)]);
    player.setPose(tweens, 'rock', { duration: 0.35 });
    bot.setPose(tweens, 'rock', { duration: 0.35 });

    // L'IA choisit son coup ET son atout, puis s'engage AVANT que le joueur ne voie les cartes.
    bot.motion.glow = 1;
    tweens.to(bot.motion, { glow: 0.15 }, { duration: 1.2, ease: ease.outCubic });
    const botBoost = chooseBotBoost({
      available: match.boosts.bot,
      playerScore: match.playerScore,
      botScore: match.botScore,
      winsNeeded: match.winsNeeded,
    });
    this.commitment = await createCommitment(this.ai.pick(), { boost: botBoost });

    hud.setFairness({ hash: this.commitment.hash });
    hud.setRound(match.roundNumber, match.rounds);
    this.#updatePrompt();
    this.#refreshBoosts();

    // Chrono à échéance réelle (horloge murale), indépendant de la cadence d'images
    const seconds = this.def.timer;
    this.timer = seconds
      ? {
          total: seconds,
          deadline: performance.now() + (seconds + CARDS_ENTRANCE) * 1000,
          lastTick: Math.ceil(seconds),
          paused: document.hidden ? seconds + CARDS_ENTRANCE : null,
        }
      : null;
    hud.setTimer(this.timer ? 1 : null, { seconds });
    this.state = 'choosing';
    hud.showChoices(true);
    hud.announce(
      `Manche ${match.roundNumber}. Choisis ton coup${seconds ? `, tu as ${seconds} secondes` : ''}.`,
    );
  }

  #onVisibilityChange() {
    const timer = this.timer;
    if (!timer) return;
    if (document.hidden) {
      timer.paused = Math.max(0, (timer.deadline - performance.now()) / 1000);
    } else if (timer.paused !== null) {
      timer.deadline = performance.now() + timer.paused * 1000;
      timer.paused = null;
    }
  }

  useBoost(kind) {
    if (this.state !== 'choosing') return;
    const { hud, sfx, match } = this;
    if (kind === 'spy') {
      if (!match.canSpy(this.armed)) {
        if (this.armed && match.canUse('player', 'spy')) {
          hud.toast("L'Espion ne se cumule pas avec un atout armé : désarme-le d'abord.");
        }
        return;
      }
      match.useSpy();
      this.excluded = spyHint(this.commitment.move);
      this.spyText = `L'Espion a vu : ${this.def.name} ne joue pas ${MOVE_LABELS[this.excluded]}`;
      hud.markExcluded(this.excluded);
      hud.announce(this.spyText);
      sfx.spy();
    } else if (this.armed === kind) {
      this.armed = null;
      sfx.boost();
    } else {
      if (!match.canArm(kind)) {
        if (match.spiedThisRound && match.canUse('player', kind)) {
          hud.toast("Espion utilisé : pas d'autre atout sur cette manche.");
        }
        return;
      }
      this.armed = kind;
      hud.announce(BOOST_PROMPTS[kind]);
      sfx.boost();
    }
    this.#updatePrompt();
    this.#refreshBoosts();
  }

  #updatePrompt() {
    const parts = [this.spyText, this.armed && BOOST_PROMPTS[this.armed]].filter(Boolean);
    this.hud.setPrompt(parts.length ? parts.join(' · ') : 'Choisis ton coup');
  }

  #refreshBoosts() {
    const { match, armed } = this;
    const left = match.boosts.player;
    this.hud.setBoosts({
      shield: {
        count: left.shield,
        armed: armed === 'shield',
        available: armed === 'shield' || match.canArm('shield'),
      },
      double: {
        count: left.double,
        armed: armed === 'double',
        available: armed === 'double' || match.canArm('double'),
      },
      spy: { count: left.spy, available: match.canSpy(armed) },
    });
  }

  async choose(move, { auto = false } = {}) {
    if (this.state !== 'choosing') return;
    // Un clic arrivé après l'échéance, avant que la boucle ne la constate : le chrono l'emporte
    if (
      !auto &&
      this.timer &&
      this.timer.paused === null &&
      performance.now() > this.timer.deadline
    ) {
      move = randomMove();
      auto = true;
    }
    this.state = 'resolving';
    const { hud, sfx, tweens, player, bot, engine, effects, commitment, def } = this;
    this.timer = null;
    hud.setTimer(null);
    hud.showChoices(false);
    hud.hideBubble();
    if (auto) {
      hud.callout('Trop lent !');
      hud.announce(`Trop lent : coup joué au hasard, ${MOVE_LABELS[move]}.`);
      sfx.lose();
      await tweens.wait(0.7);
    } else {
      sfx.click();
    }

    // "Pierre… Feuille… Ciseaux !" : trois coups de poing, révélation au troisième
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
        player.pump(tweens, { height: last ? 0.15 : 0.12, onApex }),
        bot.pump(tweens, { height: last ? 0.15 : 0.12 }),
      ]);
      if (!last) {
        sfx.thump(1 + i * 0.12);
        engine.addShake(0.15);
        await tweens.wait(0.06);
      }
    }

    // Impact !
    const round = this.match.playRound(move, commitment.move, {
      playerBoost: this.armed,
      botBoost: commitment.boost,
    });
    this.ai.observe(move, commitment.move);
    const playerFront = player.getFrontPosition(new THREE.Vector3());
    const botFront = bot.getFrontPosition(new THREE.Vector3());
    const impactAt = playerFront.clone().lerp(botFront, 0.5);
    impactAt.y += 0.15;
    sfx.impact();
    engine.addShake(0.55);
    effects.impact(impactAt, {
      color: IMPACT_COLORS[round.outcome],
      strength: round.outcome === 'draw' ? 0.6 : 1,
    });
    this.#boostEffects(round, playerFront, botFront);

    // Les gains sont décomptés du plafond ET crédités dans la même étape
    const { rewards, granted } = this.#awardRound(round);

    const verified = await verifyCommitment(commitment);
    hud.setFairness({
      ...commitment,
      verified,
      labels: {
        move: MOVE_LABELS[commitment.move],
        boost: commitment.boost ? BOOST_LABELS[commitment.boost] : null,
      },
    });

    await tweens.wait(0.22);
    hud.clearCallout();
    this.#playOutcome(round);

    hud.setScore(round.playerScore, round.botScore, {
      bumped: round.playerPoints > 0 ? 'player' : round.botPoints > 0 ? 'bot' : null,
    });
    hud.setRound(round.number, this.match.rounds);
    hud.setStreak(round.streak);
    hud.setBotBoosts(def.botBoosts, this.match.boosts.bot);

    const { title, tone } = resultHeadline(round);
    const notes = boostNotes(round, def.name);
    const sub =
      verdictFor(round.playerMove, round.botMove) ??
      `${MOVE_LABELS[round.playerMove]} contre ${MOVE_LABELS[round.botMove]}, on rejoue`;
    let reward = null;
    if (granted > 0) reward = rewardLabel(granted, rewards);
    else if (rewards.total > 0) reward = 'Plafond du jour atteint';
    hud.showRoundResult({
      outcome: tone,
      title,
      sub,
      boostNote: notes.text,
      boostSide: notes.side,
      reward,
    });
    hud.announce(
      [title, sub, notes.text, `Score : ${round.playerScore} à ${round.botScore}`, reward]
        .filter(Boolean)
        .join('. '),
    );
    if (round.botPoints > 0 && !round.matchOver) this.#say('roundWin');
    else if (round.playerPoints > 0 && !round.matchOver) this.#say('roundLose');

    if (granted > 0) {
      effects.coinShower(playerFront, Math.min(6 + granted, 24));
      for (let i = 0; i < 3; i++) sfx.coin(0.25 + i * 0.12);
      await tweens.wait(0.5);
      hud.setBalance(this.wallet.balance, { bump: true });
    }

    await tweens.wait(round.matchOver ? 1.1 : 1.8);
    if (round.matchOver) await this.endMatch(round);
    else await this.nextRound();
  }

  /** Point unique d'attribution des gains (futur branchement de l'économie on-chain). */
  #awardRound(round) {
    const rewards = computeRoundRewards(round, CONFIG.rewards);
    const granted = rewards.total > 0 ? this.daily.grant(rewards.total) : 0;
    if (granted > 0) {
      this.wallet.credit(granted, rewards.items.map((item) => item.label).join(', '));
    }
    if (granted < rewards.total) this.capped = true;
    this.matchEarnings += granted;
    return { rewards, granted };
  }

  #boostEffects(round, playerFront, botFront) {
    const { effects, sfx } = this;
    const above = (v) => v.clone().add(new THREE.Vector3(0, 0.9, 0));
    if (round.blockedBy) {
      const front = round.blockedBy === 'player' ? playerFront : botFront;
      effects.shieldBlock(front);
      effects.badge('Bloqué !', above(front), { fill: '#7fe7ff' });
      sfx.shield();
    }
    if (round.playerPoints === 2) effects.badge('×2', above(playerFront));
    if (round.botPoints === 2) effects.badge('×2', above(botFront), { fill: '#ff7a9c' });
  }

  #playOutcome(round) {
    const { tweens, sfx, player, bot } = this;
    if (round.playerPoints > 0) {
      sfx.win();
      player.lunge(tweens);
      bot.recoil(tweens);
    } else if (round.botPoints > 0) {
      sfx.lose();
      bot.lunge(tweens);
      player.recoil(tweens);
    } else if (round.blockedBy) {
      // Le coup gagnant rebondit sur le bouclier
      (round.blockedBy === 'player' ? bot : player).lunge(tweens);
    } else {
      sfx.draw();
      player.recoil(tweens);
      bot.recoil(tweens);
    }
  }

  async endMatch(round) {
    this.state = 'ended';
    const { hud, sfx, tweens, player, bot, effects, match, def } = this;
    const won = round.winner === 'player';
    const campaign = def !== QUICK_MATCH;
    hud.hideRoundResult();
    this.music.setIntensity(0);

    let bonus = null;
    if (won && campaign && this.progress.markCleared(def.id)) {
      this.wallet.credit(def.firstClear, `Île ${def.island} libérée`);
      hud.setBalance(this.wallet.balance, { bump: true });
      bonus = `Île libérée ! +${def.firstClear} ${SYMBOL}`;
    }

    if (won) {
      sfx.fanfare();
      effects.celebrate(new THREE.Vector3(0, 3.2, 0.5), this.engine.reducedMotion ? 40 : 160);
      player.celebrate(tweens);
      bot.slump(tweens);
    } else {
      sfx.lose();
      bot.celebrate(tweens);
      player.slump(tweens);
    }
    this.#say(won ? 'matchLose' : 'matchWin');
    // Laisse le temps de savourer la célébration (et la réplique) avant le bilan
    await tweens.wait(1.8);
    if (this.state !== 'ended') return; // le joueur a quitté entre-temps
    hud.hideBubble();

    const next = campaign && won ? nextOpponent(def.id) : null;
    const roundsWon = match.rounds.filter((r) => r.playerPoints > 0).length;
    const ending = campaign && won && !next;
    let title = 'Défaite…';
    if (ending) title = 'Tour des îles terminé !';
    else if (won) title = 'Victoire !';
    hud.showEnd({
      won,
      title,
      sub: won
        ? `Tu bats ${def.name} ${match.playerScore} à ${match.botScore}`
        : `${def.name} l'emporte ${match.botScore} à ${match.playerScore}`,
      stats: [
        ['Manches', match.rounds.length],
        ['Gagnées', roundsWon],
        ['Série max', match.bestStreak],
      ],
      bonus,
      reward: this.matchEarnings > 0 ? `+${this.matchEarnings} ${SYMBOL} gagnés` : null,
      note: this.capped
        ? `Plafond quotidien atteint (${this.daily.cap} ${SYMBOL} contre l'IA). Les bonus d'île restent acquis.`
        : null,
      hint: won ? null : def.tell,
      nextVisible: Boolean(next),
      menuLabel: campaign ? 'Carte des îles' : 'Menu',
    });
  }

  // --- Boucle -------------------------------------------------------------------

  #say(event) {
    const line = pickLine(this.def, event);
    if (!line) return;
    this.hud.showBubble(this.def.name, line);
    this.bubbleTime = 2.6;
  }

  update(dt, time) {
    const blend = this.titleBlend.value;
    const rig = this.engine.rig;
    rig.orbit = this.engine.reducedMotion ? 0 : blend * Math.sin(time * 0.12) * 0.32;
    rig.zoom = 1 + blend * 0.32;
    rig.lift = blend * 0.55;

    // Chronomètre de choix (horloge murale)
    const timer = this.timer;
    if (timer && this.state === 'choosing' && timer.paused === null) {
      const remaining = Math.min(timer.total, (timer.deadline - performance.now()) / 1000);
      const urgent = remaining <= 2;
      const second = Math.max(0, Math.ceil(remaining));
      this.hud.setTimer(Math.max(0, remaining) / timer.total, { urgent, seconds: second });
      if (second < timer.lastTick) {
        timer.lastTick = second;
        if (second <= 3 && second > 0) this.sfx.tick(urgent);
        if (second === 3) this.hud.announce('3 secondes');
      }
      if (remaining <= 0) this.#guard(this.choose(randomMove(), { auto: true }));
    }

    // Bulle de dialogue accrochée à la main adverse
    if (this.hud.bubbleVisible) {
      this.bubbleTime -= dt;
      if (this.bubbleTime <= 0) {
        this.hud.hideBubble();
      } else {
        const anchor = this.bot.getFrontPosition(this._v);
        anchor.y += 0.75;
        anchor.project(this.engine.camera);
        this.hud.positionBubble(
          ((anchor.x + 1) / 2) * window.innerWidth,
          ((1 - anchor.y) / 2) * window.innerHeight,
        );
      }
    }
  }
}

function resultHeadline(round) {
  if (round.playerPoints > 0) return { title: 'Gagné !', tone: 'win' };
  if (round.botPoints > 0) return { title: 'Perdu…', tone: 'lose' };
  if (round.blockedBy === 'player') return { title: 'Paré !', tone: 'draw' };
  if (round.blockedBy === 'bot') return { title: 'Bloqué !', tone: 'lose' };
  return { title: 'Égalité !', tone: 'draw' };
}

/** Phrase expliquant l'effet (ou le gâchis) des atouts de la manche. */
function boostNotes(round, name) {
  const notes = [];
  let side = 'player';
  const { playerBoost, botBoost } = round;
  if (playerBoost === 'shield') {
    notes.push(
      round.blockedBy === 'player'
        ? 'Ton Bouclier a encaissé le coup'
        : "Ton Bouclier n'a pas servi",
    );
  }
  if (playerBoost === 'double') {
    notes.push(round.playerPoints === 2 ? 'Double : 2 points !' : "Ton Double n'a pas servi");
  }
  if (botBoost === 'shield') {
    side = 'bot';
    notes.push(
      round.blockedBy === 'bot'
        ? `Bouclier de ${name} : ta victoire ne compte pas`
        : `${name} a gâché son Bouclier`,
    );
  }
  if (botBoost === 'double') {
    side = 'bot';
    notes.push(
      round.botPoints === 2
        ? `Double de ${name} : 2 points pour ${name}`
        : `${name} a gâché son Double`,
    );
  }
  return { text: notes.length ? notes.join(' · ') : null, side };
}

function rewardLabel(granted, rewards) {
  if (granted < rewards.total) return `+${granted} ${SYMBOL} · plafond du jour atteint`;
  const detail =
    rewards.items.length > 1 ? ` (${rewards.items.map((i) => i.label).join(' + ')})` : '';
  return `+${granted} ${SYMBOL}${detail}`;
}

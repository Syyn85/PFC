import { describe, expect, it } from 'vitest';
import { MOVES, counterOf, resolveRound, verdictFor } from '../src/game/rules.js';
import { Match, computeRoundRewards } from '../src/game/match.js';
import { chooseBotBoost, createBot, spyHint } from '../src/game/bot.js';
import { CampaignProgress, DailyRewards } from '../src/game/progress.js';
import { CAMPAIGN, nextOpponent } from '../src/game/opponents.js';
import { memoryStorage } from '../src/core/storage.js';
import {
  createCommitment,
  secureRandomInt,
  sha256Fallback,
  sha256Hex,
  verifyCommitment,
} from '../src/game/fairness.js';
import { CONFIG } from '../src/config.js';

describe('rules', () => {
  it('résout les 9 combinaisons', () => {
    const table = {
      rock: { rock: 'draw', paper: 'lose', scissors: 'win' },
      paper: { rock: 'win', paper: 'draw', scissors: 'lose' },
      scissors: { rock: 'lose', paper: 'win', scissors: 'draw' },
    };
    for (const a of MOVES) for (const b of MOVES) expect(resolveRound(a, b)).toBe(table[a][b]);
  });

  it('trouve le contre de chaque coup', () => {
    expect(counterOf('rock')).toBe('paper');
    expect(counterOf('paper')).toBe('scissors');
    expect(counterOf('scissors')).toBe('rock');
  });

  it('explique le verdict', () => {
    expect(verdictFor('rock', 'scissors')).toMatch(/pierre écrase/);
    expect(verdictFor('rock', 'paper')).toMatch(/feuille enveloppe/);
    expect(verdictFor('paper', 'paper')).toBeNull();
  });

  it('refuse un coup invalide', () => {
    expect(() => resolveRound('lizard', 'rock')).toThrow();
  });
});

describe('Match', () => {
  it('se termine quand un joueur atteint le score requis', () => {
    const match = new Match({ winsNeeded: 2 });
    match.playRound('rock', 'scissors');
    match.playRound('rock', 'rock');
    expect(match.isOver).toBe(false);
    const last = match.playRound('paper', 'rock');
    expect(last).toMatchObject({ number: 3, playerScore: 2, botScore: 0, matchOver: true });
    expect(match.winner).toBe('player');
    expect(() => match.playRound('rock', 'rock')).toThrow();
  });

  it('suit les séries de victoires', () => {
    const match = new Match({ winsNeeded: 5 });
    match.playRound('rock', 'scissors');
    match.playRound('rock', 'scissors');
    match.playRound('rock', 'rock');
    expect(match.streak).toBe(2);
    match.playRound('rock', 'paper');
    expect(match.streak).toBe(0);
    expect(match.bestStreak).toBe(2);
  });

  it('calcule les récompenses', () => {
    const rewards = CONFIG.rewards;
    const match = new Match({ winsNeeded: 3 });
    expect(computeRoundRewards(match.playRound('rock', 'scissors'), rewards).total).toBe(
      rewards.roundWin,
    );
    match.playRound('rock', 'scissors');
    const third = computeRoundRewards(match.playRound('rock', 'scissors'), rewards);
    expect(third.total).toBe(rewards.roundWin + rewards.streakBonus + rewards.matchWin);
    expect(computeRoundRewards({ playerPoints: 0, streak: 0 }, rewards).total).toBe(0);
  });

  it('Bouclier : une défaite ne donne pas de point', () => {
    const match = new Match({ winsNeeded: 2 });
    const round = match.playRound('rock', 'paper', { playerBoost: 'shield' });
    expect(round).toMatchObject({
      outcome: 'lose',
      botPoints: 0,
      blockedBy: 'player',
      botScore: 0,
    });
    expect(match.canUse('player', 'shield')).toBe(false);
    expect(() => match.playRound('rock', 'paper', { playerBoost: 'shield' })).toThrow();
  });

  it('Double : une victoire rapporte 2 points', () => {
    const match = new Match({ winsNeeded: 2 });
    const round = match.playRound('scissors', 'paper', { playerBoost: 'double' });
    expect(round).toMatchObject({
      playerPoints: 2,
      playerScore: 2,
      matchOver: true,
      winner: 'player',
    });
    const rewards = computeRoundRewards(round, CONFIG.rewards);
    expect(rewards.total).toBe(CONFIG.rewards.roundWin * 2 + CONFIG.rewards.matchWin);
  });

  it("le Bouclier de l'IA bloque la victoire du joueur sans casser sa série", () => {
    const match = new Match({ winsNeeded: 3, botBoosts: { shield: 1 } });
    match.playRound('rock', 'scissors');
    const round = match.playRound('paper', 'rock', { botBoost: 'shield' });
    expect(round).toMatchObject({ playerPoints: 0, blockedBy: 'bot', playerScore: 1, streak: 1 });
    expect(computeRoundRewards(round, CONFIG.rewards).total).toBe(0);
  });

  it("un atout gâché est quand même consommé, l'Espion n'est pas un atout de manche", () => {
    const match = new Match({ winsNeeded: 3 });
    match.playRound('rock', 'rock', { playerBoost: 'double' });
    expect(match.canUse('player', 'double')).toBe(false);
    expect(() => match.playRound('rock', 'rock', { playerBoost: 'spy' })).toThrow();
    match.consume('player', 'spy');
    expect(match.canUse('player', 'spy')).toBe(false);
  });
});

describe('bot', () => {
  const fixed = (value) => () => value;

  it('joue toujours un coup valide, quelle que soit la stratégie', () => {
    for (const strategy of [
      'random',
      'rocky',
      'mirror',
      'cycle',
      'counterLast',
      'markov',
      'meta',
    ]) {
      const bot = createBot({ strategy });
      for (let i = 0; i < 30; i++) {
        const move = bot.pick();
        expect(MOVES).toContain(move);
        bot.observe(MOVES[i % 3], move);
      }
    }
  });

  it('refuse une stratégie inconnue', () => {
    expect(() => createBot({ strategy: 'telepathe' })).toThrow();
  });

  it('rocky : penche vers la pierre', () => {
    const bot = createBot({ strategy: 'rocky', random: fixed(0.3) });
    expect(bot.pick()).toBe('rock');
  });

  it('mirror : rejoue le dernier coup du joueur', () => {
    const bot = createBot({ strategy: 'mirror', noise: 0, random: fixed(0.5) });
    bot.observe('paper', 'rock');
    expect(bot.pick()).toBe('paper');
  });

  it('cycle : pierre → feuille → ciseaux', () => {
    const bot = createBot({ strategy: 'cycle', noise: 0, random: fixed(0.5) });
    bot.observe('rock', 'rock');
    expect(bot.pick()).toBe('paper');
    bot.observe('rock', 'paper');
    expect(bot.pick()).toBe('scissors');
  });

  it('counterLast : joue ce qui bat le dernier coup du joueur', () => {
    const bot = createBot({ strategy: 'counterLast', noise: 0, random: fixed(0.5) });
    bot.observe('scissors', 'paper');
    expect(bot.pick()).toBe('rock');
  });

  it('markov : contre un joueur prévisible', () => {
    const bot = createBot({ strategy: 'markov', noise: 0, random: fixed(0.5) });
    for (let i = 0; i < 6; i++) bot.observe('rock');
    expect(bot.pick()).toBe('paper');
  });

  it('markov : apprend les enchaînements', () => {
    const bot = createBot({ strategy: 'markov', noise: 0, random: fixed(0.5) });
    // Le joueur alterne pierre -> ciseaux ; dernier coup ciseaux, donc pierre attendue
    for (let i = 0; i < 8; i++) bot.observe(i % 2 === 0 ? 'rock' : 'scissors');
    expect(bot.pick()).toBe('paper');
  });

  it("meta : repère un joueur qui joue ce qui bat le dernier coup de l'IA", () => {
    const bot = createBot({ strategy: 'meta', noise: 0, random: fixed(0.5) });
    const botMoves = ['rock', 'rock', 'scissors', 'paper', 'paper', 'rock', 'scissors', 'scissors'];
    let previousBot = 'paper';
    for (const botMove of botMoves) {
      bot.observe(counterOf(previousBot), botMove);
      previousBot = botMove;
    }
    // Le joueur va jouer counterOf('scissors') = pierre : l'IA doit jouer feuille
    expect(bot.pick()).toBe('paper');
  });

  it("décide d'un Bouclier quand le joueur a la balle de match", () => {
    const state = { available: { shield: 1 }, playerScore: 1, botScore: 0, winsNeeded: 2 };
    expect(chooseBotBoost(state, fixed(0))).toBe('shield');
    expect(chooseBotBoost({ ...state, available: {} }, fixed(0))).toBeNull();
  });

  it("l'Espion ne désigne jamais le coup joué", () => {
    for (const move of MOVES) {
      for (const r of [0, 0.49, 0.51, 0.99]) expect(spyHint(move, fixed(r))).not.toBe(move);
    }
  });
});

describe('campagne', () => {
  it('débloque les îles une à une et sauvegarde', () => {
    const storage = memoryStorage();
    const progress = new CampaignProgress(CAMPAIGN, { storage });
    expect(progress.isUnlocked(CAMPAIGN[0].id)).toBe(true);
    expect(progress.isUnlocked(CAMPAIGN[1].id)).toBe(false);
    expect(progress.markCleared(CAMPAIGN[0].id)).toBe(true);
    expect(progress.markCleared(CAMPAIGN[0].id)).toBe(false);
    expect(progress.isUnlocked(CAMPAIGN[1].id)).toBe(true);
    const reloaded = new CampaignProgress(CAMPAIGN, { storage });
    expect(reloaded.isCleared(CAMPAIGN[0].id)).toBe(true);
    expect(reloaded.clearedCount).toBe(1);
  });

  it('enchaîne les adversaires', () => {
    expect(nextOpponent(CAMPAIGN[0].id)).toBe(CAMPAIGN[1]);
    expect(nextOpponent(CAMPAIGN.at(-1).id)).toBeNull();
    expect(new Set(CAMPAIGN.map((o) => o.id)).size).toBe(CAMPAIGN.length);
  });

  it('plafonne les gains quotidiens', () => {
    let now = new Date(2026, 9, 3, 12);
    const daily = new DailyRewards({ cap: 10, storage: memoryStorage(), now: () => now });
    expect(daily.grant(6)).toBe(6);
    expect(daily.grant(6)).toBe(4);
    expect(daily.grant(3)).toBe(0);
    expect(daily.remaining).toBe(0);
    now = new Date(2026, 9, 4, 9);
    expect(daily.remaining).toBe(10);
    expect(daily.grant(5)).toBe(5);
  });
});

describe('fairness', () => {
  it('SHA-256 de secours conforme aux vecteurs de test', () => {
    const enc = new TextEncoder();
    expect(sha256Fallback(enc.encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Fallback(enc.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const long = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(sha256Fallback(enc.encode(long))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('SHA-256 de secours identique à WebCrypto', async () => {
    const text = 'paper:0123456789abcdef — accents éàü';
    expect(sha256Fallback(new TextEncoder().encode(text))).toBe(await sha256Hex(text));
  });

  it('vérifie un engagement et détecte la triche', async () => {
    const commitment = await createCommitment('scissors');
    expect(commitment.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyCommitment(commitment)).toBe(true);
    expect(await verifyCommitment({ ...commitment, move: 'rock' })).toBe(false);
  });

  it("scelle aussi l'atout de l'IA", async () => {
    const commitment = await createCommitment('rock', { boost: 'shield' });
    expect(await verifyCommitment(commitment)).toBe(true);
    expect(await verifyCommitment({ ...commitment, boost: null })).toBe(false);
  });

  it('tire des entiers dans la plage demandée', () => {
    for (let i = 0; i < 200; i++) {
      const n = secureRandomInt(3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(3);
    }
  });
});

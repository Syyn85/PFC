import { describe, expect, it } from 'vitest';
import { MOVES, counterOf, resolveRound, verdictFor } from '../src/game/rules.js';
import { Match, computeRoundRewards } from '../src/game/match.js';
import { createBot } from '../src/game/bot.js';
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
    expect(computeRoundRewards({ outcome: 'lose', streak: 0 }, rewards).total).toBe(0);
  });
});

describe('bot', () => {
  it('joue toujours un coup valide', () => {
    const bot = createBot({ strategy: 'random' });
    for (let i = 0; i < 50; i++) expect(MOVES).toContain(bot.pick());
  });

  it('contre un joueur prévisible (markov)', () => {
    const bot = createBot({ strategy: 'markov', explore: 0, random: () => 0.5 });
    for (let i = 0; i < 6; i++) bot.observe('rock');
    expect(bot.pick()).toBe('paper');
  });

  it('apprend les enchaînements', () => {
    const bot = createBot({ strategy: 'markov', explore: 0, random: () => 0.5 });
    // Le joueur alterne pierre -> ciseaux -> pierre -> ciseaux…
    for (let i = 0; i < 8; i++) bot.observe(i % 2 === 0 ? 'rock' : 'scissors');
    // Dernier coup observé : ciseaux, donc prochain coup prédit : pierre -> le bot joue feuille
    expect(bot.pick()).toBe('paper');
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

  it('tire des entiers dans la plage demandée', () => {
    for (let i = 0; i < 200; i++) {
      const n = secureRandomInt(3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(3);
    }
  });
});

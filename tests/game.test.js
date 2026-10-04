import { describe, expect, it } from 'vitest';
import { MOVES, counterOf, resolveRound, verdictFor } from '../src/game/rules.js';
import { Match, boostsFromDraft, computeRoundRewards, draftSize } from '../src/game/match.js';
import { chooseBotBoost, createBot, spyHint } from '../src/game/bot.js';
import { CampaignProgress, DailyRewards } from '../src/game/progress.js';
import { CAMPAIGN, nextOpponent } from '../src/game/opponents.js';
import { memoryStorage } from '../src/core/storage.js';
import { DemoWallet } from '../src/web3/wallet.js';
import { keyToBoost, keyToMove } from '../src/ui/keys.js';
import { DEFAULT_GLOVE, GLOVES, Wardrobe, findGlove } from '../src/game/cosmetics.js';
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

describe('atouts et séries', () => {
  it("l'Espion ne se cumule pas avec Bouclier ou Double sur la même manche", () => {
    const match = new Match({ winsNeeded: 3 });
    expect(match.canSpy('shield')).toBe(false);
    match.useSpy();
    expect(match.canArm('shield')).toBe(false);
    expect(match.canArm('double')).toBe(false);
    expect(() => match.playRound('rock', 'scissors', { playerBoost: 'double' })).toThrow();
    const round = match.playRound('rock', 'scissors');
    expect(round.spied).toBe(true);
    // Manche suivante : l'Espion est épuisé, mais Bouclier et Double redeviennent armables
    expect(match.canArm('shield')).toBe(true);
    expect(match.canSpy()).toBe(false);
  });

  it('choix des atouts avant le match : 1 en 2 manches gagnantes, 2 au-delà', () => {
    expect(draftSize(2)).toBe(1);
    expect(draftSize(3)).toBe(2);
    expect(boostsFromDraft(['spy'])).toEqual({ shield: 0, double: 0, spy: 1 });
    expect(boostsFromDraft(['shield', 'double'])).toEqual({ shield: 1, double: 1, spy: 0 });
    expect(() => boostsFromDraft(['laser'])).toThrow();
    const match = new Match({ winsNeeded: 2, playerBoosts: boostsFromDraft(['shield']) });
    expect(match.canArm('double')).toBe(false);
    expect(match.canSpy()).toBe(false);
  });

  it("la série se prolonge d'un match gagné au suivant et déclenche le bonus en 2 manches gagnantes", () => {
    const first = new Match({ winsNeeded: 2 });
    first.playRound('rock', 'scissors');
    first.playRound('rock', 'scissors');
    expect(first.streak).toBe(2);
    const second = new Match({ winsNeeded: 2, streak: first.streak });
    const round = second.playRound('paper', 'rock');
    expect(round.streak).toBe(3);
    const rewards = computeRoundRewards(round, CONFIG.rewards);
    expect(rewards.items.map((i) => i.label)).toContain('Série de 3');
  });
});

describe('clavier', () => {
  it('lit les chiffres par touche physique (AZERTY)', () => {
    expect(keyToMove({ code: 'Digit1', key: '&' })).toBe('rock');
    expect(keyToMove({ code: 'Digit2', key: 'é' })).toBe('paper');
    expect(keyToMove({ code: 'Digit3', key: '"' })).toBe('scissors');
    expect(keyToMove({ code: 'Numpad2', key: '2' })).toBe('paper');
  });

  it('accepte les initiales P, F, C et les atouts B, D, E', () => {
    expect(keyToMove({ code: 'KeyP', key: 'p' })).toBe('rock');
    expect(keyToMove({ code: 'KeyF', key: 'F' })).toBe('paper');
    expect(keyToMove({ code: 'KeyC', key: 'c' })).toBe('scissors');
    expect(keyToMove({ code: 'KeyX', key: 'x' })).toBeNull();
    expect(keyToBoost({ key: 'B' })).toBe('shield');
    expect(keyToBoost({ key: 'e' })).toBe('spy');
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

  it('résiste à une sauvegarde quotidienne corrompue', () => {
    for (const raw of ['null', '{}', '{"day":"2026-10-03","earned":"abc"}', 'pas du json']) {
      const storage = memoryStorage();
      storage.setItem('pfc:daily', raw);
      const daily = new DailyRewards({ cap: 10, storage, now: () => new Date(2026, 9, 3) });
      expect(daily.remaining).toBe(10);
      expect(daily.grant(4)).toBe(4);
    }
  });

  it('deux onglets partagent le même plafond', () => {
    const storage = memoryStorage();
    const now = () => new Date(2026, 9, 3, 12);
    const tabA = new DailyRewards({ cap: 10, storage, now });
    const tabB = new DailyRewards({ cap: 10, storage, now });
    expect(tabA.grant(6)).toBe(6);
    expect(tabB.grant(6)).toBe(4);
    expect(tabA.remaining).toBe(0);
  });

  it('deux onglets ne perdent ni îles ni bonus de première victoire', () => {
    const storage = memoryStorage();
    const tabA = new CampaignProgress(CAMPAIGN, { storage });
    const tabB = new CampaignProgress(CAMPAIGN, { storage });
    expect(tabA.markCleared('roc')).toBe(true);
    expect(tabB.markCleared('roc')).toBe(false); // bonus déjà versé dans l'autre onglet
    expect(tabB.markCleared('echo')).toBe(true);
    const reloaded = new CampaignProgress(CAMPAIGN, { storage });
    expect(reloaded.isCleared('roc') && reloaded.isCleared('echo')).toBe(true);
  });

  it("deux onglets ne s'écrasent pas leurs crédits", () => {
    const storage = memoryStorage();
    const tabA = new DemoWallet({ storage });
    const tabB = new DemoWallet({ storage });
    tabA.credit(10, 'a');
    tabB.credit(5, 'b');
    expect(tabB.balance).toBe(15);
    expect(new DemoWallet({ storage }).balance).toBe(15);
  });
});

describe('stockage indisponible ou plein', () => {
  const fullStorage = (initial = {}) => {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
  };
  const now = () => new Date(2026, 9, 3, 12);

  it('le plafond quotidien tient sans stockage', () => {
    const daily = new DailyRewards({ cap: 80, storage: null, now });
    let total = 0;
    for (let i = 0; i < 20; i++) total += daily.grant(12);
    expect(total).toBe(80);
    expect(daily.earnedToday).toBe(80);
  });

  it('le plafond quotidien tient quand le stockage est plein', () => {
    const daily = new DailyRewards({ cap: 80, storage: fullStorage(), now });
    let total = 0;
    for (let i = 0; i < 20; i++) total += daily.grant(12);
    expect(total).toBe(80);
  });

  it('le portefeuille ne perd aucun crédit quand le stockage est plein', () => {
    const saved = JSON.stringify({ balance: 5, history: [] });
    const wallet = new DemoWallet({ storage: fullStorage({ 'pfc:demo-wallet': saved }) });
    for (let i = 0; i < 20; i++) wallet.credit(12, 'manche');
    expect(wallet.balance).toBe(245);
  });

  it('le portefeuille fonctionne sans stockage', () => {
    const wallet = new DemoWallet({ storage: null });
    wallet.credit(10, 'a');
    wallet.credit(5, 'b');
    expect(wallet.balance).toBe(15);
  });

  it("la meilleure série d'un match perdu sans manche gagnée vaut 0", () => {
    const match = new Match({ winsNeeded: 2, streak: 4 });
    match.playRound('rock', 'paper');
    match.playRound('rock', 'paper');
    expect(match.bestStreak).toBe(0);
  });
});

describe('boutique de gants', () => {
  const progressWith = (...cleared) => ({ isCleared: (id) => cleared.includes(id) });
  const fundedWallet = (storage, amount) => {
    const wallet = new DemoWallet({ storage });
    wallet.credit(amount, 'test');
    return wallet;
  };

  it('catalogue cohérent : identifiants uniques, prix et palettes définis', () => {
    expect(new Set(GLOVES.map((g) => g.id)).size).toBe(GLOVES.length);
    expect(findGlove(DEFAULT_GLOVE).price).toBe(0);
    for (const glove of GLOVES) {
      expect(glove.price).toBeGreaterThanOrEqual(0);
      expect(typeof glove.palette).toBe('object');
    }
    expect(GLOVES.filter((g) => g.kind === 'trophy')).toHaveLength(CAMPAIGN.length);
  });

  it('dépense : refuse sans débiter si le solde ne suffit pas', () => {
    const wallet = fundedWallet(memoryStorage(), 100);
    expect(wallet.spend(150, 'trop cher')).toBe(false);
    expect(wallet.balance).toBe(100);
    expect(wallet.spend(60, 'ok')).toBe(true);
    expect(wallet.balance).toBe(40);
  });

  it('achète, équipe automatiquement et ne revend pas deux fois', () => {
    const storage = memoryStorage();
    const wallet = fundedWallet(storage, 400);
    const wardrobe = new Wardrobe({ storage, wallet });
    const progress = progressWith();
    expect(wardrobe.status('menthe', { progress, balance: wallet.balance })).toBe('buyable');
    expect(wardrobe.buy('menthe', progress)).toEqual({ ok: true });
    expect(wallet.balance).toBe(250);
    expect(wardrobe.equippedGlove(progress).id).toBe('menthe');
    expect(wardrobe.buy('menthe', progress)).toEqual({ ok: false, reason: 'owned' });
    expect(wallet.balance).toBe(250);
    expect(wardrobe.status('or', { progress, balance: wallet.balance })).toBe('tooExpensive');
    expect(wardrobe.buy('or', progress)).toEqual({ ok: false, reason: 'funds' });
    expect(wallet.owns('or')).toBe(false);
  });

  it("les trophées se gagnent en libérant l'île, pas en jetons", () => {
    const storage = memoryStorage();
    const wallet = fundedWallet(storage, 1000);
    const wardrobe = new Wardrobe({ storage, wallet });
    expect(wardrobe.status('trophee-roc', { progress: progressWith(), balance: 1000 })).toBe(
      'locked',
    );
    expect(wardrobe.buy('trophee-roc', progressWith())).toEqual({
      ok: false,
      reason: 'notForSale',
    });
    expect(wardrobe.equip('trophee-roc', progressWith())).toBe(false);
    expect(wardrobe.equip('trophee-roc', progressWith('roc'))).toBe(true);
    expect(wallet.balance).toBe(1000);
    // Sans l'île libérée (autre sauvegarde), on retombe sur le gant classique
    expect(wardrobe.equippedGlove(progressWith()).id).toBe(DEFAULT_GLOVE);
  });

  it('nomme les trophées en bon français', () => {
    const names = Object.fromEntries(
      GLOVES.filter((g) => g.kind === 'trophy').map((g) => [g.unlock, g.name]),
    );
    expect(names.roc).toBe('Gant du Roc');
    expect(names.echo).toBe('Gant d’Écho');
    expect(names.malin).toBe('Gant du Malin');
    expect(names.oracle).toBe('Gant de l’Oracle');
    expect(names.kitsune).toBe('Gant de Kitsune');
  });

  // Stockage partagé dont on peut simuler la saturation (quota atteint)
  const quotaStorage = (initial = {}) => {
    const data = new Map(Object.entries(initial));
    const storage = {
      full: false,
      data,
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => {
        if (storage.full) throw new Error('QuotaExceededError');
        data.set(key, String(value));
      },
    };
    return storage;
  };
  const tab = (storage) => {
    const wallet = new DemoWallet({ storage });
    return { wallet, wardrobe: new Wardrobe({ storage, wallet }) };
  };

  it('deux onglets partagent achats et solde', () => {
    const storage = memoryStorage();
    const progress = progressWith();
    fundedWallet(storage, 500);
    const tabA = tab(storage);
    const tabB = tab(storage);
    expect(tabA.wardrobe.buy('menthe', progress).ok).toBe(true);
    expect(tabB.wardrobe.buy('sakura', progress).ok).toBe(true);
    expect(tabB.wallet.balance).toBe(150);
    const reloaded = tab(storage).wardrobe;
    expect(reloaded.isOwned('menthe', progress) && reloaded.isOwned('sakura', progress)).toBe(true);
  });

  it('un gant acheté dans deux onglets à la fois n’est payé qu’une fois', () => {
    const storage = memoryStorage();
    const progress = progressWith();
    fundedWallet(storage, 500);
    const tabA = tab(storage);
    const tabB = tab(storage); // n'a pas encore vu l'achat de A
    expect(tabA.wardrobe.buy('menthe', progress).ok).toBe(true);
    expect(tabB.wardrobe.buy('menthe', progress)).toEqual({ ok: false, reason: 'owned' });
    expect(tab(storage).wallet.balance).toBe(350);
  });

  it('achat et débit vont ensemble, même si le stockage sature', () => {
    const storage = quotaStorage();
    const progress = progressWith();
    fundedWallet(storage, 500);
    const { wardrobe, wallet } = tab(storage);
    storage.full = true;
    expect(wardrobe.buy('menthe', progress)).toEqual({ ok: true });
    expect(wallet.balance).toBe(350); // la session continue normalement
    // Rechargement : ni payé sans gant, ni gant gratuit
    const reloaded = tab(storage);
    expect(reloaded.wallet.balance).toBe(500);
    expect(reloaded.wardrobe.isOwned('menthe', progress)).toBe(false);
    // Le stockage se libère : la prochaine écriture enregistre tout
    storage.full = false;
    wallet.credit(10, 'manche');
    const after = tab(storage);
    expect(after.wallet.balance).toBe(360);
    expect(after.wardrobe.isOwned('menthe', progress)).toBe(true);
  });

  it('les opérations non enregistrées sont rejouées sans écraser un autre onglet', () => {
    const storage = quotaStorage();
    const progress = progressWith();
    fundedWallet(storage, 500);
    const tabA = tab(storage);
    const tabB = tab(storage);
    storage.full = true;
    tabA.wallet.credit(10, 'a');
    tabA.wallet.credit(10, 'a');
    storage.full = false;
    expect(tabB.wardrobe.buy('menthe', progress).ok).toBe(true); // 500 - 150
    tabA.wallet.credit(5, 'a');
    const reloaded = tab(storage);
    expect(reloaded.wallet.balance).toBe(375);
    expect(reloaded.wallet.owns('menthe')).toBe(true);
  });

  it("reprend l'ancienne sauvegarde une fois, puis ignore ses écritures", () => {
    const legacy = JSON.stringify({ balance: 500, history: [], revision: 3 });
    const storage = quotaStorage({ 'pfc:demo-wallet': legacy });
    const { wardrobe, wallet } = tab(storage);
    expect(wallet.balance).toBe(500);
    expect(wardrobe.buy('or', progressWith()).ok).toBe(true);
    // Un onglet resté sur l'ancienne version réécrit son ancien solde
    storage.data.set('pfc:demo-wallet', JSON.stringify({ balance: 510, history: [] }));
    expect(tab(storage).wallet.balance).toBe(100);
  });

  it('le gant équipé ne revient pas en arrière quand le stockage est plein', () => {
    const storage = quotaStorage();
    const progress = progressWith('roc');
    const { wardrobe } = tab(storage);
    storage.full = true;
    expect(wardrobe.equip('trophee-roc', progress)).toBe(true);
    wardrobe.reload();
    expect(wardrobe.equippedGlove(progress).id).toBe('trophee-roc');
  });

  it('le solde reste juste quand le stockage est plein', () => {
    const data = new Map([['pfc:demo-wallet', JSON.stringify({ balance: 300, history: [] })]]);
    const storage = {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const wallet = new DemoWallet({ storage });
    expect(wallet.spend(200, 'achat')).toBe(true);
    expect(wallet.spend(200, 'achat')).toBe(false);
    wallet.credit(50, 'manche');
    expect(wallet.balance).toBe(150);
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

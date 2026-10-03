const $ = (selector) => document.querySelector(selector);
const KEY_TO_MOVE = { 1: 'rock', 2: 'paper', 3: 'scissors', p: 'rock', f: 'paper', c: 'scissors' };

/** Interface DOM superposée à la scène 3D. Ne contient aucune règle du jeu. */
export class Hud {
  constructor() {
    this.el = {
      loader: $('#loader'),
      title: $('#screen-title'),
      play: $('#play-btn'),
      formatPicker: $('#format-picker'),
      formats: [],
      hud: $('#hud'),
      scorePlayer: $('#score-player'),
      scoreBot: $('#score-bot'),
      roundLabel: $('#round-label'),
      pips: $('#pips'),
      streak: $('#streak'),
      fairPill: $('#fair-pill'),
      fairText: $('#fair-text'),
      fairPanel: $('#fair-panel'),
      fairHash: $('#fair-hash'),
      fairMove: $('#fair-move'),
      fairSalt: $('#fair-salt'),
      callout: $('#callout'),
      result: $('#round-result'),
      resultTitle: $('#result-title'),
      resultSub: $('#result-sub'),
      resultReward: $('#result-reward'),
      choices: $('#choices'),
      cards: [...document.querySelectorAll('.card')],
      end: $('#screen-end'),
      endCard: document.querySelector('.end-card'),
      endTitle: $('#end-title'),
      endSub: $('#end-sub'),
      endStats: $('#end-stats'),
      endReward: $('#end-reward'),
      again: $('#again-btn'),
      menu: $('#menu-btn'),
      wallet: $('#wallet-chip'),
      balance: $('#wallet-balance'),
      sound: $('#sound-toggle'),
      toast: $('#toast'),
    };
    this.handlers = {};
    this.choosing = false;
    this.#bind();
  }

  on(event, handler) {
    this.handlers[event] = handler;
    return this;
  }

  #emit(event, ...args) {
    this.handlers[event]?.(...args);
  }

  #bind() {
    const { el } = this;
    el.play.addEventListener('click', () => this.#emit('play'));
    el.again.addEventListener('click', () => this.#emit('again'));
    el.menu.addEventListener('click', () => this.#emit('menu'));
    el.wallet.addEventListener('click', () => this.#emit('wallet'));
    el.sound.addEventListener('click', () => this.#emit('sound'));
    for (const card of el.cards) {
      card.addEventListener(
        'click',
        () => this.choosing && this.#emit('choose', card.dataset.move),
      );
      card.addEventListener(
        'pointerenter',
        () => this.choosing && this.#emit('hover', card.dataset.move),
      );
    }
    el.fairPill.addEventListener('click', () => {
      const open = el.fairPanel.hidden;
      el.fairPanel.hidden = !open;
      el.fairPill.setAttribute('aria-expanded', String(open));
    });
    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const move = KEY_TO_MOVE[event.key.toLowerCase()];
      if (move && this.choosing) {
        event.preventDefault();
        this.#emit('choose', move);
      } else if (event.key === 'Enter' && !el.title.hidden) {
        event.preventDefault();
        this.#emit('play');
      }
    });
  }

  ready() {
    this.el.loader.classList.add('is-done');
  }

  setCardArt(icons) {
    for (const card of this.el.cards) {
      const img = card.querySelector('img');
      if (icons[card.dataset.move]) img.src = icons[card.dataset.move];
    }
  }

  /** Crée les boutons de format à partir de la configuration. */
  setFormats(formats) {
    this.el.formats = formats.map((format) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.format = format.id;
      chip.setAttribute('role', 'radio');
      const short = document.createElement('strong');
      short.textContent = format.short;
      const label = document.createElement('span');
      label.textContent = format.label;
      chip.append(short, label);
      chip.addEventListener('click', () => {
        this.setFormat(format.id);
        this.#emit('format', format.id);
      });
      return chip;
    });
    this.el.formatPicker.replaceChildren(...this.el.formats);
  }

  setFormat(formatId) {
    for (const chip of this.el.formats) {
      chip.setAttribute('aria-checked', String(chip.dataset.format === formatId));
    }
  }

  setSound(on) {
    this.el.sound.setAttribute('aria-pressed', String(on));
    this.el.sound.setAttribute('aria-label', on ? 'Son activé' : 'Son coupé');
  }

  setBalance(value, { bump = false } = {}) {
    this.el.balance.textContent = value.toLocaleString('fr-FR');
    if (bump) restartAnimation(this.el.wallet, 'is-bumped');
  }

  showTitle(visible) {
    this.el.title.hidden = !visible;
  }

  showHud(visible) {
    this.el.hud.hidden = !visible;
    if (!visible) {
      this.el.fairPanel.hidden = true;
      this.el.fairPill.setAttribute('aria-expanded', 'false');
    }
  }

  showChoices(visible) {
    this.choosing = visible;
    this.el.choices.hidden = !visible;
  }

  setScore(player, bot, { bumped = null } = {}) {
    this.el.scorePlayer.textContent = player;
    this.el.scoreBot.textContent = bot;
    if (bumped === 'player') restartAnimation(this.el.scorePlayer, 'is-bumped');
    if (bumped === 'bot') restartAnimation(this.el.scoreBot, 'is-bumped');
  }

  setRound(number, history = []) {
    this.el.roundLabel.textContent = `Manche ${number}`;
    this.el.pips.replaceChildren(
      ...history.map((round) => {
        const pip = document.createElement('span');
        pip.className = `pip is-${round.outcome}`;
        return pip;
      }),
    );
  }

  setStreak(streak) {
    this.el.streak.hidden = streak < 2;
    this.el.streak.textContent = `Série ×${streak}`;
  }

  /** state : { hash } avant révélation, puis { hash, move, salt, verified } */
  setFairness({ hash, move = null, salt = null, verified = null }) {
    const { el } = this;
    el.fairHash.textContent = hash;
    el.fairMove.textContent = move ?? 'en attente';
    el.fairSalt.textContent = salt ?? 'en attente';
    el.fairPill.classList.toggle('is-verified', verified === true);
    if (verified === null) el.fairText.textContent = `Coup de l'IA scellé · ${hash.slice(0, 6)}…`;
    else el.fairText.textContent = verified ? 'Équité vérifiée' : 'Échec de vérification !';
  }

  callout(text, { final = false } = {}) {
    const word = document.createElement('span');
    word.className = `callout-word${final ? ' is-final' : ''}`;
    word.textContent = text;
    this.el.callout.replaceChildren(word);
  }

  clearCallout() {
    this.el.callout.replaceChildren();
  }

  showRoundResult({ outcome, title, sub, reward }) {
    const { result, resultTitle, resultSub, resultReward } = this.el;
    result.className = `round-result is-${outcome}`;
    resultTitle.textContent = title;
    resultSub.textContent = sub;
    resultReward.hidden = !reward;
    resultReward.textContent = reward ?? '';
    result.hidden = false;
  }

  hideRoundResult() {
    this.el.result.hidden = true;
  }

  showEnd({ won, title, sub, stats, reward }) {
    const { end, endCard, endTitle, endSub, endStats, endReward } = this.el;
    endCard.classList.toggle('is-lose', !won);
    endTitle.textContent = title;
    endSub.textContent = sub;
    endStats.replaceChildren(
      ...stats.map(([label, value]) => {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        wrap.append(dt, dd);
        return wrap;
      }),
    );
    endReward.hidden = !reward;
    endReward.textContent = reward ?? '';
    end.hidden = false;
    this.el.again.focus({ preventScroll: true });
  }

  hideEnd() {
    this.el.end.hidden = true;
  }

  toast(message, duration = 3200) {
    const { toast } = this.el;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }
}

function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // force le redémarrage de l'animation CSS
  element.classList.add(className);
}

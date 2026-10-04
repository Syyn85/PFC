import { keyToBoost, keyToMove } from './keys.js';

const $ = (selector) => document.querySelector(selector);
const INTERACTIVE = 'button, a, input, select, textarea, summary, [tabindex]';
const BOOST_INFO = {
  shield: { label: 'Bouclier', text: 'Si tu perds la manche, ton adversaire ne marque pas.' },
  double: { label: 'Double', text: 'Si tu gagnes la manche, elle vaut 2 points.' },
  spy: { label: 'Espion', text: "Révèle un coup que l'adversaire n'a pas joué." },
};

const create = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Interface DOM superposée à la scène 3D. Ne contient aucune règle du jeu. */
export class Hud {
  constructor() {
    this.el = {
      loader: $('#loader'),
      title: $('#screen-title'),
      campaign: $('#campaign-btn'),
      campaignProgress: $('#campaign-progress'),
      vsMark: $('#vs-mark'),
      play: $('#play-btn'),
      formatPicker: $('#format-picker'),
      formats: [],
      shopButton: $('#shop-btn'),
      shop: $('#screen-shop'),
      shopBack: $('#shop-back'),
      shopBalance: $('#shop-balance'),
      shopList: $('#shop-list'),
      map: $('#screen-map'),
      mapBack: $('#map-back'),
      islands: $('#island-list'),
      hud: $('#hud'),
      scorePlayer: $('#score-player'),
      scoreBot: $('#score-bot'),
      botName: $('#bot-name'),
      roundLabel: $('#round-label'),
      pips: $('#pips'),
      streak: $('#streak'),
      botBoosts: $('#bot-boosts'),
      fairPill: $('#fair-pill'),
      fairText: $('#fair-text'),
      fairPanel: $('#fair-panel'),
      fairHash: $('#fair-hash'),
      fairMove: $('#fair-move'),
      fairBoost: $('#fair-boost'),
      fairSalt: $('#fair-salt'),
      fairPreimage: $('#fair-preimage'),
      bubble: $('#bubble'),
      bubbleName: $('#bubble-name'),
      bubbleText: $('#bubble-text'),
      callout: $('#callout'),
      versus: $('#versus'),
      versusIsland: $('#versus-island'),
      versusName: $('#versus-name'),
      versusTitle: $('#versus-title'),
      result: $('#round-result'),
      resultTitle: $('#result-title'),
      resultSub: $('#result-sub'),
      resultBoost: $('#result-boost'),
      resultReward: $('#result-reward'),
      choices: $('#choices'),
      prompt: $('#choices-prompt'),
      boosts: [...document.querySelectorAll('.boost')],
      timer: $('#timer'),
      timerFill: $('#timer-fill'),
      timerText: $('#timer-text'),
      srLog: $('#sr-log'),
      draft: $('#screen-draft'),
      draftIsland: $('#draft-island'),
      draftName: $('#draft-name'),
      draftTitle: $('#draft-title'),
      draftTags: $('#draft-tags'),
      draftCount: $('#draft-count'),
      draftOptions: $('#draft-options'),
      draftGo: $('#draft-go'),
      draftBack: $('#draft-back'),
      cards: [...document.querySelectorAll('.card')],
      end: $('#screen-end'),
      endCard: document.querySelector('.end-card'),
      endTitle: $('#end-title'),
      endSub: $('#end-sub'),
      endStats: $('#end-stats'),
      endBonus: $('#end-bonus'),
      endReward: $('#end-reward'),
      endNote: $('#end-note'),
      endHint: $('#end-hint'),
      next: $('#next-btn'),
      again: $('#again-btn'),
      menu: $('#menu-btn'),
      wallet: $('#wallet-chip'),
      balance: $('#wallet-balance'),
      sound: $('#sound-toggle'),
      music: $('#music-toggle'),
      toast: $('#toast'),
    };
    this.handlers = {};
    this.choosing = false;
    this.keyboardUser = false;
    this.draftSelection = [];
    this.draftSize = 1;
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
    const clicks = {
      campaign: 'openMap',
      play: 'quickMatch',
      shopButton: 'shopOpen',
      shopBack: 'shopClose',
      mapBack: 'closeMap',
      next: 'next',
      again: 'again',
      menu: 'menu',
      wallet: 'wallet',
      sound: 'sound',
      music: 'music',
    };
    for (const [key, event] of Object.entries(clicks)) {
      el[key].addEventListener('click', () => this.#emit(event));
    }
    // Boutique : action sur un gant, et essayage au survol ou au focus
    el.shopList.addEventListener('click', (event) => {
      // Les gants trop chers ou verrouillés restent cliquables (aria-disabled) : le
      // contrôleur explique ce qu'il manque
      const action = event.target.closest('.glove-action');
      if (action && !action.disabled) this.#emit('shopAction', action.dataset.id);
    });
    const preview = (event) => {
      const glove = event.target.closest?.('.glove');
      if (glove) this.#emit('shopPreview', glove.dataset.id);
    };
    el.shopList.addEventListener('pointerover', preview);
    el.shopList.addEventListener('focusin', preview);
    // Au doigt, le pointeur « quitte » la liste dès qu'on le lève : l'essayage reste alors
    // affiché jusqu'au prochain gant touché
    el.shopList.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') this.#emit('shopPreview', null);
    });
    el.islands.addEventListener('click', (event) => {
      const island = event.target.closest('.island');
      if (island && !island.disabled) this.#emit('island', island.dataset.id);
    });
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
    for (const boost of el.boosts) {
      boost.addEventListener(
        'click',
        () => this.choosing && this.#emit('boost', boost.dataset.boost),
      );
    }
    el.draftGo.addEventListener('click', () => {
      if (this.draftSelection.length === this.draftSize)
        this.#emit('draftConfirm', [...this.draftSelection]);
    });
    el.draftBack.addEventListener('click', () => this.#emit('draftCancel'));
    el.fairPill.addEventListener('click', () => {
      const open = el.fairPanel.hidden;
      el.fairPanel.hidden = !open;
      el.fairPill.setAttribute('aria-expanded', String(open));
    });
    // Mémorise le mode de saisie pour gérer le focus (clavier) sans gêner la souris
    window.addEventListener('pointerdown', () => (this.keyboardUser = false), true);
    window.addEventListener('keydown', (event) => {
      this.keyboardUser = true;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const move = this.choosing ? keyToMove(event) : null;
      const boost = this.choosing ? keyToBoost(event) : null;
      if (move) {
        event.preventDefault();
        this.#emit('choose', move);
      } else if (boost) {
        event.preventDefault();
        this.#emit('boost', boost);
      } else if (key === 'enter' && !el.title.hidden && !event.target.closest?.(INTERACTIVE)) {
        // Entrée « dans le vide » lance la campagne ; sur un bouton, on laisse le bouton agir
        event.preventDefault();
        this.#emit('openMap');
      } else if (key === 'escape' && !el.map.hidden) {
        event.preventDefault();
        this.#emit('closeMap');
      } else if (key === 'escape' && !el.draft.hidden) {
        event.preventDefault();
        this.#emit('draftCancel');
      } else if (key === 'escape' && !el.shop.hidden) {
        event.preventDefault();
        this.#emit('shopClose');
      }
    });
  }

  ready() {
    this.el.loader.classList.add('is-done');
  }

  /** Annonce un message aux lecteurs d'écran (région live toujours présente). */
  announce(text) {
    const { srLog } = this.el;
    srLog.textContent = '';
    requestAnimationFrame(() => (srLog.textContent = text));
  }

  // --- Barre du haut ---

  setSound(on) {
    this.el.sound.setAttribute('aria-pressed', String(on));
    this.el.sound.setAttribute(
      'aria-label',
      on ? 'Effets sonores activés' : 'Effets sonores coupés',
    );
  }

  setMusic(on) {
    this.el.music.setAttribute('aria-pressed', String(on));
    this.el.music.setAttribute('aria-label', on ? 'Musique activée' : 'Musique coupée');
  }

  setBalance(value, { bump = false } = {}) {
    this.el.balance.textContent = value.toLocaleString('fr-FR');
    if (bump) restartAnimation(this.el.wallet, 'is-bumped');
  }

  // --- Écran titre & carte ---

  showTitle(visible, { progress = '' } = {}) {
    this.el.title.hidden = !visible;
    this.el.campaignProgress.textContent = progress;
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
      const chip = create('button', 'chip');
      chip.type = 'button';
      chip.dataset.format = format.id;
      chip.setAttribute('role', 'radio');
      chip.append(create('strong', '', format.short), create('span', '', format.label));
      chip.addEventListener('click', () => {
        this.setFormat(format.id);
        this.#emit('format', format.id);
      });
      return chip;
    });
    this.el.formatPicker.replaceChildren(...this.el.formats);
    this.el.formatPicker.onkeydown = (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const chips = this.el.formats;
      const current = chips.findIndex((c) => c.getAttribute('aria-checked') === 'true');
      const next = chips[(current + step + chips.length) % chips.length];
      next.click();
      next.focus();
    };
  }

  setFormat(formatId) {
    for (const chip of this.el.formats) {
      const checked = chip.dataset.format === formatId;
      chip.setAttribute('aria-checked', String(checked));
      chip.tabIndex = checked ? 0 : -1;
    }
  }

  showMap(visible) {
    this.el.map.hidden = !visible;
    if (visible) {
      const target =
        this.el.islands.querySelector('.island.is-next') ??
        this.el.islands.querySelector('.island');
      target?.focus({ preventScroll: true });
    }
  }

  /** entries : [{ opponent, portrait, state: 'locked'|'open'|'cleared', isNext, lockedBy }] */
  renderMap(entries, { symbol }) {
    this.el.islands.replaceChildren(
      ...entries.map(({ opponent, portrait, state, isNext, lockedBy }) => {
        const li = create('li');
        const button = create('button', `island is-${state}${isNext ? ' is-next' : ''}`);
        button.type = 'button';
        button.dataset.id = opponent.id;
        button.disabled = state === 'locked';
        button.style.setProperty('--tone', opponent.palette.cuff ?? '#cdbbff');

        const img = create('img', 'island-portrait');
        img.alt = '';
        img.src = portrait;
        const tags = create('span', 'island-tags');
        tags.append(create('span', 'tag', `${opponent.winsNeeded} manches gagnantes`));
        if (opponent.timer) tags.append(create('span', 'tag', `Chrono ${opponent.timer} s`));
        const boosts = Object.entries(opponent.botBoosts)
          .filter(([, n]) => n > 0)
          .map(([kind]) => (kind === 'shield' ? 'Bouclier' : 'Double'));
        if (boosts.length) {
          tags.append(create('span', 'tag tag-boss', `Atouts : ${boosts.join(', ')}`));
        }

        const status = {
          locked: `Bats ${lockedBy} pour débloquer`,
          open: `Première victoire : +${opponent.firstClear} ${symbol}`,
          cleared: 'Île libérée ✓',
        }[state];

        button.append(
          img,
          create('span', 'island-num', `Île ${opponent.island}`),
          create('span', 'island-name', opponent.name),
          create('span', 'island-title', opponent.title),
          tags,
          create('span', 'island-status', status),
        );
        li.append(button);
        return li;
      }),
    );
  }

  // --- Boutique de gants ---

  showShop(visible) {
    this.el.shop.hidden = !visible;
    if (!visible) this.el.shopButton.focus({ preventScroll: true });
  }

  /**
   * entries : [{ glove, status, icon, missing }]
   * status : 'equipped' | 'owned' | 'buyable' | 'tooExpensive' | 'locked'
   * focusId : gant dont le bouton reprend le focus après une action.
   */
  renderShop(entries, { balance, symbol, focusId = null }) {
    const { el } = this;
    el.shopBalance.textContent = `Solde : ${balance.toLocaleString('fr-FR')} ${symbol}`;
    el.shopList.replaceChildren(
      ...entries.map(({ glove, status, icon, missing }) => {
        const item = create('li', `glove is-${status}`);
        item.dataset.id = glove.id;
        const art = create('img', 'glove-art');
        art.alt = '';
        art.src = icon;
        const info = create('div', 'glove-info');
        info.append(
          create('h3', 'glove-name', glove.name),
          create('p', 'glove-desc', glove.description),
        );
        if (glove.kind === 'trophy') info.append(create('span', 'tag', 'Trophée de campagne'));
        const action = create('button', 'btn glove-action');
        action.type = 'button';
        action.dataset.id = glove.id;
        const label = {
          equipped: 'Équipé',
          owned: 'Équiper',
          buyable: `Acheter · ${glove.price} ${symbol}`,
          tooExpensive: `${glove.price} ${symbol}`,
          locked: `Bats ${glove.unlockName}`,
        }[status];
        action.textContent = label;
        // Seul le gant équipé est vraiment désactivé : les autres restent atteignables au
        // clavier (Tab), pour les essayer et entendre pourquoi ils ne sont pas disponibles
        action.disabled = status === 'equipped';
        if (status === 'tooExpensive' || status === 'locked') {
          action.setAttribute('aria-disabled', 'true');
        }
        action.classList.add(status === 'buyable' ? 'btn-primary' : 'btn-ghost');
        action.setAttribute('aria-label', `${glove.name} : ${label}`);
        item.append(art, info, action);
        if (status === 'tooExpensive') {
          item.append(create('p', 'glove-missing', `Il te manque ${missing} ${symbol}`));
        }
        return item;
      }),
    );
    // Le rendu remplace la liste : on rend le focus au gant concerné
    if (!focusId) return;
    const item = el.shopList.querySelector(`.glove[data-id="${focusId}"]`);
    if (!item) return;
    const button = item.querySelector('.glove-action');
    if (button && !button.disabled) {
      button.focus({ preventScroll: true });
    } else {
      item.tabIndex = -1;
      item.focus({ preventScroll: true });
    }
    // Défilement de la liste seule (preventScroll évite de décaler toute la page)
    const box = el.shopList.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    if (rect.top < box.top) el.shopList.scrollTop += rect.top - box.top - 6;
    else if (rect.bottom > box.bottom) el.shopList.scrollTop += rect.bottom - box.bottom + 6;
  }

  /** Gant qui a le focus clavier dans la boutique (pour le lui rendre après un nouveau rendu). */
  focusedGlove() {
    const glove = document.activeElement?.closest?.('#shop-list .glove');
    return glove?.dataset.id ?? null;
  }

  // --- Choix des atouts avant le match ---

  /**
   * opts : { island, name, title, tags: string[], size, preselected: string[] }
   * La sélection est gérée ici ; seule la validation remonte au contrôleur.
   */
  showDraft({ island, name, title, tags, size, preselected = [] }) {
    const { el } = this;
    this.draftSize = size;
    this.draftSelection = preselected.slice(0, size);
    el.draftIsland.textContent = island;
    el.draftName.textContent = name;
    el.draftTitle.textContent = title;
    el.draftTags.replaceChildren(...tags.map((t) => create('span', 'tag', t)));
    el.draftCount.textContent =
      size > 1 ? `Choisis ${size} atouts pour ce match` : 'Choisis 1 atout pour ce match';
    el.draftOptions.replaceChildren(
      ...Object.entries(BOOST_INFO).map(([kind, info]) => {
        const option = create('button', `draft-option draft-${kind}`);
        option.type = 'button';
        option.dataset.boost = kind;
        const icon = create('span', 'boost-icon', kind === 'double' ? '×2' : '');
        icon.setAttribute('aria-hidden', 'true');
        option.append(
          icon,
          create('strong', 'draft-option-name', info.label),
          create('span', 'draft-option-text', info.text),
        );
        option.addEventListener('click', () => this.#toggleDraft(kind));
        return option;
      }),
    );
    this.#renderDraft();
    el.draft.hidden = false;
    // Sélection reprise du match précédent : un seul appui sur Entrée pour relancer
    const focusTarget =
      this.draftSelection.length === size
        ? el.draftGo
        : (el.draftOptions.querySelector('[aria-pressed="true"]') ?? el.draftOptions.firstChild);
    focusTarget?.focus({ preventScroll: true });
  }

  #toggleDraft(kind) {
    const selection = this.draftSelection;
    if (selection.includes(kind)) {
      if (this.draftSize === 1) return;
      this.draftSelection = selection.filter((k) => k !== kind);
    } else if (this.draftSize === 1) {
      this.draftSelection = [kind];
    } else if (selection.length < this.draftSize) {
      this.draftSelection = [...selection, kind];
    } else {
      // Sélection pleine : le plus ancien choix cède sa place
      this.draftSelection = [...selection.slice(1), kind];
    }
    this.#emit('draftToggle', kind);
    this.#renderDraft();
  }

  #renderDraft() {
    const { el } = this;
    for (const option of el.draftOptions.children) {
      option.setAttribute(
        'aria-pressed',
        String(this.draftSelection.includes(option.dataset.boost)),
      );
    }
    const ready = this.draftSelection.length === this.draftSize;
    el.draftGo.disabled = !ready;
    el.draftGo.textContent = ready
      ? 'Au combat !'
      : `Encore ${this.draftSize - this.draftSelection.length} à choisir`;
  }

  hideDraft() {
    this.el.draft.hidden = true;
  }

  // --- HUD de match ---

  showHud(visible) {
    this.el.hud.hidden = !visible;
    if (!visible) {
      this.el.fairPanel.hidden = true;
      this.el.fairPill.setAttribute('aria-expanded', 'false');
      this.hideBubble();
    }
  }

  setOpponentName(name) {
    this.el.botName.textContent = name;
  }

  /** Atouts de l'IA (montrés pour que le joueur puisse anticiper). */
  setBotBoosts(initial, remaining) {
    const kinds = Object.entries(initial).filter(([, n]) => n > 0);
    this.el.botBoosts.hidden = kinds.length === 0;
    if (!kinds.length) return;
    const icons = kinds.map(([kind]) => {
      const used = !(remaining[kind] > 0);
      const icon = create('span', `mini-boost is-${kind}${used ? ' is-used' : ''}`);
      const label = `${BOOST_INFO[kind].label} ${used ? 'utilisé' : 'disponible'}`;
      icon.title = label;
      icon.append(create('span', 'sr-only', label));
      return icon;
    });
    this.el.botBoosts.replaceChildren(create('span', '', 'Atouts IA'), ...icons);
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
        const kind = round.playerPoints > 0 ? 'win' : round.botPoints > 0 ? 'lose' : 'draw';
        return create('span', `pip is-${kind}`);
      }),
    );
  }

  setStreak(streak) {
    this.el.streak.hidden = streak < 2;
    this.el.streak.textContent = `Série ×${streak}`;
  }

  /**
   * state : { hash } avant révélation, puis { hash, move, boost, salt, verified, labels }
   * labels : { move: 'Pierre', boost: 'Bouclier' } pour l'affichage en français.
   */
  setFairness({ hash, move = null, boost = null, salt = null, verified = null, labels = {} }) {
    const { el } = this;
    const revealed = verified !== null;
    el.fairHash.textContent = hash;
    el.fairMove.textContent = revealed ? `${labels.move ?? move} (${move})` : 'en attente';
    el.fairBoost.textContent = revealed
      ? `${labels.boost ?? 'aucun'} (${boost ?? 'none'})`
      : 'en attente';
    el.fairSalt.textContent = salt ?? 'en attente';
    el.fairPreimage.textContent = revealed ? `${move}:${boost ?? 'none'}:${salt}` : 'en attente';
    el.fairPill.classList.toggle('is-verified', verified === true);
    if (verified === null) el.fairText.textContent = `Coup de l'IA scellé · ${hash.slice(0, 6)}…`;
    else el.fairText.textContent = verified ? 'Équité vérifiée' : 'Échec de vérification !';
  }

  /** Remet la pastille d'équité à zéro (début de match). */
  resetFairness() {
    const { el } = this;
    el.fairPill.classList.remove('is-verified');
    el.fairText.textContent = "Coup de l'IA scellé";
    for (const node of [el.fairHash, el.fairMove, el.fairBoost, el.fairSalt, el.fairPreimage]) {
      node.textContent = 'en attente';
    }
  }

  // --- Choix du coup ---

  showChoices(visible) {
    this.choosing = visible;
    this.el.choices.hidden = !visible;
    // Le VS décoratif n'est là que pendant le choix : il ne masque pas la révélation
    this.el.vsMark.hidden = !visible;
    // Au clavier, le focus doit rester utilisable d'une manche à l'autre
    if (visible && this.keyboardUser) this.el.cards[0].focus({ preventScroll: true });
  }

  /** Atouts emportés dans le match : les autres boutons sont masqués. */
  setBoostKinds(kinds) {
    for (const button of this.el.boosts) button.hidden = !kinds.includes(button.dataset.boost);
  }

  /**
   * state : { shield: {count, armed, available}, double: {…}, spy: {count, available} }
   * Un atout consommé est désactivé ; un atout seulement bloqué pour cette manche
   * (règle de non-cumul) reste cliquable pour que le jeu explique pourquoi.
   */
  setBoosts(state) {
    for (const button of this.el.boosts) {
      const info = state[button.dataset.boost];
      const used = !info || info.count <= 0;
      const blocked = !used && info.available === false;
      button.disabled = used;
      button.classList.toggle('is-blocked', blocked);
      if (blocked) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
      if (button.hasAttribute('aria-pressed')) {
        button.setAttribute('aria-pressed', String(Boolean(info?.armed)));
      }
    }
  }

  setPrompt(text) {
    this.el.prompt.textContent = text;
  }

  markExcluded(move) {
    for (const card of this.el.cards) {
      card.classList.toggle('is-excluded', card.dataset.move === move);
    }
  }

  /** fraction : 1 → 0 (et secondes restantes), ou null pour masquer le chronomètre. */
  setTimer(fraction, { urgent = false, seconds = null } = {}) {
    const { timer, timerFill, timerText } = this.el;
    timer.hidden = fraction === null;
    if (fraction === null) return;
    timerFill.style.transform = `scaleX(${Math.max(0, fraction)})`;
    timerText.textContent = seconds === null ? '' : `${seconds} s`;
    timer.classList.toggle('is-urgent', urgent);
  }

  // --- Annonces ---

  callout(text, { final = false } = {}) {
    this.el.callout.replaceChildren(
      create('span', `callout-word${final ? ' is-final' : ''}`, text),
    );
  }

  clearCallout() {
    this.el.callout.replaceChildren();
  }

  showVersus({ island, name, title }) {
    const { versus, versusIsland, versusName, versusTitle } = this.el;
    versusIsland.textContent = island;
    versusName.textContent = name;
    versusTitle.textContent = title;
    versus.hidden = false;
  }

  hideVersus() {
    this.el.versus.hidden = true;
  }

  showBubble(name, text) {
    const { bubble, bubbleName, bubbleText } = this.el;
    bubbleName.textContent = name;
    bubbleText.textContent = text;
    bubble.hidden = false;
  }

  /** Place la bulle au-dessus d'un point de l'écran, sans déborder. */
  positionBubble(x, y) {
    const { bubble } = this.el;
    const half = bubble.offsetWidth / 2 + 12;
    bubble.style.left = `${Math.min(Math.max(x, half), window.innerWidth - half)}px`;
    bubble.style.top = `${Math.max(y, bubble.offsetHeight + 70)}px`;
  }

  hideBubble() {
    this.el.bubble.hidden = true;
  }

  get bubbleVisible() {
    return !this.el.bubble.hidden;
  }

  showRoundResult({ outcome, title, sub, boostNote = null, boostSide = 'player', reward }) {
    const { result, resultTitle, resultSub, resultBoost, resultReward } = this.el;
    result.className = `round-result is-${outcome}`;
    resultTitle.textContent = title;
    resultSub.textContent = sub;
    resultBoost.hidden = !boostNote;
    resultBoost.textContent = boostNote ?? '';
    resultBoost.classList.toggle('is-bot', boostSide === 'bot');
    resultReward.hidden = !reward;
    resultReward.textContent = reward ?? '';
    result.hidden = false;
  }

  hideRoundResult() {
    this.el.result.hidden = true;
  }

  // --- Fin de match ---

  showEnd({ won, title, sub, stats, reward, bonus, note, hint, nextVisible, menuLabel }) {
    const { el } = this;
    el.hud.classList.add('is-ended');
    el.endCard.classList.toggle('is-lose', !won);
    el.endTitle.textContent = title;
    el.endSub.textContent = sub;
    el.endStats.replaceChildren(
      ...stats.map(([label, value]) => {
        const wrap = create('div');
        wrap.append(create('dt', '', label), create('dd', '', value));
        return wrap;
      }),
    );
    for (const [node, text] of [
      [el.endBonus, bonus],
      [el.endReward, reward],
      [el.endNote, note],
    ]) {
      node.hidden = !text;
      node.textContent = text ?? '';
    }
    el.endHint.hidden = !hint;
    el.endHint.replaceChildren();
    if (hint) el.endHint.append(create('strong', '', 'Indice : '), hint);
    el.next.hidden = !nextVisible;
    el.again.classList.toggle('btn-primary', !nextVisible);
    el.again.classList.toggle('btn-ghost', nextVisible);
    el.menu.textContent = menuLabel;
    el.end.hidden = false;
    (nextVisible ? el.next : el.again).focus({ preventScroll: true });
  }

  hideEnd() {
    this.el.end.hidden = true;
    this.el.hud.classList.remove('is-ended');
  }

  toast(message, duration = 3600) {
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

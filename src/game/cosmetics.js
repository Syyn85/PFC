import { readJSON, safeStorage, writeJSON } from '../core/storage.js';
import { CAMPAIGN } from './opponents.js';

/**
 * Gants cosmétiques : purement décoratifs, ils ne changent rien aux règles.
 *  - les gants de la boutique s'achètent avec les jetons (de démo pour l'instant) ;
 *  - les trophées s'obtiennent en libérant une île : ce sont les gants du gardien.
 * Aucun tirage au sort : chaque objet a un prix fixe et visible.
 */

export const DEFAULT_GLOVE = 'classique';

const SHOP = [
  {
    id: DEFAULT_GLOVE,
    name: 'Classique',
    description: 'Le gant des débuts, toujours fidèle.',
    price: 0,
    palette: {},
  },
  {
    id: 'menthe',
    name: 'Brise menthe',
    description: 'Frais comme une matinée sur les îles.',
    price: 150,
    palette: {
      glove: '#ecfff7',
      stitch: '#9fd9c2',
      cuff: '#3fe0c5',
      cuffLip: '#e0fff7',
      sleeve: '#1f9e8a',
      sleeveDark: '#14695c',
      accent: '#ffd23f',
    },
  },
  {
    id: 'sakura',
    name: 'Pétale de sakura',
    description: 'Cousu avec les fleurs des cerisiers de l’arène.',
    price: 200,
    palette: {
      glove: '#fff0f6',
      stitch: '#e7a9c2',
      cuff: '#ff8fbf',
      cuffLip: '#ffe3ef',
      sleeve: '#d9558f',
      sleeveDark: '#9c2f63',
      accent: '#fff4e4',
    },
  },
  {
    id: 'minuit',
    name: 'Minuit étoilé',
    description: 'Un gant sombre brodé d’or, pour les duels nocturnes.',
    price: 250,
    palette: {
      glove: '#3a3f73',
      stitch: '#ffd23f',
      cuff: '#ffd23f',
      cuffLip: '#fff1b0',
      sleeve: '#1b1f45',
      sleeveDark: '#0f122e',
      accent: '#ffd23f',
      glove_spec: 0.6,
    },
  },
  {
    id: 'braise',
    name: 'Braise volcanique',
    description: 'Taillé dans une roche encore tiède.',
    price: 300,
    palette: {
      glove: '#43323a',
      stitch: '#ff7a3d',
      cuff: '#ff5a2a',
      cuffLip: '#ffc29a',
      sleeve: '#2a1d24',
      sleeveDark: '#180f14',
      accent: '#ffb347',
      glove_spec: 0.4,
    },
  },
  {
    id: 'or',
    name: 'Gant d’or',
    description: 'Le plus brillant de la boutique. Aucun avantage, beaucoup d’éclat.',
    price: 400,
    palette: {
      glove: '#ffd75a',
      stitch: '#c48a12',
      cuff: '#fff1b0',
      cuffLip: '#ffffff',
      sleeve: '#b8860b',
      sleeveDark: '#7a5a06',
      accent: '#ffffff',
      glove_spec: 0.9,
    },
  },
].map((item) => ({ ...item, kind: 'shop' }));

// « Gant du Roc », « Gant de l’Oracle », « Gant d’Écho »… (élision et contraction)
function gloveOf(name) {
  if (name.startsWith('Le ')) return `Gant du ${name.slice(3)}`;
  if (/^L['’]/.test(name)) return `Gant de l’${name.slice(2)}`;
  if (/^[AEIOUYÉÈÊÀÂÎÔ]/i.test(name)) return `Gant d’${name}`;
  return `Gant de ${name}`;
}

// Trophées : les couleurs de chaque gardien, gagnées en libérant son île
const TROPHIES = CAMPAIGN.map((opponent) => ({
  id: `trophee-${opponent.id}`,
  kind: 'trophy',
  name: gloveOf(opponent.name),
  description: `Trophée de l’île ${opponent.island}.`,
  price: 0,
  unlock: opponent.id,
  unlockName: opponent.name,
  palette: opponent.palette,
}));

export const GLOVES = [...SHOP, ...TROPHIES];

export function findGlove(id) {
  return GLOVES.find((glove) => glove.id === id) ?? null;
}

/**
 * Garde-robe du joueur : gants possédés et gant équipé. Comme le reste des
 * sauvegardes, elle relit le stockage avant d'écrire (plusieurs onglets) et
 * garde un état en mémoire si le stockage est indisponible.
 */
export class Wardrobe {
  constructor({ storage = safeStorage(), key = 'pfc:wardrobe' } = {}) {
    this.storage = storage;
    this.key = key;
    this.owned = new Set([DEFAULT_GLOVE]);
    this.equipped = DEFAULT_GLOVE;
    this.reload();
  }

  reload() {
    const saved = readJSON(this.key, null, this.storage);
    if (Array.isArray(saved?.owned)) {
      for (const id of saved.owned) if (findGlove(id)?.kind === 'shop') this.owned.add(id);
    }
    if (typeof saved?.equipped === 'string' && findGlove(saved.equipped)) {
      this.equipped = saved.equipped;
    }
  }

  #save() {
    writeJSON(this.key, { owned: [...this.owned], equipped: this.equipped }, this.storage);
  }

  /** Possédé : acheté, ou trophée d'une île libérée (progress : CampaignProgress). */
  isOwned(id, progress) {
    const glove = findGlove(id);
    if (!glove) return false;
    if (glove.kind === 'trophy') return Boolean(progress?.isCleared(glove.unlock));
    return this.owned.has(id);
  }

  /** Gant équipé, retombant sur le classique s'il n'est plus valable (trophée non débloqué…). */
  equippedGlove(progress) {
    const glove = findGlove(this.equipped);
    return glove && this.isOwned(glove.id, progress) ? glove : findGlove(DEFAULT_GLOVE);
  }

  /**
   * État d'un gant pour la boutique :
   * 'equipped' | 'owned' | 'buyable' | 'tooExpensive' | 'locked'
   */
  status(id, { progress, balance }) {
    const glove = findGlove(id);
    if (this.equippedGlove(progress).id === id) return 'equipped';
    if (this.isOwned(id, progress)) return 'owned';
    if (glove.kind === 'trophy') return 'locked';
    return balance >= glove.price ? 'buyable' : 'tooExpensive';
  }

  /**
   * Achète un gant de la boutique. Retourne { ok, reason }.
   * reason : 'unknown' | 'owned' | 'notForSale' | 'funds'
   */
  buy(id, wallet, progress) {
    this.reload();
    const glove = findGlove(id);
    if (!glove) return { ok: false, reason: 'unknown' };
    if (this.isOwned(id, progress)) return { ok: false, reason: 'owned' };
    if (glove.kind !== 'shop') return { ok: false, reason: 'notForSale' };
    if (!wallet.spend(glove.price, `Achat : ${glove.name}`)) return { ok: false, reason: 'funds' };
    this.owned.add(id);
    this.equipped = id;
    this.#save();
    return { ok: true };
  }

  /** Équipe un gant possédé. Retourne false sinon. */
  equip(id, progress) {
    this.reload();
    if (!this.isOwned(id, progress)) return false;
    this.equipped = id;
    this.#save();
    return true;
  }
}

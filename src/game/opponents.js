/**
 * Les adversaires. La campagne "Le tour des îles" enchaîne six gardiens,
 * chacun avec une signature de jeu à percer, un ciel, des couleurs et des
 * répliques propres. Le "tell" est l'indice affiché après une défaite.
 */

export const QUICK_MATCH = {
  id: 'quick',
  pose: 'rock',
  name: 'Sparring',
  title: 'Partie rapide',
  island: null,
  strategy: 'markov',
  theme: 'crepuscule',
  timer: null,
  botBoosts: {},
  firstClear: 0,
  palette: {},
  tell: 'Le Sparring retient tes enchaînements : varie tes coups pour le surprendre.',
  lines: {
    intro: ['Prêt ? On s’échauffe !', 'Montre-moi ce que tu vaux.'],
    roundWin: ['Bien tenté !', 'Celle-là est pour moi.'],
    roundLose: ['Joli coup !', 'Pas mal du tout.'],
    matchWin: ['Bon match ! Une revanche ?'],
    matchLose: ['Bravo, tu m’as eu !'],
  },
};

export const CAMPAIGN = [
  {
    id: 'roc',
    pose: 'rock',
    name: 'Le Roc',
    title: "Gardien de l'Île de l'Aube",
    island: 1,
    strategy: 'rocky',
    winsNeeded: 2,
    theme: 'aube',
    timer: null,
    botBoosts: {},
    firstClear: 20,
    palette: {
      glove: '#efe4d6',
      cuff: '#ff9f43',
      cuffLip: '#ffe2c2',
      sleeve: '#7d7f9c',
      sleeveDark: '#56587a',
      accent: '#ff9f43',
    },
    tell: 'Le Roc a un faible pour la pierre… peut-être un peu trop.',
    lines: {
      intro: ['Rien ne brise la pierre. Rien !'],
      roundWin: ['Solide comme un roc !', 'Tu t’es cassé les doigts ?'],
      roundLose: ['Une fissure… rien de grave.', 'Grr… encore cette feuille !'],
      matchWin: ['La montagne ne bouge pas.'],
      matchLose: ['Tu m’as… effrité.'],
    },
  },
  {
    id: 'echo',
    pose: 'paper',
    name: 'Écho',
    title: "L'imitatrice de l'Île du Zénith",
    island: 2,
    strategy: 'mirror',
    winsNeeded: 2,
    theme: 'jour',
    timer: null,
    botBoosts: {},
    firstClear: 25,
    palette: {
      glove: '#f2fbff',
      cuff: '#3fe0c5',
      cuffLip: '#d9fff6',
      sleeve: '#2a9d8f',
      sleeveDark: '#1d6f66',
      accent: '#3fe0c5',
    },
    tell: 'Écho rejoue très souvent ton coup précédent.',
    lines: {
      intro: ['Ce que tu fais… je le refais !'],
      roundWin: ['Merci pour l’idée !', 'Joli coup… le mien.'],
      roundLose: ['Hé ! Tu as changé !', 'Pas juste, ça !'],
      matchWin: ['Copié, collé, gagné !'],
      matchLose: ['Je… n’ai plus d’idées.'],
    },
  },
  {
    id: 'rouage',
    pose: 'scissors',
    name: 'Rouage',
    title: "Automate de l'Île des Engrenages",
    island: 3,
    strategy: 'cycle',
    winsNeeded: 3,
    theme: 'orage',
    timer: 6,
    botBoosts: {},
    firstClear: 30,
    palette: {
      glove: '#f3e7d0',
      cuff: '#e0a050',
      cuffLip: '#ffe7b8',
      sleeve: '#7a5a3a',
      sleeveDark: '#4f3a26',
      accent: '#ffb84d',
      glove_spec: 0.7,
    },
    tell: 'Rouage tourne en boucle : pierre, puis feuille, puis ciseaux.',
    lines: {
      intro: ['Tic. Tac. Calcul en cours.'],
      roundWin: ['Résultat conforme.', 'Prévisible, humain.'],
      roundLose: ['Erreur 404 : victoire introuvable.', 'Recalibrage…'],
      matchWin: ['Programme exécuté.'],
      matchLose: ['Engrenages… grippés…'],
    },
  },
  {
    id: 'kitsune',
    pose: 'fox',
    name: 'Kitsune',
    title: "Renarde de l'Île de la Lune",
    island: 4,
    strategy: 'counterLast',
    winsNeeded: 3,
    theme: 'nuit',
    timer: 5,
    botBoosts: { shield: 1 },
    firstClear: 40,
    palette: {
      glove: '#fff6ec',
      cuff: '#ff7b3a',
      cuffLip: '#ffe0c7',
      sleeve: '#d9622b',
      sleeveDark: '#9c3f17',
      accent: '#ffd27a',
    },
    tell: 'Kitsune joue ce qui bat ton dernier coup. Anticipe-la !',
    lines: {
      intro: ['Je lis dans tes gestes, petit humain.'],
      roundWin: ['Hihi, trop facile.', 'Je l’avais senti venir.'],
      roundLose: ['Rusé… pour un humain.', 'Ma queue en frétille de rage !'],
      matchWin: ['La lune m’a soufflé tes coups.'],
      matchLose: ['Tu… m’as dupée ?!'],
    },
  },
  {
    id: 'malin',
    pose: 'point',
    name: 'Le Malin',
    title: "Stratège de l'Île du Crépuscule",
    island: 5,
    strategy: 'markov',
    winsNeeded: 3,
    theme: 'crepuscule',
    timer: 5,
    botBoosts: { shield: 1, double: 1 },
    firstClear: 50,
    palette: {
      glove: '#eef0e2',
      cuff: '#8bd450',
      cuffLip: '#e4ffd0',
      sleeve: '#5b3d8a',
      sleeveDark: '#3a2560',
      accent: '#8bd450',
    },
    tell: 'Le Malin retient tes enchaînements de coups : brise tes habitudes.',
    lines: {
      intro: ['Tes habitudes sont mes armes.'],
      roundWin: ['Exactement comme prévu.', 'Tu es un livre ouvert.'],
      roundLose: ['Intéressant…', 'Tu caches bien ton jeu.'],
      matchWin: ['Échec et mat.'],
      matchLose: ['Je n’avais pas prévu ça.'],
    },
  },
  {
    id: 'oracle',
    pose: 'paper',
    name: "L'Oracle",
    title: "Voyant de l'Île des Aurores",
    island: 6,
    strategy: 'meta',
    winsNeeded: 3,
    theme: 'aurore',
    timer: 4,
    botBoosts: { shield: 1, double: 1 },
    firstClear: 80,
    palette: {
      glove: '#fdfaf2',
      cuff: '#ffd23f',
      cuffLip: '#fff4c2',
      sleeve: '#3b2f7a',
      sleeveDark: '#251c55',
      accent: '#6ff0ff',
      glove_spec: 0.8,
    },
    tell: "L'Oracle teste plusieurs lectures de ton jeu et garde la meilleure. Sois imprévisible.",
    lines: {
      intro: ['J’ai déjà vu ce match. Tu perds.'],
      roundWin: ['Écrit dans les étoiles.', 'Je te l’avais dit.'],
      roundLose: ['Les étoiles… se brouillent.', 'Une vision imprévue.'],
      matchWin: ['Le destin s’accomplit.'],
      matchLose: ['Tu as réécrit le destin.'],
    },
  },
];

export function findOpponent(id) {
  return id === QUICK_MATCH.id ? QUICK_MATCH : (CAMPAIGN.find((o) => o.id === id) ?? null);
}

export function nextOpponent(id) {
  const index = CAMPAIGN.findIndex((o) => o.id === id);
  return index >= 0 ? (CAMPAIGN[index + 1] ?? null) : null;
}

export function pickLine(opponent, event, random = Math.random) {
  const lines = opponent.lines?.[event];
  if (!lines?.length) return null;
  return lines[Math.min(lines.length - 1, Math.floor(random() * lines.length))];
}

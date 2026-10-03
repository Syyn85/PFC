export const MOVES = Object.freeze(['rock', 'paper', 'scissors']);

export const MOVE_LABELS = Object.freeze({
  rock: 'Pierre',
  paper: 'Feuille',
  scissors: 'Ciseaux',
});

/** BEATS[a] = le coup que `a` bat. */
export const BEATS = Object.freeze({
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
});

const VERDICTS = Object.freeze({
  rock: 'La pierre écrase les ciseaux',
  paper: 'La feuille enveloppe la pierre',
  scissors: 'Les ciseaux coupent la feuille',
});

export function isMove(value) {
  return MOVES.includes(value);
}

/** Résultat du point de vue de `a` : 'win' | 'lose' | 'draw'. */
export function resolveRound(a, b) {
  if (!isMove(a) || !isMove(b)) throw new Error(`Coup invalide : ${a} / ${b}`);
  if (a === b) return 'draw';
  return BEATS[a] === b ? 'win' : 'lose';
}

/** Le coup qui bat `move`. */
export function counterOf(move) {
  return MOVES.find((m) => BEATS[m] === move);
}

/** Phrase expliquant pourquoi un coup l'emporte (null en cas d'égalité). */
export function verdictFor(a, b) {
  const outcome = resolveRound(a, b);
  if (outcome === 'draw') return null;
  return VERDICTS[outcome === 'win' ? a : b];
}

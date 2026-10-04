/**
 * Raccourcis clavier. Les chiffres sont lus par touche PHYSIQUE (event.code) :
 * sur un clavier AZERTY, la touche « 1 » produit « & » sans Maj.
 */
const CODE_TO_MOVE = {
  Digit1: 'rock',
  Numpad1: 'rock',
  Digit2: 'paper',
  Numpad2: 'paper',
  Digit3: 'scissors',
  Numpad3: 'scissors',
};
const KEY_TO_MOVE = { p: 'rock', f: 'paper', c: 'scissors', 1: 'rock', 2: 'paper', 3: 'scissors' };
const KEY_TO_BOOST = { b: 'shield', d: 'double', e: 'spy' };

export function keyToMove({ code, key = '' }) {
  return CODE_TO_MOVE[code] ?? KEY_TO_MOVE[key.toLowerCase()] ?? null;
}

export function keyToBoost({ key = '' }) {
  return KEY_TO_BOOST[key.toLowerCase()] ?? null;
}

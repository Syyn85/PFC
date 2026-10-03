/**
 * Équité vérifiable par engagement / révélation (commit-reveal).
 *
 * Avant que le joueur ne choisisse, l'adversaire choisit son coup et publie
 * uniquement l'empreinte SHA-256 de `coup:sel`. Une fois les coups dévoilés,
 * on révèle le sel : n'importe qui peut recalculer l'empreinte et constater
 * que l'adversaire n'a pas changé d'avis. C'est le même schéma qu'utilisera
 * le contrat on-chain pour des parties en JcJ.
 */

const encoder = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function randomHex(length = 16) {
  return toHex(randomBytes(length));
}

/** Entier uniforme dans [0, n) via le générateur cryptographique (sans biais modulo). */
export function secureRandomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}

/** Flottant uniforme dans [0, 1) via le générateur cryptographique. */
export function secureRandom() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

// --- SHA-256 de secours -------------------------------------------------------
// crypto.subtle n'existe que dans un contexte sécurisé (https / localhost).
// En test sur téléphone via http://192.168.x.x il faut donc une implémentation JS.

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function firstPrimes(count) {
  const primes = [];
  for (let n = 2; primes.length < count; n++) {
    if (primes.every((p) => n % p !== 0)) primes.push(n);
  }
  return primes;
}

const fracBits = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
const PRIMES = firstPrimes(64);
const K = Uint32Array.from(PRIMES, (p) => fracBits(Math.cbrt(p)));
const H0 = Uint32Array.from(PRIMES.slice(0, 8), (p) => fracBits(Math.sqrt(p)));

export function sha256Fallback(bytes) {
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const H = H0.slice();
  const W = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15];
      const w2 = W[i - 2];
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  return Array.from(H, (word) => word.toString(16).padStart(8, '0')).join('');
}

export async function sha256Hex(text) {
  const bytes = encoder.encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', bytes);
    return toHex(new Uint8Array(digest));
  }
  return sha256Fallback(bytes);
}

// L'atout éventuel de l'IA fait partie de l'engagement : il est lui aussi scellé.
const commitPayload = (move, boost, salt) => `${move}:${boost ?? 'none'}:${salt}`;

/** Crée un engagement : seul `hash` est montré avant la révélation. */
export async function createCommitment(move, { boost = null } = {}) {
  const salt = randomHex(16);
  const hash = await sha256Hex(commitPayload(move, boost, salt));
  return { move, boost, salt, hash };
}

export async function verifyCommitment({ hash, move, boost = null, salt }) {
  return (await sha256Hex(commitPayload(move, boost, salt))) === hash;
}

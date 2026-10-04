/**
 * Accès sûr au stockage local : en navigation privée, dans certains iframes ou
 * sous Node (tests), localStorage peut être absent ou lever une exception.
 */
export function safeStorage() {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Mémoire de secours (et stockage injectable dans les tests). */
export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

export function readJSON(key, fallback, storage = safeStorage()) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Écrit une valeur ; retourne false si le stockage est absent, plein ou bloqué. */
export function writeJSON(key, value, storage = safeStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // stockage plein ou bloqué : l'appelant garde la valeur en mémoire
  }
}

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

export function writeJSON(key, value, storage = safeStorage()) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage plein ou bloqué : la valeur reste en mémoire */
  }
}

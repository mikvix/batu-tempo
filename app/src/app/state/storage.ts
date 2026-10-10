/**
 * Lecture et écriture JSON dans le localStorage du navigateur.
 * Les anciennes versions (Capacitor Preferences) stockaient sous le préfixe « CapacitorStorage. » :
 * une donnée trouvée sous l'ancien nom est déplacée sous le nouveau à la première lecture.
 */
const LEGACY_PREFIX = 'CapacitorStorage.';

export function readJson<T>(key: string): T | null {
  try {
    let raw = localStorage.getItem(key);
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_PREFIX + key);
      if (raw !== null) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(LEGACY_PREFIX + key);
      }
    }
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage plein ou désactivé (navigation privée) : l'app continue sans persistance
  }
}

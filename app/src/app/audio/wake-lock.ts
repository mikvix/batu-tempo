/**
 * Garde l'écran allumé pendant la lecture (API Screen Wake Lock). Le navigateur relâche le verrou
 * quand la page passe en arrière-plan : on le redemande au retour si la lecture est toujours en cours.
 */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

export async function keepAwake(): Promise<void> {
  wanted = true;
  if (sentinel || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => (sentinel = null));
  } catch {
    // refusé (batterie faible, page cachée) : sans conséquence sur la lecture
  }
}

export function allowSleep(): void {
  wanted = false;
  void sentinel?.release().catch(() => undefined);
  sentinel = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible') void keepAwake();
  });
}

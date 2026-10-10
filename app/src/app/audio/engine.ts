/**
 * Un seul AudioContext pour toute l'app, créé au premier geste utilisateur
 * (les navigateurs et les WebViews refusent de démarrer l'audio sans interaction).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    // Sortie poussée fort, derrière un limiteur : au casque le niveau reste confortable sans que les
    // tutti (plusieurs instruments sur le même temps) ne saturent.
    master.gain.value = 1.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  return ctx;
}

export function getMaster(): GainNode {
  getAudioContext();
  return master as GainNode;
}

/** À appeler depuis un clic ou un tap : réveille le contexte s'il est suspendu. */
export async function ensureAudioReady(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state === 'suspended') {
    await c.resume();
  }
  return c;
}

export function setMasterVolume(v: number): void {
  getMaster().gain.value = Math.max(0, Math.min(1, v));
}

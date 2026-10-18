/**
 * Un seul AudioContext pour toute l'app, créé au premier geste utilisateur
 * (les navigateurs et les WebViews refusent de démarrer l'audio sans interaction).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Téléphone ou tablette : fil audio moins puissant, haut-parleur sans graves. */
const MOBILE =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && (navigator.hardwareConcurrency ?? 8) <= 8));

/** Choix explicite de l'utilisateur (réglage « audio léger »), null = automatique selon l'appareil. */
let liteOverride: boolean | null = null;

export function isMobileDevice(): boolean {
  return MOBILE;
}

export function setLiteAudio(value: boolean | null): void {
  liteOverride = value;
}

/**
 * Mode audio léger : moins de nœuds par coup (pas de salle, pas de saturation, moins de partiels),
 * pour que le fil audio d'un téléphone suive sans craquer.
 */
export function isLiteAudio(): boolean {
  return liteOverride ?? MOBILE;
}

export function getAudioContext(): AudioContext {
  if (!ctx) {
    // Sur mobile, un tampon de sortie plus large (« playback ») évite les craquements ; la latence
    // supplémentaire est connue du contexte (outputLatency) et compensée par l'app.
    ctx = new AudioContext({ latencyHint: MOBILE ? 'playback' : 'interactive' });
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

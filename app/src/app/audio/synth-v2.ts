import { Velocity, VoiceId } from '../data/types';
import { envelope, getNoise, noise, tone } from './synth-core';

/**
 * Deuxième jeu de sons, toujours 100 % synthétisé mais plus proche des instruments réels :
 *   - les peaux ont plusieurs partiels (le 2ᵉ mode d'une membrane est à ≈ 1,6 × le fondamental),
 *     un coup de mailloche (bruit grave très court) et une légère saturation qui épaissit le son ;
 *   - les cloches (agogô, gonguê, triangle) empilent des partiels inharmoniques aux durées
 *     différentes, au lieu d'une seule sinusoïde ;
 *   - la caixa a un timbre (fût + timbre métallique), le pandeiro des cymbalettes qui frisent ;
 *   - une petite réverbération commune donne un peu d'air, comme une salle de répétition.
 */

const VEL_GAIN: Record<Velocity, number> = { 0: 0, 1: 0.3, 2: 0.78, 3: 1 };
const VEL_DECAY: Record<Velocity, number> = { 0: 0, 1: 0.5, 2: 0.85, 3: 1 };

/** Courbe de saturation douce, partagée. */
let driveCurve: Float32Array<ArrayBuffer> | null = null;

function getDriveCurve(): Float32Array<ArrayBuffer> {
  if (!driveCurve) {
    const n = 1024;
    driveCurve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      driveCurve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8);
    }
  }
  return driveCurve;
}

/** Petite salle : réponse impulsionnelle synthétique (bruit décroissant), une par sortie. */
const rooms = new WeakMap<AudioNode, GainNode>();

function getRoom(ctx: AudioContext, out: AudioNode): GainNode {
  let send = rooms.get(out);
  if (send) return send;
  const seconds = 0.45;
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      // Décroissance exponentielle, un peu plus sombre vers la fin (moyenne glissante grossière).
      const env = Math.exp((-6 * i) / length);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    for (let i = 1; i < length; i++) data[i] = data[i] * 0.6 + data[i - 1] * 0.4;
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.9;
  send = ctx.createGain();
  send.gain.value = 1;
  send.connect(convolver);
  convolver.connect(wet);
  wet.connect(out);
  rooms.set(out, send);
  return send;
}

/** Sortie d'une voix : sèche vers `out`, plus une part vers la salle. */
function voiceOut(ctx: AudioContext, out: AudioNode, room: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = 1;
  g.connect(out);
  if (room > 0) {
    const s = ctx.createGain();
    s.gain.value = room;
    g.connect(s);
    s.connect(getRoom(ctx, out));
  }
  return g;
}

interface Partial {
  ratio: number;
  gain: number;
  decay: number;
  type?: OscillatorType;
}

interface HeadOpts {
  /** Fondamental au moment de l'impact, et après la descente de hauteur. */
  f0: number;
  f1: number;
  glide?: number;
  decay: number;
  peak: number;
  /** Partiels au-dessus du fondamental (rapport de fréquence, gain relatif, durée). */
  partials?: Partial[];
  /** Saturation douce de la membrane (0 = aucune). */
  drive?: number;
}

/** Peau frappée : fondamental qui descend, partiels, saturation douce. */
function head(ctx: AudioContext, out: AudioNode, t: number, o: HeadOpts): void {
  let dest: AudioNode = out;
  if (o.drive) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = getDriveCurve();
    const pre = ctx.createGain();
    pre.gain.value = 1 + o.drive;
    const post = ctx.createGain();
    post.gain.value = 1 / (1 + o.drive * 0.6);
    pre.connect(shaper);
    shaper.connect(post);
    post.connect(out);
    dest = pre;
  }
  tone(ctx, dest, t, { type: 'sine', f0: o.f0, f1: o.f1, glide: o.glide ?? 0.05, decay: o.decay, peak: o.peak });
  for (const p of o.partials ?? []) {
    tone(ctx, dest, t, { type: p.type ?? 'sine', f0: o.f0 * p.ratio, f1: o.f1 * p.ratio, glide: o.glide ?? 0.05, decay: p.decay, peak: o.peak * p.gain });
  }
}

/** Cloche : partiels inharmoniques fixes, chacun avec sa durée. */
function bell(ctx: AudioContext, out: AudioNode, t: number, f: number, peak: number, partials: Partial[]): void {
  for (const p of partials) {
    tone(ctx, out, t, { type: p.type ?? 'sine', f0: f * p.ratio, decay: p.decay, peak: peak * p.gain });
  }
}

/** Bruit avec attaque réglable (secoué, frisé) plutôt qu'un simple claquement. */
function shake(ctx: AudioContext, out: AudioNode, t: number, o: { freq: number; attack: number; decay: number; peak: number; q?: number; filter?: BiquadFilterType }): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'highpass';
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 0.7;
  const g = envelope(ctx, out, t, o.peak, o.decay, o.attack);
  src.connect(f);
  f.connect(g);
  src.start(t, Math.random() * 0.8);
  src.stop(t + o.attack + o.decay + 0.08);
}

export function playVoiceV2(ctx: AudioContext, out: AudioNode, voice: VoiceId, t: number, vel: Velocity, volume = 1): void {
  if (vel === 0 || volume <= 0) return;
  const v = VEL_GAIN[vel] * volume;
  const d = VEL_DECAY[vel];
  const accent = vel === 3;

  switch (voice) {
    case 'surdo1': {
      const o = voiceOut(ctx, out, 0.14);
      head(ctx, o, t, { f0: 105, f1: 58, glide: 0.07, decay: 0.8 * d, peak: 0.95 * v, drive: 0.8, partials: [{ ratio: 1.58, gain: 0.22, decay: 0.3 }, { ratio: 2.3, gain: 0.08, decay: 0.12 }] });
      noise(ctx, o, t, { filter: 'lowpass', freq: 420, decay: 0.045, peak: 0.55 * v });
      noise(ctx, o, t, { filter: 'bandpass', freq: 1800, q: 0.8, decay: 0.012, peak: 0.16 * v });
      break;
    }
    case 'surdo2': {
      const o = voiceOut(ctx, out, 0.14);
      head(ctx, o, t, { f0: 135, f1: 76, glide: 0.06, decay: 0.65 * d, peak: 0.9 * v, drive: 0.7, partials: [{ ratio: 1.58, gain: 0.22, decay: 0.26 }, { ratio: 2.3, gain: 0.08, decay: 0.1 }] });
      noise(ctx, o, t, { filter: 'lowpass', freq: 520, decay: 0.04, peak: 0.5 * v });
      noise(ctx, o, t, { filter: 'bandpass', freq: 2000, q: 0.8, decay: 0.012, peak: 0.16 * v });
      break;
    }
    case 'surdo3': {
      const o = voiceOut(ctx, out, 0.12);
      head(ctx, o, t, { f0: 170, f1: 96, glide: 0.05, decay: 0.45 * d, peak: 0.85 * v, drive: 0.6, partials: [{ ratio: 1.58, gain: 0.25, decay: 0.2 }, { ratio: 2.4, gain: 0.1, decay: 0.08 }] });
      noise(ctx, o, t, { filter: 'lowpass', freq: 700, decay: 0.035, peak: 0.45 * v });
      noise(ctx, o, t, { filter: 'bandpass', freq: 2400, q: 0.8, decay: 0.012, peak: 0.18 * v });
      break;
    }
    case 'alfaia': {
      // Peau de chèvre tendue à la corde : moins de sustain, plus de bruit de frappe.
      const o = voiceOut(ctx, out, 0.16);
      head(ctx, o, t, { f0: 115, f1: 64, glide: 0.05, decay: 0.5 * d, peak: 0.9 * v, drive: 0.9, partials: [{ ratio: 1.55, gain: 0.3, decay: 0.18 }, { ratio: 2.2, gain: 0.12, decay: 0.09 }] });
      noise(ctx, o, t, { filter: 'lowpass', freq: 1400, decay: 0.07, peak: 0.6 * v });
      break;
    }
    case 'caixa': {
      const o = voiceOut(ctx, out, 0.1);
      // Fût : deux modes courts ; timbre : bruit brillant un peu plus long, qui frise.
      tone(ctx, o, t, { type: 'triangle', f0: 190, f1: 170, glide: 0.02, decay: 0.07, peak: 0.32 * v });
      tone(ctx, o, t, { type: 'sine', f0: 335, f1: 300, glide: 0.02, decay: 0.05, peak: 0.18 * v });
      noise(ctx, o, t, { filter: 'highpass', freq: 2200, decay: 0.17 * d, peak: 0.75 * v });
      noise(ctx, o, t, { filter: 'bandpass', freq: 5600, q: 0.7, decay: 0.11 * d, peak: 0.5 * v });
      if (accent) {
        // Rim shot : attaque métallique en plus.
        tone(ctx, o, t, { type: 'square', f0: 1350, decay: 0.012, peak: 0.12 * v });
        noise(ctx, o, t, { filter: 'highpass', freq: 7000, decay: 0.05, peak: 0.3 * v });
      }
      break;
    }
    case 'repique': {
      // Mesuré sur un passage de repique seul : son bref et brillant. Partiels de membrane à ≈ 350,
      // 570, 760, 1230, 1460, 1750, 2030 Hz, tous à peu près au même niveau, et autant d'énergie en
      // bruit entre 2,5 et 5 kHz ; le fondamental s'éteint en 16 ms (−20 dB), les aigus en 40 ms,
      // tout est sous −30 dB après 100 ms. Les rebonds (ghost) sonnent pareil, moins fort.
      // (L'enveloppe atteint −80 dB à `decay` : −20 dB correspond à decay / 4.)
      const o = voiceOut(ctx, out, 0.1);
      const g = 0.22 * v;
      let dest: AudioNode = o;
      const shaper = ctx.createWaveShaper();
      shaper.curve = getDriveCurve();
      const pre = ctx.createGain();
      pre.gain.value = 1.4;
      const post = ctx.createGain();
      post.gain.value = 0.8;
      pre.connect(shaper);
      shaper.connect(post);
      post.connect(o);
      dest = pre;
      // Les partiels graves portent le corps « plastique » (triangle = harmoniques impaires qui
      // s'éteignent vite) ; les partiels aigus sont présents mais brefs et discrets, sinon le son
      // vire à la cloche. Chaque partiel descend légèrement en hauteur à l'attaque.
      tone(ctx, dest, t, { type: 'triangle', f0: 400, f1: 335, glide: 0.012, decay: 0.09 * d, peak: 1.1 * g });
      tone(ctx, dest, t, { type: 'sine', f0: 610, f1: 565, glide: 0.015, decay: 0.12 * d, peak: 0.8 * g });
      tone(ctx, dest, t, { type: 'sine', f0: 810, f1: 755, glide: 0.015, decay: 0.09 * d, peak: 0.7 * g });
      tone(ctx, dest, t, { type: 'sine', f0: 1230, decay: 0.07 * d, peak: 0.45 * g });
      tone(ctx, dest, t, { type: 'sine', f0: 1460, decay: 0.07 * d, peak: 0.3 * g });
      tone(ctx, dest, t, { type: 'sine', f0: 1750, decay: 0.06 * d, peak: 0.22 * g });
      tone(ctx, dest, t, { type: 'sine', f0: 2030, decay: 0.06 * d, peak: 0.15 * g });
      // Bruit de peau : médium-aigu plutôt que brillant, court.
      noise(ctx, o, t, { filter: 'bandpass', freq: 2600, q: 0.6, decay: 0.12 * d, peak: 0.45 * v });
      noise(ctx, o, t, { filter: 'bandpass', freq: 900, q: 1, decay: 0.05, peak: 0.3 * v });
      // Impact de la baguette : large bande, 5 ms.
      noise(ctx, o, t, { filter: 'lowpass', freq: 5000, decay: 0.005, peak: 0.5 * v });
      if (accent) noise(ctx, o, t, { filter: 'bandpass', freq: 3600, q: 1.5, decay: 0.04, peak: 0.25 * v });
      break;
    }
    case 'timbal': {
      const o = voiceOut(ctx, out, 0.14);
      if (vel === 1) {
        // Ghost = slap sec sur le bord.
        noise(ctx, o, t, { filter: 'bandpass', freq: 2600, q: 1.1, decay: 0.045, peak: 0.5 * volume });
        tone(ctx, o, t, { type: 'sine', f0: 420, f1: 300, glide: 0.02, decay: 0.05, peak: 0.25 * volume });
        break;
      }
      head(ctx, o, t, { f0: 300, f1: 195, glide: 0.035, decay: 0.34 * d, peak: 0.75 * v, drive: 0.5, partials: [{ ratio: 1.5, gain: 0.3, decay: 0.16 }, { ratio: 2.1, gain: 0.1, decay: 0.07 }] });
      noise(ctx, o, t, { filter: 'bandpass', freq: 1900, q: 1.2, decay: 0.06, peak: 0.3 * v });
      break;
    }
    case 'tamborim': {
      const o = voiceOut(ctx, out, 0.1);
      // Petit cadre très tendu : « tek » sec et aigu.
      tone(ctx, o, t, { type: 'square', f0: 840, f1: 700, glide: 0.02, decay: 0.04, peak: 0.2 * v });
      tone(ctx, o, t, { type: 'sine', f0: 1180, decay: 0.07, peak: 0.22 * v });
      noise(ctx, o, t, { filter: 'highpass', freq: 4200, decay: 0.045, peak: 0.5 * v });
      noise(ctx, o, t, { filter: 'bandpass', freq: 7500, q: 1, decay: 0.012, peak: 0.3 * v });
      break;
    }
    case 'agogo': {
      const o = voiceOut(ctx, out, 0.18);
      const f = accent ? 1230 : 820;
      bell(ctx, o, t, f, 0.5 * v, [
        { ratio: 1, gain: 1, decay: 0.5 },
        { ratio: 2.0, gain: 0.35, decay: 0.3 },
        { ratio: 2.74, gain: 0.3, decay: 0.26 },
        { ratio: 4.3, gain: 0.1, decay: 0.12 },
      ]);
      noise(ctx, o, t, { filter: 'bandpass', freq: 5000, q: 1, decay: 0.01, peak: 0.18 * v });
      break;
    }
    case 'gongue': {
      const o = voiceOut(ctx, out, 0.18);
      bell(ctx, o, t, 540, 0.55 * v, [
        { ratio: 1, gain: 1, decay: 0.65 },
        { ratio: 1.5, gain: 0.3, decay: 0.4 },
        { ratio: 2.4, gain: 0.25, decay: 0.3 },
        { ratio: 3.6, gain: 0.1, decay: 0.15 },
      ]);
      noise(ctx, o, t, { filter: 'bandpass', freq: 3500, q: 1, decay: 0.012, peak: 0.18 * v });
      break;
    }
    case 'chocalho': {
      const o = voiceOut(ctx, out, 0.08);
      // Secoué : les grains montent puis retombent, avec un petit rebond.
      shake(ctx, o, t, { freq: 6500, attack: 0.012, decay: accent ? 0.11 : 0.07, peak: 0.5 * v });
      shake(ctx, o, t + 0.018, { freq: 8000, attack: 0.008, decay: 0.04, peak: 0.25 * v });
      break;
    }
    case 'triangulo': {
      const o = voiceOut(ctx, out, 0.2);
      const open = accent;
      bell(ctx, o, t, 2630, 0.35 * v, [
        { ratio: 1, gain: 1, decay: open ? 0.7 : 0.08 },
        { ratio: 1.83, gain: 0.4, decay: open ? 0.45 : 0.06 },
        { ratio: 2.9, gain: 0.25, decay: open ? 0.3 : 0.04 },
        { ratio: 4.1, gain: 0.12, decay: open ? 0.2 : 0.03 },
      ]);
      noise(ctx, o, t, { filter: 'highpass', freq: 8000, decay: 0.025, peak: 0.25 * v });
      break;
    }
    case 'pandeiro': {
      const o = voiceOut(ctx, out, 0.12);
      head(ctx, o, t, { f0: 250, f1: 175, glide: 0.03, decay: 0.14 * d, peak: 0.45 * v, partials: [{ ratio: 1.6, gain: 0.25, decay: 0.06 }] });
      // Cymbalettes : attaque puis frisement.
      shake(ctx, o, t, { freq: 6000, attack: 0.004, decay: 0.12, peak: 0.45 * v });
      shake(ctx, o, t, { freq: 9000, attack: 0.02, decay: 0.2, peak: 0.18 * v, filter: 'bandpass', q: 1.5 });
      break;
    }
    case 'click':
    case 'bell':
      // Les repères du séquenceur gardent leur son d'origine.
      break;
  }
}

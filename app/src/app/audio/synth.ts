import { Velocity, VoiceId } from '../data/types';

/**
 * Tous les sons sont synthétisés (oscillateurs + bruit filtré) : aucun sample à charger,
 * aucune licence à gérer, et un démarrage instantané. On pourra remplacer chaque voix
 * par un vrai sample plus tard sans toucher au séquenceur.
 */

let noiseBuffer: AudioBuffer | null = null;
let noiseRate = 0;

function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseRate !== ctx.sampleRate) {
    const length = Math.floor(ctx.sampleRate * 1.5);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    noiseBuffer.copyToChannel(data, 0);
    noiseRate = ctx.sampleRate;
  }
  return noiseBuffer;
}

function envelope(ctx: AudioContext, out: AudioNode, t: number, peak: number, decay: number, attack = 0.002): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

interface ToneOpts {
  type: OscillatorType;
  f0: number;
  f1?: number;
  glide?: number;
  decay: number;
  peak: number;
}

function tone(ctx: AudioContext, out: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) {
    osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? 0.04));
  }
  const g = envelope(ctx, out, t, o.peak, o.decay);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + o.decay + 0.08);
}

interface NoiseOpts {
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  decay: number;
  peak: number;
}

function noise(ctx: AudioContext, out: AudioNode, t: number, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 0.8;
  const g = envelope(ctx, out, t, o.peak, o.decay, 0.001);
  src.connect(f);
  f.connect(g);
  src.start(t, Math.random() * 0.8);
  src.stop(t + o.decay + 0.08);
}

const VEL_GAIN: Record<Velocity, number> = { 0: 0, 1: 0.32, 2: 0.78, 3: 1 };
const VEL_DECAY: Record<Velocity, number> = { 0: 0, 1: 0.55, 2: 0.85, 3: 1 };

export function playVoice(ctx: AudioContext, out: AudioNode, voice: VoiceId, t: number, vel: Velocity, volume = 1): void {
  if (vel === 0 || volume <= 0) return;
  const v = VEL_GAIN[vel] * volume;
  const d = VEL_DECAY[vel];

  switch (voice) {
    case 'surdo1':
      tone(ctx, out, t, { type: 'sine', f0: 120, f1: 56, glide: 0.05, decay: 0.75 * d, peak: 1.0 * v });
      noise(ctx, out, t, { filter: 'lowpass', freq: 900, decay: 0.03, peak: 0.35 * v });
      break;
    case 'surdo2':
      tone(ctx, out, t, { type: 'sine', f0: 150, f1: 72, glide: 0.045, decay: 0.6 * d, peak: 0.95 * v });
      noise(ctx, out, t, { filter: 'lowpass', freq: 1000, decay: 0.03, peak: 0.3 * v });
      break;
    case 'surdo3':
      tone(ctx, out, t, { type: 'sine', f0: 190, f1: 92, glide: 0.04, decay: 0.45 * d, peak: 0.85 * v });
      noise(ctx, out, t, { filter: 'lowpass', freq: 1200, decay: 0.03, peak: 0.3 * v });
      break;
    case 'alfaia':
      tone(ctx, out, t, { type: 'sine', f0: 140, f1: 66, glide: 0.05, decay: 0.5 * d, peak: 0.95 * v });
      noise(ctx, out, t, { filter: 'lowpass', freq: 1600, decay: 0.06, peak: 0.5 * v });
      break;
    case 'caixa':
      noise(ctx, out, t, { filter: 'bandpass', freq: 2800, q: 0.6, decay: 0.16 * d, peak: 0.7 * v });
      noise(ctx, out, t, { filter: 'highpass', freq: 6000, decay: 0.09 * d, peak: 0.45 * v });
      tone(ctx, out, t, { type: 'triangle', f0: 210, f1: 165, glide: 0.03, decay: 0.07, peak: 0.3 * v });
      break;
    case 'repique':
      tone(ctx, out, t, { type: 'sine', f0: 460, f1: 270, glide: 0.025, decay: 0.2 * d, peak: 0.6 * v });
      noise(ctx, out, t, { filter: 'bandpass', freq: 2600, q: 0.9, decay: 0.1 * d, peak: 0.5 * v });
      break;
    case 'timbal':
      tone(ctx, out, t, { type: 'sine', f0: 320, f1: 205, glide: 0.03, decay: 0.28 * d, peak: 0.7 * v });
      noise(ctx, out, t, { filter: 'bandpass', freq: 1800, q: 1.2, decay: 0.06, peak: 0.3 * v });
      break;
    case 'tamborim':
      tone(ctx, out, t, { type: 'square', f0: 760, f1: 620, glide: 0.02, decay: 0.05, peak: 0.22 * v });
      noise(ctx, out, t, { filter: 'highpass', freq: 4200, decay: 0.045, peak: 0.5 * v });
      break;
    case 'agogo': {
      const f = vel === 3 ? 1230 : 820;
      tone(ctx, out, t, { type: 'sine', f0: f, decay: 0.32, peak: 0.45 * v });
      tone(ctx, out, t, { type: 'square', f0: f * 2.76, decay: 0.12, peak: 0.07 * v });
      break;
    }
    case 'gongue':
      tone(ctx, out, t, { type: 'triangle', f0: 540, decay: 0.42, peak: 0.5 * v });
      tone(ctx, out, t, { type: 'square', f0: 540 * 2.4, decay: 0.15, peak: 0.08 * v });
      break;
    case 'chocalho':
      noise(ctx, out, t, { filter: 'highpass', freq: 7000, decay: vel === 3 ? 0.1 : 0.06, peak: 0.5 * v });
      break;
    case 'triangulo':
      // Accent = triangle ouvert (longue résonance), frappe = étouffé.
      tone(ctx, out, t, { type: 'sine', f0: 2630, decay: vel === 3 ? 0.5 : 0.09, peak: 0.35 * v });
      tone(ctx, out, t, { type: 'sine', f0: 2630 * 1.83, decay: vel === 3 ? 0.3 : 0.06, peak: 0.12 * v });
      noise(ctx, out, t, { filter: 'highpass', freq: 8000, decay: 0.03, peak: 0.25 * v });
      break;
    case 'pandeiro':
      tone(ctx, out, t, { type: 'sine', f0: 260, f1: 180, glide: 0.03, decay: 0.12, peak: 0.45 * v });
      noise(ctx, out, t, { filter: 'highpass', freq: 5500, decay: 0.07, peak: 0.4 * v });
      break;
    case 'click':
      // Clic franc, audible au casque par-dessus un tambour : ton bref doublé d'un claquement.
      tone(ctx, out, t, { type: 'triangle', f0: vel === 3 ? 1650 : 1050, decay: 0.06, peak: 0.9 * v });
      noise(ctx, out, t, { filter: 'highpass', freq: 3000, decay: 0.02, peak: 0.6 * v });
      break;
    case 'bell':
      tone(ctx, out, t, { type: 'sine', f0: 1760, decay: 0.55, peak: 0.45 * v });
      tone(ctx, out, t, { type: 'sine', f0: 1760 * 2.5, decay: 0.2, peak: 0.1 * v });
      break;
  }
}

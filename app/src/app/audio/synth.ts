import { Velocity, VoiceId } from '../data/types';
import { getSoundSet } from './sound-set';
import { noise, tone } from './synth-core';
import { playVoiceV2 } from './synth-v2';

/**
 * Tous les sons sont synthétisés (oscillateurs + bruit filtré) : aucun sample à charger,
 * aucune licence à gérer, et un démarrage instantané. On pourra remplacer chaque voix
 * par un vrai sample plus tard sans toucher au séquenceur.
 */

const VEL_GAIN: Record<Velocity, number> = { 0: 0, 1: 0.32, 2: 0.78, 3: 1 };
const VEL_DECAY: Record<Velocity, number> = { 0: 0, 1: 0.55, 2: 0.85, 3: 1 };

export function playVoice(ctx: AudioContext, out: AudioNode, voice: VoiceId, t: number, vel: Velocity, volume = 1): void {
  if (vel === 0 || volume <= 0) return;
  // Jeu de sons « b » (synth-v2) pour les instruments ; clic et cloche de repère restent ici.
  if (getSoundSet() === 'b' && voice !== 'click' && voice !== 'bell') {
    playVoiceV2(ctx, out, voice, t, vel, volume);
    return;
  }
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

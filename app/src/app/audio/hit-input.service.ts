import { inject, Injectable, signal } from '@angular/core';

import { InputMode, SettingsService } from '../state/settings.service';
import { getAudioContext } from './engine';
import { MicService } from './mic.service';

/** Frappe prête à être jugée : instant corrigé sur l'horloge audio, comparable aux notes jouées. */
export interface Hit {
  time: number;
  strength: number;
  source: 'micro' | 'toucher';
}

/**
 * Instant de l'horloge audio correspondant au son entendu en ce moment (latence de sortie déduite).
 * C'est la bonne référence pour une frappe au toucher et pour l'animation des notes.
 */
export function heardNow(): number {
  const ctx = getAudioContext();
  // Estimation simple et toujours disponible : horloge audio moins les latences annoncées.
  const simple = ctx.currentTime - (ctx.outputLatency ?? 0) - ctx.baseLatency;
  // Estimation fine par horodatage de sortie, plus lisse entre deux blocs audio. Certains navigateurs
  // renvoient un horodatage figé : on ne la garde que si elle reste cohérente avec l'estimation simple.
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
    const fine = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    if (Math.abs(fine - simple) < 0.08) return fine;
  }
  return simple;
}

/**
 * Source unique des frappes pour les exercices : le micro (corrigé de la latence mesurée au réglage)
 * ou le toucher (pad à l'écran, barre d'espace). Les pages s'abonnent sans se soucier de l'origine.
 */
@Injectable({ providedIn: 'root' })
export class HitInput {
  private readonly mic = inject(MicService);
  private readonly settings = inject(SettingsService);
  private readonly listeners = new Set<(hit: Hit) => void>();
  private unsubscribeMic: (() => void) | null = null;
  /** Fenêtre de mesure du son de l'app repris par le micro, et seuil de force qui en découle. */
  private noise: { from: number; to: number; max: number } | null = null;
  private floor = 0;

  /** Mode réellement actif : le micro peut être refusé, on retombe alors sur le toucher. */
  readonly activeMode = signal<'micro' | 'toucher' | null>(null);

  /** Démarre la captation. `mode` force un mode pour cette session (sinon celui des réglages). */
  async start(mode?: InputMode): Promise<'micro' | 'toucher'> {
    const s = this.settings.settings();
    if ((mode ?? s.inputMode) === 'micro' && (await this.mic.start())) {
      this.mic.setSensitivity(s.micSensitivity);
      const latency = (s.micLatencyMs ?? 0) / 1000;
      this.noise = null;
      this.floor = 0;
      this.unsubscribeMic?.();
      this.unsubscribeMic = this.mic.onHit((raw) => this.fromMic(raw.time - latency, raw.strength));
      this.activeMode.set('micro');
      return 'micro';
    }
    this.activeMode.set('toucher');
    return 'toucher';
  }

  stop(): void {
    this.unsubscribeMic?.();
    this.unsubscribeMic = null;
    this.mic.stop();
    this.activeMode.set(null);
  }

  /**
   * Sans casque, le micro entend aussi le haut-parleur : clics et instruments de l'app tombent pile
   * sur les temps et passeraient pour des frappes parfaites. Pendant [from, to] (horloge audio), le
   * musicien ne joue pas ; on relève la force des sons captés, et les frappes plus faibles que ce
   * niveau sont ensuite ignorées. Au casque, rien n'est filtré.
   */
  measureNoise(from: number, to: number): void {
    // On s'arrête un peu avant la fin : une première frappe jouée en avance ne doit pas compter comme bruit.
    this.noise = { from, to: to - 0.15, max: 0 };
    this.floor = 0;
  }

  private fromMic(time: number, strength: number): void {
    const w = this.noise;
    if (w) {
      if (time <= w.to) {
        if (time >= w.from) w.max = Math.max(w.max, strength);
        return;
      }
      this.floor = this.settings.settings().headphones ? 0 : w.max * 1.6;
      this.noise = null;
    }
    if (strength < this.floor) return;
    this.emit({ time, strength, source: 'micro' });
  }

  /** Frappe au toucher : on date l'instant entendu, l'oreille et le doigt étant synchrones. */
  tap(): void {
    this.emit({ time: heardNow(), strength: 1, source: 'toucher' });
  }

  onHit(listener: (hit: Hit) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(hit: Hit): void {
    this.listeners.forEach((l) => l(hit));
  }
}

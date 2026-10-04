import { Injectable, signal } from '@angular/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

import { parsePattern, RhythmDef, Velocity, VoiceId } from '../data/types';
import { BarProvider, BarSpec, Sequencer } from './sequencer';

export function buildBarSpec(
  rhythm: RhythmDef,
  patterns: Record<string, string>,
  extra?: Partial<Omit<BarSpec, 'patterns' | 'voices'>>
): BarSpec {
  const parsed: Record<string, Velocity[]> = {};
  const voices: Record<string, VoiceId> = {};
  for (const inst of rhythm.instruments) {
    parsed[inst.id] = parsePattern(patterns[inst.id] ?? inst.pattern);
    voices[inst.id] = inst.voice;
  }
  return { patterns: parsed, voices, ...extra };
}

/**
 * Séquenceur unique pour toute l'app, exposé en signaux : la lecture continue quand on
 * change d'écran, et chaque page installe simplement son fournisseur de mesures.
 */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  readonly sequencer = new Sequencer();

  readonly playing = signal(false);
  readonly bpm = signal(this.sequencer.bpm);
  readonly step = signal(-1);
  readonly bar = signal(0);
  readonly spec = signal<BarSpec | null>(null);
  /** Incrémenté à chaque changement de mute / solo / volumes pour rafraîchir les vues. */
  readonly mix = signal(0);

  constructor() {
    this.sequencer.subscribe({
      onStep: (e) => {
        this.step.set(e.step);
        this.bar.set(e.bar);
        this.spec.set(e.spec);
        this.playing.set(true);
      },
      onBar: (bar, spec) => {
        this.bar.set(bar);
        this.spec.set(spec);
      },
      onStop: () => {
        this.playing.set(false);
        this.step.set(-1);
        void KeepAwake.allowSleep().catch(() => undefined);
      },
      onBpm: (bpm) => this.bpm.set(bpm),
    });
  }

  /** Installe le fournisseur de mesures d'une page ; pris en compte à la mesure suivante. */
  setProvider(provider: BarProvider): void {
    this.sequencer.setProvider(provider);
  }

  /** Tempo de départ d'une page : appliqué seulement si rien ne joue. */
  setBpmIfIdle(bpm: number): void {
    if (!this.sequencer.playing) {
      this.sequencer.setBpm(bpm);
      this.bpm.set(this.sequencer.bpm);
    }
  }

  async play(): Promise<void> {
    await this.sequencer.start();
    this.playing.set(true);
    this.step.set(-1);
    this.bar.set(0);
    // L'écran reste allumé pendant qu'on joue : une WebView suspendue coupe le son.
    void KeepAwake.keepAwake().catch(() => undefined);
  }

  stop(): void {
    this.sequencer.stop();
    this.playing.set(false);
    this.step.set(-1);
    void KeepAwake.allowSleep().catch(() => undefined);
  }

  toggle(): void {
    if (this.sequencer.playing) this.stop();
    else void this.play();
  }

  setBpm(bpm: number): void {
    this.sequencer.setBpm(bpm);
    this.bpm.set(this.sequencer.bpm);
  }

  toggleMute(id: string): void {
    this.sequencer.toggleMute(id);
    this.touchMix();
  }

  isAudible(id: string): boolean {
    this.mix();
    return this.sequencer.isAudible(id);
  }

  isMuted(id: string): boolean {
    this.mix();
    return this.sequencer.muted.has(id);
  }

  /** Modifie le mixage (mute, solo, volumes) et notifie les vues. */
  setMix(fn: (seq: Sequencer) => void): void {
    fn(this.sequencer);
    this.touchMix();
  }

  /** Remet le mixage par défaut : tout le monde joue, à plein volume. */
  resetMix(): void {
    this.setMix((seq) => {
      seq.mineId = null;
      seq.othersVolume = 1;
      seq.solo = null;
    });
  }

  private touchMix(): void {
    this.mix.update((v) => v + 1);
  }
}

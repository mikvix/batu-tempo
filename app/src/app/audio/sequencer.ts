import { STEPS_PER_BAR, Velocity, VoiceId } from '../data/types';
import { ensureAudioReady, getAudioContext, getMaster } from './engine';
import { playVoice } from './synth';

export interface BarSpec {
  /** instrumentId → vélocités (16 pas par mesure, éventuellement plusieurs mesures) */
  patterns: Record<string, Velocity[]>;
  voices: Record<string, VoiceId>;
  /**
   * Position de cette mesure dans la phrase du groove (0 = première mesure).
   * Un pattern de 2 mesures joue sa mesure `phase % 2` ; un pattern d'une mesure n'en tient pas compte.
   */
  phase?: number;
  /** Changement de tempo appliqué au début de cette mesure */
  bpm?: number;
  /** Mesure muette : le séquenceur avance mais ne joue rien (sauf le métronome si demandé) */
  silent?: boolean;
  /** Clic de métronome sur les noires (accent sur le 1) */
  click?: boolean;
  /** Son de cloche sur le 1 de la mesure */
  bell?: boolean;
  /** Étiquette libre, remontée à l'UI */
  label?: string;
}

/** Fournit la mesure n° barIndex ; null = fin de la séquence. */
export type BarProvider = (barIndex: number) => BarSpec | null;

export interface StepEvent {
  step: number;
  bar: number;
  spec: BarSpec;
}

export interface SequencerListener {
  onStep?: (e: StepEvent) => void;
  onBar?: (bar: number, spec: BarSpec) => void;
  onStop?: () => void;
  onBpm?: (bpm: number) => void;
}

/** Marge de planification : les notes sont envoyées au moteur audio 140 ms à l'avance. */
const LOOKAHEAD_S = 0.14;
const TICK_MS = 25;

/**
 * Séquenceur 16 pas à planification anticipée ("A tale of two clocks") :
 * un timer JS grossier déclenche l'envoi de notes datées précisément sur l'horloge audio.
 */
export class Sequencer {
  bpm = 96;
  playing = false;
  muted = new Set<string>();
  solo: string | null = null;
  volumes: Record<string, number> = {};
  /** Volume appliqué à tous les instruments sauf `mineId` (pour "groupe en fond") */
  othersVolume = 1;
  mineId: string | null = null;

  private provider: BarProvider = () => null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private spec: BarSpec | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: ReturnType<typeof setTimeout>[] = [];
  private listeners = new Set<SequencerListener>();

  subscribe(l: SequencerListener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  setProvider(p: BarProvider): void {
    this.provider = p;
  }

  setBpm(bpm: number): void {
    const clamped = Math.round(Math.max(40, Math.min(220, bpm)));
    if (clamped === this.bpm) return;
    this.bpm = clamped;
    this.listeners.forEach((l) => l.onBpm?.(clamped));
  }

  isAudible(id: string): boolean {
    if (this.solo) return this.solo === id;
    return !this.muted.has(id);
  }

  toggleMute(id: string): void {
    if (this.muted.has(id)) this.muted.delete(id);
    else this.muted.add(id);
  }

  async start(): Promise<void> {
    if (this.playing) return;
    const ctx = await ensureAudioReady();
    this.playing = true;
    this.step = 0;
    this.bar = 0;
    this.spec = null;
    this.nextTime = ctx.currentTime + 0.08;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.pending.forEach((p) => clearTimeout(p));
    this.pending = [];
    const wasPlaying = this.playing;
    this.playing = false;
    if (wasPlaying) this.listeners.forEach((l) => l.onStop?.());
  }

  private tick(): void {
    if (!this.playing) return;
    const ctx = getAudioContext();
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      if (this.step === 0) {
        const next = this.provider(this.bar);
        if (!next) {
          const wait = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
          this.pending.push(setTimeout(() => this.stop(), wait));
          return;
        }
        this.spec = next;
        if (next.bpm) this.setBpm(next.bpm);
        const bar = this.bar;
        this.defer(this.nextTime, () => this.listeners.forEach((l) => l.onBar?.(bar, next)));
      }
      this.scheduleStep(this.step, this.bar, this.spec as BarSpec, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step++;
      if (this.step === STEPS_PER_BAR) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private defer(time: number, fn: () => void): void {
    const ctx = getAudioContext();
    const wait = Math.max(0, (time - ctx.currentTime) * 1000);
    const handle = setTimeout(() => {
      this.pending = this.pending.filter((p) => p !== handle);
      if (this.playing) fn();
    }, wait);
    this.pending.push(handle);
  }

  private scheduleStep(step: number, bar: number, spec: BarSpec, t: number): void {
    const ctx = getAudioContext();
    const out = getMaster();
    if (!spec.silent) {
      const phaseOffset = (spec.phase ?? 0) * STEPS_PER_BAR;
      for (const id of Object.keys(spec.patterns)) {
        const pattern = spec.patterns[id];
        const vel = pattern[(phaseOffset + step) % pattern.length] ?? 0;
        if (vel === 0 || !this.isAudible(id)) continue;
        let vol = this.volumes[id] ?? 1;
        if (this.mineId && id !== this.mineId) vol *= this.othersVolume;
        playVoice(ctx, out, spec.voices[id], t, vel, vol);
      }
    }
    if (spec.click && step % 4 === 0) {
      playVoice(ctx, out, 'click', t, step === 0 ? 3 : 2, 0.8);
    }
    if (spec.bell && step === 0) {
      playVoice(ctx, out, 'bell', t, 3, 0.9);
    }
    this.defer(t, () => this.listeners.forEach((l) => l.onStep?.({ step, bar, spec })));
  }
}

import { Injectable, computed, signal } from '@angular/core';

import { RHYTHMS } from '../data/rhythms';
import { readJson, writeJson } from './storage';

export type InputMode = 'micro' | 'toucher';

export interface Settings {
  lastRhythmId: string;
  /** rhythmId → instrumentId */
  myInstrument: Record<string, string>;
  /** rhythmId → bpm choisi */
  bpm: Record<string, number>;
  grooveBars: number;
  /** Décalage total mesuré au réglage du micro (sortie + entrée), en ms. null = jamais réglé. */
  micLatencyMs: number | null;
  /** Sensibilité de la détection des frappes, de 1 (peu sensible) à 5 (très sensible). */
  micSensitivity: number;
  /** Écoute au casque : le micro n'entend que l'instrument, l'app peut jouer plus fort. */
  headphones: boolean;
  /** Comment les frappes sont captées dans les exercices guidés. */
  inputMode: InputMode;
}

const KEY = 'batu-tempo.settings.v1';

const DEFAULTS: Settings = {
  lastRhythmId: RHYTHMS[0].id,
  myInstrument: { 'samba-reggae': 'caixa' },
  bpm: {},
  grooveBars: 8,
  micLatencyMs: null,
  micSensitivity: 3,
  headphones: false,
  inputMode: 'micro',
};

/** Réglages persistés dans le localStorage du navigateur. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<Settings>({ ...DEFAULTS, ...(readJson<Partial<Settings>>(KEY) ?? {}) });

  readonly lastRhythmId = computed(() => this.settings().lastRhythmId);
  readonly grooveBars = computed(() => this.settings().grooveBars);

  update(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): void {
    const current = this.settings();
    const p = typeof patch === 'function' ? patch(current) : patch;
    const next = { ...current, ...p };
    this.settings.set(next);
    writeJson(KEY, next);
  }

  myInstrumentFor(rhythmId: string): string | undefined {
    return this.settings().myInstrument[rhythmId];
  }

  setMyInstrument(rhythmId: string, instrumentId: string): void {
    this.update((s) => ({ myInstrument: { ...s.myInstrument, [rhythmId]: instrumentId } }));
  }

  setBpm(rhythmId: string, bpm: number): void {
    this.update((s) => ({ bpm: { ...s.bpm, [rhythmId]: bpm } }));
  }
}

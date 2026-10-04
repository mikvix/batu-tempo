import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { RHYTHMS } from '../data/rhythms';

export interface Settings {
  lastRhythmId: string;
  /** rhythmId → instrumentId */
  myInstrument: Record<string, string>;
  /** rhythmId → bpm choisi */
  bpm: Record<string, number>;
  grooveBars: number;
}

const KEY = 'batu-tempo.settings.v1';

const DEFAULTS: Settings = {
  lastRhythmId: RHYTHMS[0].id,
  myInstrument: { 'samba-reggae': 'caixa' },
  bpm: {},
  grooveBars: 8,
};

/** Réglages persistés (Preferences de Capacitor : localStorage sur le web, stockage natif sur mobile). */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<Settings>(DEFAULTS);
  readonly loaded = signal(false);

  readonly lastRhythmId = computed(() => this.settings().lastRhythmId);
  readonly grooveBars = computed(() => this.settings().grooveBars);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: KEY });
      if (value) {
        this.settings.set({ ...DEFAULTS, ...(JSON.parse(value) as Partial<Settings>) });
      }
    } catch {
      // réglages par défaut
    }
    this.loaded.set(true);
  }

  update(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): void {
    const current = this.settings();
    const p = typeof patch === 'function' ? patch(current) : patch;
    const next = { ...current, ...p };
    this.settings.set(next);
    void Preferences.set({ key: KEY, value: JSON.stringify(next) });
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

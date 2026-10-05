import { computed, Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { sanitizeRhythm } from '../data/custom';
import { RHYTHMS } from '../data/rhythms';
import { RhythmDef } from '../data/types';

const KEY = 'batu-tempo.custom.v1';

/**
 * Tous les rythmes de l'app : ceux livrés dans rhythms.json, plus les rythmes personnels
 * créés dans l'éditeur ou importés par lien, stockés sur l'appareil.
 */
@Injectable({ providedIn: 'root' })
export class RhythmLibrary {
  readonly custom = signal<RhythmDef[]>([]);
  readonly builtin = RHYTHMS;
  readonly all = computed(() => [...this.custom(), ...RHYTHMS]);

  /** Chargé avant le démarrage de l'app (voir app.config.ts), pour que les liens directs fonctionnent. */
  async load(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: KEY });
      const list = value ? (JSON.parse(value) as unknown[]) : [];
      this.custom.set(list.map(sanitizeRhythm).filter((r): r is RhythmDef => r !== null));
    } catch {
      this.custom.set([]);
    }
  }

  get(id: string | undefined): RhythmDef {
    return this.custom().find((r) => r.id === id) ?? RHYTHMS.find((r) => r.id === id) ?? RHYTHMS[0];
  }

  find(id: string | undefined): RhythmDef | undefined {
    return this.custom().find((r) => r.id === id) ?? RHYTHMS.find((r) => r.id === id);
  }

  isCustom(id: string | undefined): boolean {
    return this.custom().some((r) => r.id === id);
  }

  save(rhythm: RhythmDef): void {
    const list = this.custom();
    const i = list.findIndex((r) => r.id === rhythm.id);
    const next = i >= 0 ? list.map((r, k) => (k === i ? rhythm : r)) : [rhythm, ...list];
    this.persist(next);
  }

  remove(id: string): void {
    this.persist(this.custom().filter((r) => r.id !== id));
  }

  private persist(list: RhythmDef[]): void {
    this.custom.set(list);
    void Preferences.set({ key: KEY, value: JSON.stringify(list) });
  }
}

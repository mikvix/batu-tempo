import { computed, Injectable, signal } from '@angular/core';

import { sanitizeRhythm } from '../data/custom';
import { RHYTHMS } from '../data/rhythms';
import { RhythmDef } from '../data/types';
import { readJson, writeJson } from './storage';

const KEY = 'batu-tempo.custom.v1';

function loadCustom(): RhythmDef[] {
  const list = readJson<unknown[]>(KEY);
  return Array.isArray(list) ? list.map(sanitizeRhythm).filter((r): r is RhythmDef => r !== null) : [];
}

/**
 * Tous les rythmes de l'app : ceux livrés dans rhythms.json, plus les rythmes personnels
 * créés dans l'éditeur ou importés par lien, stockés dans le navigateur.
 */
@Injectable({ providedIn: 'root' })
export class RhythmLibrary {
  /** Lu de façon synchrone à la création : un lien direct vers /rythme/perso-… trouve tout de suite son rythme. */
  readonly custom = signal<RhythmDef[]>(loadCustom());
  readonly builtin = RHYTHMS;
  readonly all = computed(() => [...this.custom(), ...RHYTHMS]);

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
    writeJson(KEY, list);
  }
}

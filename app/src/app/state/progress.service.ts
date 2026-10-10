import { computed, Injectable, signal } from '@angular/core';

import { readJson, writeJson } from './storage';

interface Progress {
  xp: number;
  /** Jours d'entraînement (AAAA-MM-JJ), les plus récents, pour la série. */
  days: string[];
  /** « rythme|instrument|étape » → meilleur nombre d'étoiles. */
  stars: Record<string, number>;
}

const KEY = 'batu-tempo.progress.v1';
export const XP_PER_LEVEL = 200;

function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Progression du parcours guidé : étoiles par étape, expérience, série de jours d'entraînement. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly data = signal<Progress>({ xp: 0, days: [], stars: {}, ...(readJson<Partial<Progress>>(KEY) ?? {}) });

  readonly xp = computed(() => this.data().xp);
  readonly level = computed(() => Math.floor(this.data().xp / XP_PER_LEVEL) + 1);
  readonly levelProgress = computed(() => this.data().xp % XP_PER_LEVEL);

  /** Jours consécutifs d'entraînement, en comptant aujourd'hui ou, à défaut, hier. */
  readonly streak = computed(() => {
    const days = new Set(this.data().days);
    let offset = days.has(today()) ? 0 : -1;
    let count = 0;
    while (days.has(today(offset))) {
      count++;
      offset--;
    }
    return count;
  });

  starsFor(rhythmId: string, instrumentId: string, stepId: string): number {
    return this.data().stars[`${rhythmId}|${instrumentId}|${stepId}`] ?? 0;
  }

  /** Enregistre une session terminée. Renvoie l'expérience gagnée. */
  record(session: { rhythmId: string; instrumentId: string; stepId?: string; stars: number; xp: number }): void {
    this.data.update((p) => {
      const stars = { ...p.stars };
      if (session.stepId) {
        const key = `${session.rhythmId}|${session.instrumentId}|${session.stepId}`;
        stars[key] = Math.max(stars[key] ?? 0, session.stars);
      }
      const days = p.days.includes(today()) ? p.days : [today(), ...p.days].slice(0, 60);
      const next = { xp: p.xp + session.xp, days, stars };
      writeJson(KEY, next);
      return next;
    });
  }
}

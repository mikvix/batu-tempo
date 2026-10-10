import { STEPS_PER_BAR, Velocity } from '../data/types';

/** Fenêtres de jugement, en secondes, autour de l'instant attendu. */
export const PERFECT_WINDOW = 0.05;
export const GOOD_WINDOW = 0.12;
/** Délai après la note au-delà duquel une note sans frappe est comptée ratée. */
export const MISS_AFTER = GOOD_WINDOW + 0.03;

export type TargetState = 'pending' | 'perfect' | 'good' | 'miss';

/** Une note que le musicien doit frapper. */
export interface Target {
  id: number;
  /** Instant attendu sur l'horloge audio, en secondes. */
  time: number;
  /** Mesure (numérotée depuis le début de la lecture) et pas dans la mesure (0 à 15). */
  bar: number;
  step: number;
  vel: Velocity;
  state: TargetState;
  /** Écart frappe − note, en secondes (négatif = en avance). */
  offset?: number;
}

/**
 * Notes à frapper sur les mesures [firstBar, firstBar + bars), pour un pattern éventuellement
 * multi-mesures. Les ghost notes (vélocité 1) sont exclues : trop douces pour être captées.
 */
export function buildTargets(
  pattern: Velocity[],
  startTime: number,
  sixteenth: number,
  firstBar: number,
  bars: number,
  phaseOfBar: (bar: number) => number = (bar) => bar - firstBar
): Target[] {
  const targets: Target[] = [];
  const len = Math.max(STEPS_PER_BAR, pattern.length);
  for (let bar = firstBar; bar < firstBar + bars; bar++) {
    const offset = (phaseOfBar(bar) * STEPS_PER_BAR) % len;
    for (let step = 0; step < STEPS_PER_BAR; step++) {
      const vel = pattern[(offset + step) % len] ?? 0;
      if (vel >= 2) {
        targets.push({ id: targets.length, time: startTime + (bar * STEPS_PER_BAR + step) * sixteenth, bar, step, vel: vel as Velocity, state: 'pending' });
      }
    }
  }
  return targets;
}

/**
 * Associe une frappe à la note en attente la plus proche dans la fenêtre « bien ». Renvoie la liste
 * mise à jour et le verdict, ou null si la frappe ne correspond à aucune note (frappe en trop).
 */
export function judgeHit(targets: Target[], time: number, window = GOOD_WINDOW): { targets: Target[]; target: Target } | null {
  let best: Target | null = null;
  for (const t of targets) {
    if (t.state !== 'pending') continue;
    const dt = Math.abs(time - t.time);
    if (dt <= window && (!best || dt < Math.abs(time - best.time))) best = t;
  }
  if (!best) return null;
  const offset = time - best.time;
  const judged: Target = { ...best, offset, state: Math.abs(offset) <= PERFECT_WINDOW ? 'perfect' : 'good' };
  return { targets: targets.map((t) => (t.id === judged.id ? judged : t)), target: judged };
}

/** Passe en « raté » les notes dépassées sans frappe. Renvoie null si rien n'a changé. */
export function expireTargets(targets: Target[], now: number, after = MISS_AFTER): { targets: Target[]; missed: number } | null {
  let missed = 0;
  const next = targets.map((t) => {
    if (t.state === 'pending' && now - t.time > after) {
      missed++;
      return { ...t, state: 'miss' as const };
    }
    return t;
  });
  return missed ? { targets: next, missed } : null;
}

export interface BeatStat {
  beat: number;
  meanMs: number;
  count: number;
}

export interface Summary {
  total: number;
  perfect: number;
  good: number;
  miss: number;
  /** Précision pondérée : parfait = 1, bien = 0,6. */
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  meanMs: number;
  perBeat: BeatStat[];
  tip: { title: string; text: string };
}

export function starsFor(accuracy: number): 0 | 1 | 2 | 3 {
  return accuracy >= 90 ? 3 : accuracy >= 75 ? 2 : accuracy >= 55 ? 1 : 0;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function summarize(targets: Target[]): Summary {
  const total = targets.length;
  const perfect = targets.filter((t) => t.state === 'perfect').length;
  const good = targets.filter((t) => t.state === 'good').length;
  const miss = total - perfect - good;
  const accuracy = total ? Math.round(((perfect + good * 0.6) / total) * 100) : 0;
  const hit = targets.filter((t) => t.offset !== undefined);
  const meanMs = Math.round(mean(hit.map((t) => (t.offset ?? 0) * 1000)));
  const perBeat: BeatStat[] = [0, 1, 2, 3].map((beat) => {
    const on = hit.filter((t) => Math.floor(t.step / 4) === beat);
    return { beat, meanMs: Math.round(mean(on.map((t) => (t.offset ?? 0) * 1000))), count: on.length };
  });
  return { total, perfect, good, miss, accuracy, stars: starsFor(accuracy), meanMs, perBeat, tip: tipFor(miss / Math.max(1, total), meanMs, perBeat) };
}

/** Un conseil, et un seul : le défaut le plus marquant de la session. */
function tipFor(missRate: number, meanMs: number, perBeat: BeatStat[]): { title: string; text: string } {
  if (missRate > 0.35) {
    return { title: 'Beaucoup de notes manquées', text: 'Baisse la vitesse d’un cran et compte les temps à voix haute : la régularité vient avant la vitesse.' };
  }
  if (meanMs < -25) {
    return { title: 'Tu joues en avance', text: 'Tu précipites la frappe. Écoute le surdo et laisse-le arriver avant de jouer.' };
  }
  if (meanMs > 25) {
    return { title: 'Tu joues en retard', text: 'Tu attends trop la note. Anticipe le geste : la baguette part avant le temps.' };
  }
  const worst = perBeat.filter((b) => b.count >= 2).sort((a, b) => Math.abs(b.meanMs) - Math.abs(a.meanMs))[0];
  if (worst && Math.abs(worst.meanMs) > 25) {
    const early = worst.meanMs < 0;
    return {
      title: `Tu ${early ? 'pousses' : 'traînes'} sur le temps ${worst.beat + 1}`,
      text: early
        ? `Tu arrives en avance sur le temps ${worst.beat + 1}. Compte « ${worst.beat + 1}-et » à voix haute pour laisser respirer ce passage.`
        : `Tu arrives en retard sur le temps ${worst.beat + 1}. Prépare le geste dès le temps précédent.`,
    };
  }
  return { title: 'Placement solide', text: 'Ton placement est régulier sur les quatre temps. Tu peux passer à la vitesse supérieure.' };
}

/** Points d'expérience gagnés pour une session. */
export function xpFor(stars: number): number {
  return stars > 0 ? 10 + stars * 15 : 5;
}

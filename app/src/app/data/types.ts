/** 0 = silence, 1 = ghost note, 2 = frappe normale, 3 = accent */
export type Velocity = 0 | 1 | 2 | 3;

export type VoiceId =
  | 'surdo1'
  | 'surdo2'
  | 'surdo3'
  | 'alfaia'
  | 'caixa'
  | 'repique'
  | 'timbal'
  | 'tamborim'
  | 'agogo'
  | 'gongue'
  | 'chocalho'
  | 'triangulo'
  | 'pandeiro'
  | 'click'
  | 'bell';

/** Résolution d'une mesure : 16 doubles-croches (4 temps). */
export const STEPS_PER_BAR = 16;

export interface PatternVariation {
  id: string;
  name: string;
  /**
   * Notation : X accent, x normal, o ghost, . silence. 16 pas par mesure, espaces et | ignorés.
   * Un pattern peut couvrir plusieurs mesures (32, 48, 64 pas…) : il boucle sur sa propre longueur.
   */
  pattern: string;
}

export interface InstrumentDef {
  id: string;
  name: string;
  /** Deux ou trois lettres pour la pastille */
  short: string;
  role: string;
  voice: VoiceId;
  pattern: string;
  /** Les mains sont affichées pour les instruments joués à la baguette alternée */
  showHands?: boolean;
  variations?: PatternVariation[];
}

export interface BreakDef {
  id: string;
  name: string;
  description: string;
  /** Une entrée par mesure : instrumentId → pattern. Un instrument absent se tait. */
  bars: Record<string, string>[];
}

export interface RhythmDef {
  id: string;
  name: string;
  origin: string;
  level: 1 | 2 | 3;
  bpm: number;
  bpmRange: [number, number];
  description: string;
  /** Pas par mesure. Seule la valeur 16 est gérée pour l'instant (porte ouverte aux métriques ternaires). */
  stepsPerBar?: number;
  instruments: InstrumentDef[];
  breaks: BreakDef[];
  /** Appel (call) lancé par un instrument avant un break ou une reprise */
  call?: { instrumentId: string; pattern: string };
}

export type ExerciseKind = 'break' | 'blind' | 'call' | 'tempo' | 'countdown';

export interface ExerciseDef {
  id: ExerciseKind;
  name: string;
  tagline: string;
  description: string;
  level: 1 | 2 | 3;
  tags: string[];
}

export function parsePattern(pattern: string): Velocity[] {
  const out: Velocity[] = [];
  for (const ch of pattern) {
    if (ch === 'X') out.push(3);
    else if (ch === 'x') out.push(2);
    else if (ch === 'o') out.push(1);
    else if (ch === '.' || ch === '-') out.push(0);
  }
  if (out.length === 0) return new Array<Velocity>(16).fill(0);
  if (out.length % 16 !== 0) {
    while (out.length % 16 !== 0) out.push(0);
  }
  return out;
}

export const SILENT_BAR = '................';

/** Nombre de mesures couvertes par un pattern déjà parsé. */
export function barsOf(pattern: Velocity[]): number {
  return Math.max(1, Math.ceil(pattern.length / STEPS_PER_BAR));
}

/** La tranche d'une mesure donnée d'un pattern (la mesure boucle si le pattern est plus court). */
export function barSlice(pattern: Velocity[], bar: number): Velocity[] {
  const b = ((bar % barsOf(pattern)) + barsOf(pattern)) % barsOf(pattern);
  return pattern.slice(b * STEPS_PER_BAR, (b + 1) * STEPS_PER_BAR);
}

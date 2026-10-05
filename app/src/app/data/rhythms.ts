import data from './rhythms.json';
import { barsOf, parsePattern, RhythmDef, SILENT_BAR } from './types';

export const VOICES = new Set([
  'surdo1',
  'surdo2',
  'surdo3',
  'alfaia',
  'caixa',
  'repique',
  'timbal',
  'tamborim',
  'agogo',
  'gongue',
  'chocalho',
  'triangulo',
  'pandeiro',
  'click',
  'bell',
]);

/**
 * Vérifie la cohérence du JSON au chargement (identifiants, voix connues, patterns de 16 pas)
 * et signale les erreurs en console pour faciliter l'édition du fichier.
 */
function validate(rhythms: RhythmDef[]): RhythmDef[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const r of rhythms) {
    if (ids.has(r.id)) problems.push(`rythme en double : ${r.id}`);
    ids.add(r.id);
    if (![1, 2, 3].includes(r.level)) problems.push(`${r.id} : level doit valoir 1, 2 ou 3`);
    if (r.stepsPerBar !== undefined && r.stepsPerBar !== 16) problems.push(`${r.id} : stepsPerBar ${r.stepsPerBar} non géré (16 seulement)`);
    const instIds = new Set(r.instruments.map((i) => i.id));
    for (const inst of r.instruments) {
      if (!VOICES.has(inst.voice)) problems.push(`${r.id}/${inst.id} : voix inconnue "${inst.voice}"`);
      if (parsePattern(inst.pattern).length % 16 !== 0) problems.push(`${r.id}/${inst.id} : pattern mal formé`);
      for (const v of inst.variations ?? []) {
        if (parsePattern(v.pattern).length % 16 !== 0) problems.push(`${r.id}/${inst.id}/${v.id} : pattern mal formé`);
      }
    }
    for (const b of r.breaks) {
      for (const bar of b.bars) {
        for (const id of Object.keys(bar)) {
          if (!instIds.has(id)) problems.push(`${r.id}/break ${b.id} : instrument inconnu "${id}"`);
        }
      }
    }
    if (r.call && !instIds.has(r.call.instrumentId)) problems.push(`${r.id} : appel sur un instrument inconnu`);
  }
  if (problems.length) console.warn('rhythms.json :\n' + problems.join('\n'));
  return rhythms;
}

const LEVEL_ORDER: Record<number, number> = { 1: 0, 2: 1, 3: 2 };

/** Tous les rythmes, triés par niveau (débutant → avancé), à ordre égal dans l'ordre du fichier. */
export const RHYTHMS: RhythmDef[] = validate(data.rhythms as unknown as RhythmDef[])
  .map((r, index) => ({ r, index }))
  .sort((a, b) => LEVEL_ORDER[a.r.level] - LEVEL_ORDER[b.r.level] || a.index - b.index)
  .map(({ r }) => r);

export const LEVELS: { level: 1 | 2 | 3; label: string }[] = [
  { level: 1, label: 'Débutant' },
  { level: 2, label: 'Intermédiaire' },
  { level: 3, label: 'Avancé' },
];

export function getRhythm(id: string | undefined): RhythmDef {
  return RHYTHMS.find((r) => r.id === id) ?? RHYTHMS[0];
}

export function getInstrument(rhythm: RhythmDef, instrumentId: string | undefined) {
  return rhythm.instruments.find((i) => i.id === instrumentId) ?? rhythm.instruments[0];
}

/** Le break d'un rythme sous forme de mesures complètes (tous les instruments renseignés). */
export function breakBars(rhythm: RhythmDef, breakId: string | undefined) {
  const brk = rhythm.breaks.find((b) => b.id === breakId) ?? rhythm.breaks[0];
  return brk.bars.map((bar) => {
    const full: Record<string, string> = {};
    for (const inst of rhythm.instruments) full[inst.id] = bar[inst.id] ?? SILENT_BAR;
    return full;
  });
}

export function grooveBar(rhythm: RhythmDef, overrides?: Record<string, string>) {
  const bar: Record<string, string> = {};
  for (const inst of rhythm.instruments) bar[inst.id] = overrides?.[inst.id] ?? inst.pattern;
  return bar;
}

/** Longueur de la phrase du groove en mesures : le plus long des patterns (1 pour la plupart des rythmes). */
export function grooveCycle(rhythm: RhythmDef, overrides?: Record<string, string>): number {
  let cycle = 1;
  for (const inst of rhythm.instruments) {
    cycle = Math.max(cycle, barsOf(parsePattern(overrides?.[inst.id] ?? inst.pattern)));
  }
  return cycle;
}

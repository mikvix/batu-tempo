import { VOICES } from './rhythms';
import { BreakDef, InstrumentDef, parsePattern, RhythmDef, STEPS_PER_BAR, Velocity, VoiceId } from './types';

/** Instruments proposés dans l'éditeur, avec leur son et un rôle par défaut. */
export const INSTRUMENT_PRESETS: { voice: VoiceId; name: string; short: string; role: string }[] = [
  { voice: 'surdo1', name: 'Surdo 1', short: 'S1', role: 'marcação' },
  { voice: 'surdo2', name: 'Surdo 2', short: 'S2', role: 'resposta' },
  { voice: 'surdo3', name: 'Surdo 3', short: 'S3', role: 'dobra' },
  { voice: 'alfaia', name: 'Alfaia', short: 'AL', role: 'grave' },
  { voice: 'caixa', name: 'Caixa', short: 'CX', role: 'tapis' },
  { voice: 'repique', name: 'Repique', short: 'RP', role: 'appels' },
  { voice: 'timbal', name: 'Timbal', short: 'TB', role: 'variations' },
  { voice: 'tamborim', name: 'Tamborim', short: 'TM', role: 'dessin' },
  { voice: 'agogo', name: 'Agogô', short: 'AG', role: 'clave' },
  { voice: 'gongue', name: 'Gonguê', short: 'GG', role: 'clave' },
  { voice: 'chocalho', name: 'Chocalho', short: 'CH', role: 'tapis' },
  { voice: 'triangulo', name: 'Triangle', short: 'TR', role: 'tapis' },
  { voice: 'pandeiro', name: 'Pandeiro', short: 'PD', role: 'tapis' },
];

const HAND_VOICES = new Set<VoiceId>(['caixa', 'repique']);
const MAX_BARS = 4;
const MAX_INSTRUMENTS = 16;

const SYMBOLS: Record<Velocity, string> = { 0: '.', 1: 'o', 2: 'x', 3: 'X' };

/** Vélocités → notation du JSON : espaces entre les temps, « | » entre les mesures. */
export function toPattern(cells: Velocity[]): string {
  const bars: string[] = [];
  for (let b = 0; b < cells.length; b += STEPS_PER_BAR) {
    const beats: string[] = [];
    for (let t = 0; t < STEPS_PER_BAR; t += 4) {
      beats.push(
        cells
          .slice(b + t, b + t + 4)
          .map((v) => SYMBOLS[v])
          .join('')
      );
    }
    bars.push(beats.join(' '));
  }
  return bars.join(' | ');
}

/** Ramène un pattern à exactement `bars` mesures, en le répétant ou en le coupant. */
export function fitCells(cells: Velocity[], bars: number): Velocity[] {
  const len = bars * STEPS_PER_BAR;
  const src = cells.length ? cells : new Array<Velocity>(STEPS_PER_BAR).fill(0);
  return Array.from({ length: len }, (_, i) => src[i % src.length]);
}

export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'rythme'
  );
}

export function newCustomId(name: string): string {
  return `perso-${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function shortFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const s = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '??').slice(0, 2);
  return s.toUpperCase();
}

/** Break par défaut : tout le monde sur les quatre temps, puis un seul coup sur le 1. */
export function defaultBreak(instruments: InstrumentDef[]): BreakDef {
  const bar1: Record<string, string> = {};
  const bar2: Record<string, string> = {};
  for (const inst of instruments) {
    bar1[inst.id] = 'X... X... X... X...';
    bar2[inst.id] = 'X... .... .... ....';
  }
  return { id: 'break', name: 'Paradinha', description: 'Tout le monde sur les quatre temps, puis un coup sur le 1.', bars: [bar1, bar2] };
}

function str(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : fallback;
}

function cleanPattern(v: unknown, maxBars: number): string | null {
  if (typeof v !== 'string') return null;
  const cells = parsePattern(v).slice(0, maxBars * STEPS_PER_BAR);
  return toPattern(cells);
}

/**
 * Valide et normalise un rythme venu de l'extérieur (lien partagé, stockage local).
 * Renvoie null si l'objet est inutilisable. Les rythmes personnels ont toujours un id « perso-… ».
 */
export function sanitizeRhythm(raw: unknown): RhythmDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r['name'], 60);
  if (!name) return null;

  let id = str(r['id'], 80);
  if (!/^[a-z0-9-]+$/.test(id)) id = newCustomId(name);
  if (!id.startsWith('perso-')) id = `perso-${id}`;

  const level = [1, 2, 3].includes(r['level'] as number) ? (r['level'] as 1 | 2 | 3) : 1;
  const bpm = Math.round(Math.min(220, Math.max(40, Number(r['bpm']) || 100)));

  const instruments: InstrumentDef[] = [];
  const usedIds = new Set<string>();
  for (const rawInst of Array.isArray(r['instruments']) ? r['instruments'].slice(0, MAX_INSTRUMENTS) : []) {
    if (!rawInst || typeof rawInst !== 'object') continue;
    const i = rawInst as Record<string, unknown>;
    const instName = str(i['name'], 30);
    const pattern = cleanPattern(i['pattern'], MAX_BARS);
    if (!instName || !pattern) continue;
    const voice = (VOICES.has(i['voice'] as string) && i['voice'] !== 'click' && i['voice'] !== 'bell' ? i['voice'] : 'caixa') as VoiceId;
    let instId = slugify(str(i['id'], 30) || instName);
    for (let n = 2; usedIds.has(instId); n++) instId = `${slugify(instName)}-${n}`;
    usedIds.add(instId);
    instruments.push({
      id: instId,
      name: instName,
      short: (str(i['short'], 3) || shortFor(instName)).toUpperCase(),
      role: str(i['role'], 30),
      voice,
      pattern,
      showHands: HAND_VOICES.has(voice) || i['showHands'] === true,
    });
  }
  if (!instruments.length) return null;

  const breaks: BreakDef[] = [];
  for (const rawBreak of Array.isArray(r['breaks']) ? r['breaks'].slice(0, 4) : []) {
    if (!rawBreak || typeof rawBreak !== 'object') continue;
    const b = rawBreak as Record<string, unknown>;
    const bars: Record<string, string>[] = [];
    for (const rawBar of Array.isArray(b['bars']) ? b['bars'].slice(0, MAX_BARS) : []) {
      if (!rawBar || typeof rawBar !== 'object') continue;
      const bar: Record<string, string> = {};
      for (const [instId, p] of Object.entries(rawBar as Record<string, unknown>)) {
        const clean = usedIds.has(instId) ? cleanPattern(p, 1) : null;
        if (clean) bar[instId] = clean;
      }
      bars.push(bar);
    }
    if (bars.length) {
      breaks.push({
        id: slugify(str(b['id'], 30) || 'break'),
        name: str(b['name'], 40) || 'Break',
        description: str(b['description'], 200),
        bars,
      });
    }
  }
  if (!breaks.length) breaks.push(defaultBreak(instruments));

  return {
    id,
    name,
    origin: str(r['origin'], 60) || 'Création',
    level,
    bpm,
    bpmRange: [Math.max(40, bpm - 20), Math.min(220, bpm + 20)],
    description: str(r['description'], 300),
    instruments,
    breaks,
  };
}

/** Version réduite d'un rythme pour le partage : champs utiles uniquement, patterns sans espaces. */
export function minifyRhythm(r: RhythmDef): unknown {
  const compact = (p: string) => p.replace(/\s+/g, '');
  return {
    v: 1,
    id: r.id,
    name: r.name,
    origin: r.origin,
    level: r.level,
    bpm: r.bpm,
    description: r.description || undefined,
    instruments: r.instruments.map((i) => ({ id: i.id, name: i.name, short: i.short, role: i.role || undefined, voice: i.voice, pattern: compact(i.pattern) })),
    breaks: r.breaks.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description || undefined,
      bars: b.bars.map((bar) => Object.fromEntries(Object.entries(bar).map(([k, p]) => [k, compact(p)]))),
    })),
  };
}

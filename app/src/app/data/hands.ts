import { InstrumentDef, Velocity, VoiceId } from './types';

/** Main qui frappe une case : droite, gauche, ou rien (silence, ou instrument sans doigté). */
export type Hand = 'D' | 'G' | '';

/** Instruments pour lesquels le doigté a un sens (deux mains ou baguette + main). */
export const HAND_VOICES = new Set<VoiceId>(['caixa', 'repique', 'alfaia', 'timbal', 'surdo1', 'surdo2', 'surdo3']);

/**
 * Notation du doigté : une lettre par case, parallèle au pattern. D = main droite, G = main
 * gauche (R et L acceptés), « . » ou « - » = non précisé ; espaces et « | » ignorés.
 */
export function parseHands(hands: string): Hand[] {
  const out: Hand[] = [];
  for (const ch of hands) {
    if (ch === 'D' || ch === 'R' || ch === 'd' || ch === 'r') out.push('D');
    else if (ch === 'G' || ch === 'L' || ch === 'g' || ch === 'l') out.push('G');
    else if (ch === '.' || ch === '-' || ch === 'x' || ch === 'X' || ch === 'o') out.push('');
  }
  return out;
}

/** Doigté → notation du JSON : espaces entre les temps, « | » entre les mesures. */
export function handsToString(hands: Hand[]): string {
  return hands
    .map((h, i) => {
      const sep = i === 0 ? '' : i % 16 === 0 ? ' | ' : i % 4 === 0 ? ' ' : '';
      return sep + (h || '.');
    })
    .join('');
}

/** L'instrument affiche-t-il un doigté ? Forcé par `showHands`, sinon selon la voix. */
export function showsHands(inst: Pick<InstrumentDef, 'voice' | 'showHands' | 'hands'>): boolean {
  return inst.showHands === true || HAND_VOICES.has(inst.voice) || !!inst.hands;
}

/**
 * Doigté par défaut d'une voix, quand le rythme n'en précise pas :
 *   - caixa, alfaia, timbal : mains alternées sur chaque frappe (frappe à frappe) ;
 *   - repique : baguette (D) sur les accents, main (G) sur le reste ;
 *   - surdos : mailloche (D) sur les frappes, main (G) sur les coups doux / étouffés.
 */
export function defaultHands(voice: VoiceId, pattern: Velocity[]): Hand[] {
  if (voice === 'repique') return pattern.map((v) => (v === 0 ? '' : v === 3 ? 'D' : 'G'));
  if (voice === 'surdo1' || voice === 'surdo2' || voice === 'surdo3') return pattern.map((v) => (v === 0 ? '' : v === 1 ? 'G' : 'D'));
  if (voice === 'caixa' || voice === 'alfaia' || voice === 'timbal') {
    let right = true;
    return pattern.map((v) => {
      if (v === 0) return '';
      const h: Hand = right ? 'D' : 'G';
      right = !right;
      return h;
    });
  }
  return pattern.map(() => '');
}

/**
 * Doigté effectif d'un pattern : les lettres précisées par le rythme (`hands`), complétées par le
 * doigté par défaut de la voix sur les cases laissées libres. Toujours de la longueur du pattern.
 */
export function handsFor(voice: VoiceId, pattern: Velocity[], explicit?: string | Hand[] | null): Hand[] {
  const base = defaultHands(voice, pattern);
  if (!explicit) return base;
  const given = typeof explicit === 'string' ? parseHands(explicit) : explicit;
  return pattern.map((v, i) => (v === 0 ? '' : given[i] || base[i]));
}

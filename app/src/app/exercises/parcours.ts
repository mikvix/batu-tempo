/** Les étapes du parcours guidé, jouées sur le rythme et l'instrument choisis. */
export type StepKind = 'jeu' | 'appel' | 'tempo';

export interface ParcoursStep {
  id: string;
  title: string;
  subtitle: string;
  kind: StepKind;
  /** Pour les jeux : vitesse en % du tempo du rythme, nombre de mesures, motif imposé. */
  speed?: number;
  bars?: number;
  /** « temps » = frapper les quatre temps au lieu du pattern de l'instrument. */
  motif?: 'temps';
}

export const PARCOURS: ParcoursStep[] = [
  { id: 'temps', title: 'Frapper les quatre temps', subtitle: 'Se caler sur la pulsation du groupe', kind: 'jeu', speed: 70, bars: 4, motif: 'temps' },
  { id: 'groove-70', title: 'Groove à 70 %', subtitle: 'Ta partie, au ralenti', kind: 'jeu', speed: 70, bars: 8 },
  { id: 'groove-85', title: 'Groove à 85 %', subtitle: 'On se rapproche du tempo', kind: 'jeu', speed: 85, bars: 8 },
  { id: 'appel', title: 'Répondre à l’appel', subtitle: 'Reproduire l’appel du repique', kind: 'appel' },
  { id: 'groove-100', title: 'Groove au tempo du groupe', subtitle: 'La vraie vitesse, 8 mesures', kind: 'jeu', speed: 100, bars: 8 },
  { id: 'tempo', title: 'Défi : tiens le tempo seul', subtitle: 'Le groupe se tait, tu continues', kind: 'tempo' },
];

/** Lien vers l'exercice d'une étape, pour un rythme et un instrument donnés. */
export function stepLink(step: ParcoursStep, rhythmId: string, instrumentId: string): { path: string[]; query: Record<string, string | number> } {
  const query: Record<string, string | number> = { inst: instrumentId, etape: step.id };
  if (step.kind === 'jeu') {
    query['vitesse'] = step.speed ?? 70;
    query['mesures'] = step.bars ?? 8;
    if (step.motif) query['motif'] = step.motif;
    return { path: ['/jeu', rhythmId], query };
  }
  return { path: [step.kind === 'appel' ? '/appel' : '/defi-tempo', rhythmId], query };
}

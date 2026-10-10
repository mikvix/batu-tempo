import { PlayerService } from '../audio/player.service';

/** Appelle `frame` à chaque image d'écran jusqu'à l'arrêt. Renvoie la fonction d'arrêt. */
export function startFrameLoop(frame: () => void): () => void {
  let id = 0;
  let running = true;
  const loop = () => {
    if (!running) return;
    frame();
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  // Filet de sécurité : si les images d'écran sont suspendues (onglet masqué), le minuteur continue
  // à faire avancer l'exercice, sans quoi il ne se terminerait jamais.
  const backup = setInterval(() => {
    if (running && document.visibilityState === 'hidden') frame();
  }, 50);
  return () => {
    running = false;
    cancelAnimationFrame(id);
    clearInterval(backup);
  };
}

export type Backing = 'fond' | 'fort' | 'clic';

/**
 * Accompagnement d'un exercice : la partie du musicien est coupée (c'est lui qui la joue) ou jouée
 * très bas comme guide ; les autres instruments sont baissés pour ne pas couvrir l'instrument au micro.
 */
export function applyBacking(player: PlayerService, mineId: string, opts: { backing: Backing; guide: boolean; headphones: boolean }): void {
  player.setMix((seq) => {
    seq.solo = null;
    seq.mineId = mineId;
    seq.muted.clear();
    seq.volumes = {};
    if (opts.guide) seq.volumes[mineId] = 0.35;
    else seq.muted.add(mineId);
    const fond = opts.headphones ? 0.55 : 0.3;
    seq.othersVolume = opts.backing === 'fort' ? 0.85 : opts.backing === 'fond' ? fond : 0;
  });
}

/** Remet le mixage par défaut à la sortie d'un exercice. */
export function restoreMix(player: PlayerService): void {
  player.setMix((seq) => {
    seq.solo = null;
    seq.mineId = null;
    seq.othersVolume = 1;
    seq.muted.clear();
    seq.volumes = {};
  });
}

/** Petit texte d'état affiché en surimpression après une frappe. */
export interface Feedback {
  text: string;
  color: string;
  at: number;
}

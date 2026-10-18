/**
 * Jeu de sons en cours : « a » = sons d'origine, « b » = sons retravaillés (synth-v2).
 * État de module (pas de service Angular) pour que le séquenceur, qui tourne hors injection,
 * puisse le lire à chaque note. Le réglage persistant vit dans SettingsService.
 */
export type SoundSet = 'a' | 'b';

let current: SoundSet = 'a';

export function getSoundSet(): SoundSet {
  return current;
}

export function setSoundSet(set: SoundSet): void {
  current = set;
}

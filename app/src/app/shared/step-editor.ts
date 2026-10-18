import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Hand } from '../data/hands';
import { STEPS_PER_BAR, Velocity } from '../data/types';

/** Ordre de rotation au toucher : silence → frappe → accent → ghost → silence. */
export const NEXT_VELOCITY: Record<Velocity, Velocity> = { 0: 2, 2: 3, 3: 1, 1: 0 };
const LABEL: Record<Velocity, string> = { 0: 'silence', 1: 'ghost', 2: 'frappe', 3: 'accent' };

/**
 * Grille éditable d'un pattern (une ou plusieurs mesures). Chaque case se modifie au toucher.
 * Sur téléphone, deux temps par ligne pour garder des cases assez grandes ; quatre sur écran large.
 */
@Component({
  selector: 'app-step-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (bar of bars(); track bar.index) {
      @if (bars().length > 1) {
        <span class="bar-label" [class.bar-label--on]="playBar() === bar.index">Mesure {{ bar.index + 1 }}</span>
      }
      <div class="beats">
        @for (beat of bar.beats; track beat.index) {
          <div class="beat">
            <span class="beat__num">{{ beat.index + 1 }}</span>
            <div class="beat__cells">
              @for (cell of beat.cells; track cell.i) {
                <button
                  type="button"
                  class="cell"
                  [class.cell--accent]="cell.v === 3"
                  [class.cell--hit]="cell.v === 2"
                  [class.cell--ghost]="cell.v === 1"
                  [class.cell--now]="playBar() === bar.index && playStep() === cell.i % 16"
                  [style.--c]="color()"
                  [attr.aria-label]="'Mesure ' + (bar.index + 1) + ', temps ' + (beat.index + 1) + ', case ' + ((cell.i % 4) + 1) + ' : ' + label(cell.v)"
                  (click)="toggle(cell.i)"></button>
              }
            </div>
            @if (hands(); as h) {
              <div class="beat__hands">
                @for (cell of beat.cells; track cell.i) {
                  <button
                    type="button"
                    class="hand"
                    [class.hand--set]="h[cell.i]?.explicit"
                    [disabled]="cell.v === 0"
                    [attr.aria-label]="'Main, mesure ' + (bar.index + 1) + ', temps ' + (beat.index + 1) + ', case ' + ((cell.i % 4) + 1) + ' : ' + handLabel(h[cell.i])"
                    (click)="handToggle.emit(cell.i)">
                    {{ cell.v === 0 ? '' : h[cell.i]?.hand || '·' }}
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .bar-label { font-size: 11px; font-weight: 700; color: var(--muted); }
    .bar-label--on { color: var(--accent); }
    .beats { display: flex; flex-wrap: wrap; gap: 8px 10px; }
    .beat { flex: 1 1 calc(50% - 10px); min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    @media (min-width: 600px) { .beat { flex-basis: calc(25% - 10px); } }
    .beat__num { font-size: 10px; font-weight: 700; color: var(--muted); }
    .beat__cells { display: flex; gap: 4px; }
    .cell { flex: 1 1 0; height: 40px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border);
      position: relative; transition: transform 60ms; }
    .cell:active { transform: scale(0.94); opacity: 1; }
    .cell--hit { background: var(--c); opacity: 0.7; border-color: transparent; }
    .cell--accent { background: var(--c); border-color: transparent; }
    .cell--accent::after { content: ''; position: absolute; left: 50%; top: 5px; width: 6px; height: 6px; margin-left: -3px;
      border-radius: 50%; background: var(--bg); }
    .cell--ghost { background: transparent; border: 2px dashed var(--c); }
    .cell--now { outline: 2px solid var(--text); outline-offset: 1px; }
    .beat__hands { display: flex; gap: 4px; }
    .hand { flex: 1 1 0; height: 22px; border-radius: 6px; background: transparent; border: 1px dashed transparent; color: var(--muted);
      font-size: 12px; font-weight: 700; padding: 0; }
    .hand:not(:disabled) { border-color: var(--border); }
    .hand--set { color: var(--text); border-style: solid; }
    .hand:disabled { opacity: 0.35; }
  `,
})
export class StepEditor {
  readonly cells = input.required<Velocity[]>();
  /** Mesure et pas en cours de lecture, pour afficher la tête de lecture (-1 = aucune). */
  readonly playBar = input(-1);
  readonly playStep = input(-1);
  readonly color = input('var(--accent)');
  /**
   * Index de la case touchée. Le parent applique la rotation sur son propre état : deux touches
   * rapprochées ne s'écrasent pas, même si l'affichage n'a pas encore été rafraîchi entre les deux.
   */
  readonly cellToggle = output<number>();
  /**
   * Doigté affiché sous les cases (null = pas de doigté pour cet instrument) : lettre effective et
   * si elle a été choisie explicitement (sinon c'est le doigté par défaut de la voix).
   */
  readonly hands = input<{ hand: Hand; explicit: boolean }[] | null>(null);
  /** Index de la case dont on veut changer la main (rotation : auto → D → G → auto). */
  readonly handToggle = output<number>();

  readonly bars = computed(() => {
    const cells = this.cells();
    const count = Math.max(1, Math.ceil(cells.length / STEPS_PER_BAR));
    return Array.from({ length: count }, (_, b) => ({
      index: b,
      beats: Array.from({ length: 4 }, (_, t) => ({
        index: t,
        cells: Array.from({ length: 4 }, (_, k) => {
          const i = b * STEPS_PER_BAR + t * 4 + k;
          return { i, v: cells[i] ?? 0 };
        }),
      })),
    }));
  });

  toggle(i: number): void {
    this.cellToggle.emit(i);
  }

  label(v: Velocity): string {
    return LABEL[v];
  }

  handLabel(h: { hand: Hand; explicit: boolean } | undefined): string {
    if (!h || !h.hand) return 'non précisée';
    return (h.hand === 'D' ? 'droite' : 'gauche') + (h.explicit ? '' : ' (par défaut)');
  }
}

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { barsOf, barSlice, InstrumentDef, parsePattern, Velocity } from '../data/types';
import { Icon } from './icon';

/** Les 16 pas d'une mesure (la mesure `bar` d'un pattern qui peut en compter plusieurs), avec la tête de lecture. */
@Component({
  selector: 'app-step-cells',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex; align-items:center; flex:1 1 auto; min-width:0' },
  template: `
    @for (vel of cells(); track $index; let i = $index) {
      <i
        class="cell"
        [class.cell--group]="i > 0 && i % 4 === 0"
        [class.cell--current]="step() === i"
        [style.flex-basis.px]="cell()"
        [style.height.px]="vel === 1 ? height() * 0.6 : height()"
        [style.margin-left.px]="i > 0 && i % 4 === 0 ? groupGap() : gap()"
        [style.background]="background(vel, i)"
        [style.opacity]="vel === 2 ? 0.75 : 1"></i>
    }
  `,
  styles: `
    /* Les cellules se partagent la largeur disponible : la grille ne déborde jamais de l'écran. */
    .cell { display: block; border-radius: 3px; flex: 1 1 0; min-width: 4px; max-width: 18px; }
    /* Sur tablette et desktop, les cases s'élargissent pour occuper la colonne de contenu. */
    @media (min-width: 768px) { .cell { max-width: 34px; border-radius: 4px; } }
    .cell--current { outline: 2px solid var(--text); outline-offset: -2px; }
  `,
})
export class StepCells {
  readonly pattern = input.required<Velocity[]>();
  readonly step = input(-1);
  /** Mesure du pattern à afficher (phase du groove) ; un pattern d'une mesure l'ignore. */
  readonly bar = input(0);
  readonly color = input('var(--accent)');
  readonly cell = input(11);
  readonly height = input(28);
  readonly gap = input(2);
  readonly groupGap = input(6);

  readonly cells = computed(() => barSlice(this.pattern(), this.bar()));

  background(vel: Velocity, i: number): string {
    if (vel === 3 || vel === 2) return this.color();
    if (vel === 1) return 'var(--accent-soft)';
    return this.step() === i ? 'var(--dim)' : 'var(--surface-2)';
  }
}

/** Numéros de temps au-dessus de la grille. */
@Component({
  selector: 'app-beat-ruler',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex; align-items:center; flex:1 1 auto; min-width:0' },
  template: `
    @for (i of steps; track i) {
      <span
        class="tick"
        [style.flex-basis.px]="cell()"
        [style.margin-left.px]="i > 0 && i % 4 === 0 ? groupGap() : gap()"
        [style.color]="step() === i ? 'var(--text)' : i % 4 === 0 ? 'var(--muted)' : 'transparent'">
        {{ i % 4 === 0 ? i / 4 + 1 : '·' }}
      </span>
    }
  `,
  styles: `
    .tick { display: block; text-align: center; font-weight: 700; font-size: 10px; flex: 1 1 0; min-width: 4px; max-width: 18px; }
    @media (min-width: 768px) { .tick { max-width: 34px; font-size: 11px; } }
  `,
})
export class BeatRuler {
  readonly step = input(-1);
  readonly cell = input(11);
  readonly gap = input(2);
  readonly groupGap = input(6);
  readonly steps = Array.from({ length: 16 }, (_, i) => i);
}

/** Une ligne d'instrument du lecteur : nom, bouton mute, grille. */
@Component({
  selector: 'app-instrument-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, StepCells],
  template: `
    <div class="irow" [class.irow--hl]="highlighted()" [class.irow--muted]="muted()">
      <button class="irow__name" type="button" [attr.aria-label]="'Décomposition ' + instrument().name" (click)="open.emit()">
        <span class="irow__title">{{ instrument().name }}</span>
        <span class="irow__role">
          {{ instrument().role }}
          @if (bars() > 1) {
            <b class="irow__bar">{{ (bar() % bars()) + 1 }}/{{ bars() }}</b>
          }
        </span>
      </button>
      <button
        class="irow__mute"
        type="button"
        [class.irow__mute--on]="muted()"
        [attr.aria-label]="(muted() ? 'Réactiver ' : 'Couper ') + instrument().name"
        (click)="toggleMute.emit()">
        <app-icon [name]="muted() ? 'volume-mute' : 'volume'" [size]="16" />
      </button>
      <app-step-cells [pattern]="cells()" [step]="step()" [bar]="bar()" />
    </div>
  `,
  styles: `
    .irow { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 12px; }
    .irow--hl { background: var(--surface-alt); }
    .irow--muted { opacity: 0.4; }
    .irow__name { width: 78px; flex: 0 0 auto; text-align: left; display: flex; flex-direction: column; gap: 1px; }
    .irow__title { font-weight: 700; font-size: 13px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .irow__role { font-size: 10px; color: var(--muted); line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .irow__bar { color: var(--accent); font-weight: 700; margin-left: 3px; }
    .irow__mute { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface);
      display: grid; place-items: center; flex: 0 0 auto; }
    .irow__mute--on { background: var(--border); }
  `,
})
export class InstrumentRow {
  readonly instrument = input.required<InstrumentDef>();
  readonly pattern = input<Velocity[]>();
  readonly step = input(-1);
  /** Phase du groove : quelle mesure d'un pattern multi-mesures est en cours. */
  readonly bar = input(0);
  readonly muted = input(false);
  readonly highlighted = input(false);
  readonly toggleMute = output<void>();
  readonly open = output<void>();

  readonly cells = computed(() => this.pattern() ?? parsePattern(this.instrument().pattern));
  readonly bars = computed(() => barsOf(this.cells()));
}

/** Décalage de la grille par rapport au bord de la ligne : nom + gap + mute + gap + padding. */
export const GRID_LEFT = 78 + 8 + 32 + 8 + 10;

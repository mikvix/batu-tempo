import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EXERCISE_FILTERS, EXERCISES } from '../data/exercises';
import { getRhythm, RHYTHMS } from '../data/rhythms';
import { ExerciseDef } from '../data/types';
import { Icon, IconName } from '../shared/icon';
import { LevelDots } from '../shared/ui';
import { SettingsService } from '../state/settings.service';

const ICONS: Record<ExerciseDef['id'], IconName> = {
  break: 'flash',
  blind: 'eye-off',
  call: 'megaphone',
  tempo: 'trending',
  countdown: 'hourglass',
};

const ICON_COLORS: Record<ExerciseDef['id'], string> = {
  break: 'var(--accent)',
  blind: 'var(--reprise)',
  call: 'var(--accent)',
  tempo: 'var(--blue)',
  countdown: 'var(--break)',
};

@Component({
  selector: 'app-exercises-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, LevelDots],
  template: `
    <div class="page">
      <div class="page__head page__top">
        <div class="row row--between">
          <h1 class="display">Exercices</h1>
          <button class="pill" type="button" style="max-width: 58%" (click)="pick.set(!pick())">
            <i class="dot"></i>
            <span class="pill__text">{{ rhythm().name }}</span>
            <app-icon [name]="pick() ? 'chevron-up' : 'chevron-down'" [size]="14" />
          </button>
        </div>

        @if (pick()) {
          <div class="chip-row chip-row--wrap" style="margin-top: 12px">
            @for (r of rhythms; track r.id) {
              <button class="chip" type="button" [class.chip--active]="r.id === rhythm().id" (click)="chooseRhythm(r.id)">
                {{ r.name }}
              </button>
            }
          </div>
        }

        <div class="chip-row chip-row--scroll" style="margin-top: 16px">
          @for (f of filters; track f) {
            <button class="chip" type="button" [class.chip--active]="f === filter()" (click)="filter.set(f)">{{ f }}</button>
          }
        </div>
      </div>

      <div class="page__scroll">
        <div class="stack" style="gap: 10px; margin-top: 4px">
          @for (e of list(); track e.id; let first = $first) {
            @if (first && e.id === 'break') {
              <a class="hero" [routerLink]="['/exercice', e.id]" [queryParams]="{ rhythm: rhythm().id }">
                <div class="row row--between">
                  <div class="row">
                    <span class="badge" style="background: var(--break); color: var(--on-break)">BREAK</span>
                    <span class="badge" style="background: var(--reprise); color: var(--on-reprise)">REPRISE</span>
                  </div>
                  <app-level-dots [level]="e.level" />
                </div>
                <span class="hero__title">{{ e.name }}</span>
                <span class="muted">{{ e.description }}</span>
                <div class="timeline">
                  <span style="flex: 8; background: var(--accent)"></span>
                  <span style="flex: 2; background: var(--break)"></span>
                  <span style="flex: 8; background: var(--reprise)"></span>
                </div>
              </a>
            } @else {
              <a class="list-card" [routerLink]="['/exercice', e.id]" [queryParams]="{ rhythm: rhythm().id }">
                <span class="icon-box" [style.color]="iconColor(e)"><app-icon [name]="icon(e)" /></span>
                <div class="grow stack" style="gap: 3px">
                  <span class="strong">{{ e.name }}</span>
                  <span class="muted">{{ e.description }}</span>
                </div>
                <app-level-dots [level]="e.level" />
              </a>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: 0 0 auto; }
    .hero { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 20px; background: var(--surface);
      border: 1px solid var(--accent); }
    .hero__title { font-family: var(--font-display); font-weight: 700; font-size: 18px; }
  `,
})
export class ExercisesPage {
  private readonly settings = inject(SettingsService);

  readonly rhythms = RHYTHMS;
  readonly filters = EXERCISE_FILTERS;
  readonly filter = signal('Tous');
  readonly pick = signal(false);

  readonly rhythm = computed(() => getRhythm(this.settings.lastRhythmId()));
  readonly list = computed(() => EXERCISES.filter((e) => this.filter() === 'Tous' || e.tags.includes(this.filter())));

  chooseRhythm(id: string): void {
    this.settings.update({ lastRhythmId: id });
    this.pick.set(false);
  }

  icon(e: ExerciseDef): IconName {
    return ICONS[e.id];
  }

  iconColor(e: ExerciseDef): string {
    return ICON_COLORS[e.id];
  }
}

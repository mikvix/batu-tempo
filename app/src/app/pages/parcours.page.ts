import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { getInstrument } from '../data/rhythms';
import { PARCOURS, stepLink } from '../exercises/parcours';
import { Stars } from '../shared/exercise-ui';
import { Icon } from '../shared/icon';
import { ProgressService, XP_PER_LEVEL } from '../state/progress.service';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { SettingsService } from '../state/settings.service';

/**
 * Parcours guidé : une suite d'étapes sur le rythme et l'instrument choisis. Chaque étape se
 * débloque avec au moins une étoile à la précédente ; la mission du jour pointe la prochaine à
 * travailler.
 */
@Component({
  selector: 'app-parcours-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Stars],
  template: `
    <div class="page">
      <div class="page__head page__top">
        <div class="row row--between">
          <h1 class="display">Parcours</h1>
          @if (progress.streak() > 0) {
            <span class="pill" style="color: var(--break); border-color: transparent; background: var(--surface-2)">
              <app-icon name="flame" [size]="16" [filled]="true" />
              {{ progress.streak() }} jour{{ progress.streak() > 1 ? 's' : '' }} d'affilée
            </span>
          }
        </div>
        <div class="stack" style="gap: 6px; margin-top: 12px">
          <div class="row row--between muted small" style="font-weight: 600">
            <span>Niveau {{ progress.level() }}</span>
            <span>{{ progress.levelProgress() }} / {{ xpPerLevel }} XP</span>
          </div>
          <div class="xp"><i [style.width.%]="(progress.levelProgress() / xpPerLevel) * 100"></i></div>
        </div>
      </div>

      <div class="page__scroll">
        <button class="pill picker" type="button" (click)="picking.set(!picking())">
          <span class="pill__text">{{ rhythm().name }} · {{ mine().name }}</span>
          <app-icon [name]="picking() ? 'chevron-up' : 'chevron-down'" [size]="14" />
        </button>
        @if (picking()) {
          <div class="card stack" style="gap: 10px; margin-top: 10px">
            <span class="label">Rythme</span>
            <div class="chip-row chip-row--wrap">
              @for (r of library.all(); track r.id) {
                <button class="chip chip--small" type="button" [class.chip--active]="r.id === rhythm().id" (click)="settings.update({ lastRhythmId: r.id })">{{ r.name }}</button>
              }
            </div>
            <span class="label">Mon instrument</span>
            <div class="chip-row chip-row--wrap">
              @for (i of rhythm().instruments; track i.id) {
                <button class="chip chip--small" type="button" [class.chip--active]="i.id === mine().id" (click)="settings.setMyInstrument(rhythm().id, i.id)">{{ i.name }}</button>
              }
            </div>
          </div>
        }

        @if (micCard(); as m) {
          <a class="list-card mic" [routerLink]="['/micro']" [queryParams]="{ retour: '/parcours' }">
            <span class="icon-box" [style.color]="m.color"><app-icon [name]="m.icon" /></span>
            <div class="grow stack" style="gap: 2px">
              <span class="strong">{{ m.title }}</span>
              <span class="muted small">{{ m.text }}</span>
            </div>
            <app-icon name="chevron-right" [size]="18" style="color: var(--muted)" />
          </a>
        }

        @if (mission(); as s) {
          <a class="mission" [routerLink]="s.link.path" [queryParams]="s.link.query">
            <div class="row row--between">
              <span class="mission__label">Mission du jour</span>
              <span class="mission__xp">+{{ s.stars ? 25 : 40 }} XP</span>
            </div>
            <span class="mission__title">{{ s.step.title }}</span>
            <span class="mission__sub">{{ rhythm().name }} · {{ mine().name }} · {{ s.stars ? 'gagne une étoile de plus' : 'première étoile à décrocher' }}</span>
          </a>
        }

        <div class="steps">
          <i class="steps__rail"></i>
          @for (s of steps(); track s.step.id) {
            @if (s.locked) {
              <div class="step step--locked">
                <span class="node"><app-icon name="lock" [size]="20" /></span>
                <div class="grow stack" style="gap: 2px">
                  <span class="strong">{{ s.step.title }}</span>
                  <span class="muted small">{{ s.step.subtitle }}</span>
                </div>
              </div>
            } @else {
              <a class="step" [class.step--current]="s.current" [routerLink]="s.link.path" [queryParams]="s.link.query">
                <span class="node" [class.node--done]="s.stars > 0" [class.node--current]="s.current">
                  @if (s.current) {
                    <app-icon name="play" [size]="20" [filled]="true" />
                  } @else if (s.stars > 0) {
                    <app-icon name="check" [size]="22" />
                  } @else {
                    <app-icon name="play" [size]="20" [filled]="true" />
                  }
                </span>
                <div class="grow stack" style="gap: 2px">
                  <span class="strong">{{ s.step.title }}</span>
                  <span class="muted small">{{ s.step.subtitle }}</span>
                </div>
                @if (s.stars > 0) {
                  <app-stars [count]="s.stars" />
                } @else if (s.current) {
                  <span class="small" style="color: var(--accent); font-weight: 700">À faire</span>
                }
              </a>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .xp { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
    .xp i { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
    .picker { max-width: 100%; }
    .mic { margin-top: 14px; }
    .mission { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; padding: 16px; border-radius: 20px; background: var(--accent); color: var(--on-accent); }
    .mission__label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
    .mission__xp { height: 24px; padding: 0 8px; border-radius: 8px; background: var(--on-accent); color: var(--accent); font-size: 12px; font-weight: 700; display: flex; align-items: center; }
    .mission__title { font-family: var(--font-display); font-weight: 700; font-size: 19px; line-height: 1.2; }
    .mission__sub { font-size: 13px; opacity: 0.85; }
    .steps { position: relative; display: flex; flex-direction: column; gap: 10px; margin-top: 22px; }
    .steps__rail { position: absolute; left: 27px; top: 28px; bottom: 28px; width: 3px; border-radius: 2px; background: var(--surface-2); }
    .step { position: relative; display: flex; align-items: center; gap: 14px; padding: 6px 12px 6px 0; border-radius: 18px; border: 1px solid transparent; }
    .step--current { background: var(--surface); border-color: var(--accent); }
    .step--locked { opacity: 0.5; }
    .node { width: 56px; height: 56px; border-radius: 50%; background: var(--surface-2); color: var(--muted); display: grid; place-items: center; flex: none; }
    .node--done { background: var(--reprise); color: var(--on-reprise); }
    .node--current { background: var(--accent); color: var(--on-accent); box-shadow: 0 0 0 6px rgba(242,177,52,0.18); }
  `,
})
export class ParcoursPage {
  readonly settings = inject(SettingsService);
  readonly library = inject(RhythmLibrary);
  readonly progress = inject(ProgressService);

  readonly xpPerLevel = XP_PER_LEVEL;
  readonly picking = signal(false);

  readonly rhythm = computed(() => this.library.get(this.settings.lastRhythmId()));
  readonly mine = computed(() => getInstrument(this.rhythm(), this.settings.myInstrumentFor(this.rhythm().id)));

  readonly steps = computed(() => {
    const r = this.rhythm().id;
    const i = this.mine().id;
    // Lecture des étoiles : dépend du signal de progression via starsFor.
    this.progress.xp();
    let previous = 1;
    let currentFound = false;
    return PARCOURS.map((step) => {
      const stars = this.progress.starsFor(r, i, step.id);
      const locked = previous === 0;
      const current = !locked && !currentFound && stars === 0;
      if (current) currentFound = true;
      previous = stars;
      return { step, stars, locked, current, link: stepLink(step, r, i) };
    });
  });

  /** Première étape débloquée sans ses trois étoiles. */
  readonly mission = computed(() => this.steps().find((s) => !s.locked && s.stars < 3) ?? null);

  readonly micCard = computed(() => {
    const s = this.settings.settings();
    if (s.inputMode === 'toucher') {
      return { icon: 'mic' as const, color: 'var(--muted)', title: 'Exercices au toucher', text: 'Passe au micro pour jouer sur ton vrai instrument' };
    }
    if (s.micLatencyMs === null) {
      return { icon: 'mic' as const, color: 'var(--accent)', title: 'Règle le micro', text: 'Une minute, avant le premier exercice : le téléphone écoutera ton instrument' };
    }
    return { icon: 'mic' as const, color: 'var(--reprise)', title: `Micro réglé · ${s.micLatencyMs} ms`, text: s.headphones ? 'Au casque · touche pour refaire la mesure' : 'Sans casque · touche pour refaire la mesure' };
  });
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { getInstrument, LEVELS, RHYTHMS } from '../data/rhythms';
import { RhythmDef } from '../data/types';
import { Icon } from '../shared/icon';
import { LevelDots } from '../shared/ui';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { SettingsService } from '../state/settings.service';

@Component({
  selector: 'app-rhythms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, LevelDots],
  template: `
    <div class="page">
      <div class="page__head page__top">
        <div class="row row--between">
          <div class="row" style="gap: 10px">
            <span class="logo"><app-icon name="disc" [size]="20" /></span>
            <span class="brand">Batu Tempo</span>
          </div>
          <a class="icon-btn" routerLink="/profil" aria-label="Profil et réglages"><app-icon name="sliders" /></a>
        </div>
        <h1 class="display" style="margin-top: 18px">Choisis ton rythme</h1>
      </div>

      <div class="page__scroll">
        <a class="resume" [routerLink]="['/rythme', last().id]">
          <div class="grow stack" style="gap: 4px">
            <span class="resume__label">Reprendre la session</span>
            <span class="resume__title">{{ last().name }} · {{ lastBpm() }} BPM</span>
            <span class="resume__sub">Groove de base · ton instrument : {{ mine().name }}</span>
          </div>
          <span class="resume__play"><app-icon name="play" [size]="22" [filled]="true" /></span>
        </a>

        <div class="section-row">
          <h2 class="title">Mes rythmes</h2>
          @if (library.custom().length) {
            <span class="muted">{{ library.custom().length }} {{ library.custom().length > 1 ? 'rythmes' : 'rythme' }}</span>
          }
        </div>
        <div class="card-grid card-grid--3">
          <a class="list-card create" routerLink="/editeur">
            <span class="monogram create__icon"><app-icon name="plus" [size]="20" /></span>
            <div class="grow stack" style="gap: 3px">
              <span class="strong" style="font-size: 16px">Créer un rythme</span>
              <span class="muted">Compose la grille de chaque instrument, puis partage-la au groupe</span>
            </div>
          </a>
          @for (r of library.custom(); track r.id) {
            <a class="list-card" [routerLink]="['/rythme', r.id]">
              <span class="monogram">{{ short(r) }}</span>
              <div class="grow stack" style="gap: 3px">
                <span class="strong" style="font-size: 16px">{{ r.name }}</span>
                <span class="muted">{{ r.origin }} · {{ r.bpm }} BPM · {{ r.instruments.length }} instruments</span>
              </div>
              <app-icon name="chevron-right" [size]="18" style="color: var(--muted)" />
            </a>
          }
        </div>

        @for (group of groups; track group.level) {
          <div class="section-row">
            <div class="row" style="gap: 10px">
              <h2 class="title">{{ group.label }}</h2>
              <app-level-dots [level]="group.level" />
            </div>
            <span class="muted">{{ group.rhythms.length }} {{ group.rhythms.length > 1 ? 'rythmes' : 'rythme' }}</span>
          </div>

          <div class="card-grid card-grid--3">
            @for (r of group.rhythms; track r.id) {
              <a class="list-card" [routerLink]="['/rythme', r.id]">
                <span class="monogram">{{ short(r) }}</span>
                <div class="grow stack" style="gap: 3px">
                  <span class="strong" style="font-size: 16px">{{ r.name }}</span>
                  <span class="muted">{{ r.origin }} · {{ r.bpmRange[0] }}–{{ r.bpmRange[1] }} BPM · {{ r.instruments.length }} instruments</span>
                </div>
                <app-icon name="chevron-right" [size]="18" style="color: var(--muted)" />
              </a>
            }
          </div>
        }

        <p class="muted" style="margin-top: 18px; text-align: center">
          Les patterns sont indicatifs : crée une variante pour les adapter à ceux de ta batucada.
        </p>
      </div>
    </div>
  `,
  styles: `
    .logo { width: 36px; height: 36px; border-radius: 12px; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; }
    .brand { font-family: var(--font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
    .resume { margin-top: 8px; padding: 16px; border-radius: 20px; background: var(--accent); color: var(--on-accent);
      display: flex; align-items: center; gap: 14px; }
    .resume__label { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
    .resume__title { font-family: var(--font-display); font-weight: 700; font-size: 18px; }
    .resume__sub { font-size: 13px; opacity: 0.8; }
    .create { border-style: dashed; border-color: var(--border); }
    .create__icon { background: var(--accent); color: var(--on-accent); }
    .resume__play { width: 48px; height: 48px; border-radius: 50%; background: var(--on-accent); color: var(--accent);
      display: grid; place-items: center; flex: 0 0 auto; padding-left: 3px; }
  `,
})
export class RhythmsPage {
  private readonly settings = inject(SettingsService);
  readonly library = inject(RhythmLibrary);

  readonly groups = LEVELS.map((l) => ({ ...l, rhythms: RHYTHMS.filter((r) => r.level === l.level) })).filter(
    (g) => g.rhythms.length > 0
  );

  readonly last = computed(() => this.library.get(this.settings.lastRhythmId()));
  readonly mine = computed(() => getInstrument(this.last(), this.settings.myInstrumentFor(this.last().id)));
  readonly lastBpm = computed(() => this.settings.settings().bpm[this.last().id] ?? this.last().bpm);

  short(r: RhythmDef): string {
    const words = r.name.split(' ').filter((w) => w.length > 2);
    return (words.length > 1 ? words.map((w) => w[0]).join('') : r.name.slice(0, 2)).toUpperCase().slice(0, 2);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { getRhythm, RHYTHMS } from '../data/rhythms';
import { SettingsService } from '../state/settings.service';

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page__head page__top">
        <h1 class="display">Profil</h1>
        <p class="muted" style="margin-top: 6px">Ton instrument par rythme, et quelques réglages.</p>
      </div>

      <div class="page__scroll">
        <p class="label" style="margin-top: 8px">Rythme</p>
        <div class="chip-row chip-row--wrap" style="margin-top: 10px">
          @for (r of rhythms; track r.id) {
            <button class="chip" type="button" [class.chip--active]="r.id === rhythm().id" (click)="settings.update({ lastRhythmId: r.id })">
              {{ r.name }}
            </button>
          }
        </div>

        <p class="label" style="margin-top: 26px">Mon instrument · {{ rhythm().name }}</p>
        <div class="stack" style="gap: 8px; margin-top: 10px">
          @for (inst of rhythm().instruments; track inst.id) {
            <button
              class="list-card"
              type="button"
              [class.list-card--selected]="mine() === inst.id"
              [attr.aria-pressed]="mine() === inst.id"
              (click)="settings.setMyInstrument(rhythm().id, inst.id)">
              <span class="monogram" [class.monogram--filled]="mine() === inst.id">{{ inst.short }}</span>
              <div class="grow stack">
                <span class="strong">{{ inst.name }}</span>
                <span class="muted">{{ inst.role }}</span>
              </div>
              @if (mine() === inst.id) {
                <span class="selected">Mon instrument</span>
              }
            </button>
          }
        </div>

        <p class="label" style="margin-top: 26px">Exercices</p>
        <div class="card stack" style="margin-top: 10px; gap: 10px">
          <span class="strong">Mesures de groove avant un break</span>
          <div class="chip-row">
            @for (n of [4, 8, 12, 16]; track n) {
              <button class="chip chip--grow" type="button" [class.chip--active]="settings.grooveBars() === n" (click)="settings.update({ grooveBars: n })">
                {{ n }}
              </button>
            }
          </div>
        </div>

        <div class="card stack" style="margin-top: 16px; gap: 6px">
          <span class="strong">Batu Tempo · version 0.1</span>
          <span class="muted">Tous les sons sont synthétisés dans l'app, sans samples. Les rythmes et leurs patterns se modifient dans src/app/data/rhythms.json.</span>
        </div>
      </div>
    </div>
  `,
  styles: `
    .selected { font-weight: 700; font-size: 12px; color: var(--accent); }
  `,
})
export class ProfilePage {
  readonly settings = inject(SettingsService);
  readonly rhythms = RHYTHMS;
  readonly rhythm = computed(() => getRhythm(this.settings.lastRhythmId()));
  readonly mine = computed(() => this.settings.myInstrumentFor(this.rhythm().id));
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { buildBarSpec, PlayerService } from '../audio/player.service';
import { getInstrument, getRhythm, grooveBar } from '../data/rhythms';
import { barsOf, barSlice, parsePattern, Velocity } from '../data/types';
import { Icon } from '../shared/icon';
import { TempoControl } from '../shared/tempo-control';
import { Header, PlayButton } from '../shared/ui';
import { SettingsService } from '../state/settings.service';

type Mode = 'solo' | 'group' | 'full';

const SPEEDS = [50, 70, 85, 100];

function hands(pattern: Velocity[]): string[] {
  let right = true;
  return pattern.map((v) => {
    if (v === 0) return '';
    const h = right ? 'D' : 'G';
    right = !right;
    return h;
  });
}

@Component({
  selector: 'app-instrument-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Header, PlayButton, TempoControl],
  template: `
    <div class="page page--full">
      <app-header
        [back]="true"
        [fallback]="'/rythme/' + rhythmDef().id"
        [title]="instrument().name"
        [subtitle]="rhythmDef().name + ' · ' + variation().name">
        <a class="pill" routerLink="/profil">Changer <app-icon name="chevron-down" [size]="14" /></a>
      </app-header>

      <div class="page__scroll" style="padding-top: 18px">
        <div class="card stack" style="gap: 14px">
          <div class="row row--between">
            <span class="label">Pattern · {{ bars() === 1 ? '1 mesure' : bars() + ' mesures' }}</span>
            <span class="muted small"><i class="sq" style="background: var(--accent)"></i> accent &nbsp;<i class="sq" style="background: var(--ghost)"></i> ghost</span>
          </div>
          @for (row of rows(); track row.bar) {
            @if (bars() > 1) {
              <span class="muted small" [style.color]="row.bar === phase() ? 'var(--accent)' : null">Mesure {{ row.bar + 1 }}</span>
            }
            <div class="groups">
              @for (g of [0, 1, 2, 3]; track g) {
                <div class="group">
                  <span class="group__beat">{{ g + 1 }}</span>
                  <div class="group__cells">
                    @for (k of [0, 1, 2, 3]; track k) {
                      <div class="pcell">
                        <span class="pcell__accent" [style.color]="row.cells[g * 4 + k] === 3 ? 'var(--accent)' : 'transparent'">›</span>
                        <span
                          class="pcell__box"
                          [class.pcell__box--current]="row.bar === phase() && step() === g * 4 + k"
                          [style.background]="cellColor(row.cells[g * 4 + k], row.bar, g * 4 + k)"></span>
                        <span class="pcell__hand" [style.color]="row.cells[g * 4 + k] === 3 ? 'var(--text)' : 'var(--muted)'">
                          {{ row.hands ? row.hands[g * 4 + k] : row.cells[g * 4 + k] ? '•' : '' }}
                        </span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
          <div class="row row--between muted small" style="border-top: 1px solid var(--border-soft); padding-top: 10px">
            <span>{{ instrument().showHands ? 'D = main droite · G = main gauche' : '• = frappe' }}</span>
            <span>{{ instrument().role }}</span>
          </div>
        </div>

        <p class="label" style="margin-top: 22px">Vitesse d'apprentissage</p>
        <div class="chip-row" style="margin-top: 10px">
          @for (s of speeds; track s) {
            <button class="chip chip--grow" type="button" style="height: 44px" [class.chip--active]="s === speed()" (click)="speed.set(s)">{{ s }} %</button>
          }
        </div>
        <p class="muted" style="margin-top: 8px">
          Soit {{ targetBpm() }} BPM au lieu de {{ rhythmDef().bpm }}. Passe au palier suivant quand quatre boucles d'affilée sont propres.
        </p>

        <div style="margin-top: 14px">
          <app-tempo-control [bpm]="player.bpm()" [reference]="rhythmDef().bpm" [min]="40" [max]="rhythmDef().bpmRange[1] + 40" (bpmChange)="player.setBpm($event)" />
        </div>

        <p class="label" style="margin-top: 22px">Écoute</p>
        <div class="chip-row chip-row--wrap" style="margin-top: 10px">
          <button class="chip" type="button" [class.chip--active]="mode() === 'solo'" (click)="mode.set('solo')">{{ instrument().name }} seul</button>
          <button class="chip" type="button" [class.chip--active]="mode() === 'group'" (click)="mode.set('group')">Groupe en fond</button>
          <button class="chip" type="button" [class.chip--active]="mode() === 'full'" (click)="mode.set('full')">Groupe à fond</button>
          <button class="chip" type="button" [class.chip--outline]="click()" (click)="click.set(!click())"><app-icon name="timer" [size]="14" /> Clic</button>
        </div>

        <p class="label" style="margin-top: 22px">Variations</p>
        <div class="chip-row chip-row--scroll" style="margin-top: 10px">
          @for (v of variations(); track v.id) {
            <button class="chip" type="button" [class.chip--outline]="v.id === variationId()" (click)="variationId.set(v.id)">{{ v.name }}</button>
          }
        </div>
      </div>

      <div class="bottom-bar">
        <a class="action-btn" routerLink="/profil">
          <app-icon name="swap" [size]="18" />
          <span>Changer d'instrument</span>
        </a>
        <app-play-button [playing]="player.playing()" (toggle)="player.toggle()" />
        <a class="action-btn" [routerLink]="['/exercice', 'break']" [queryParams]="{ rhythm: rhythmDef().id }">
          <app-icon name="target" [size]="18" />
          <span>Exercices</span>
        </a>
      </div>
    </div>
  `,
  styles: `
    .sq { display: inline-block; width: 9px; height: 9px; border-radius: 2px; vertical-align: middle; }
    .groups { display: flex; gap: 10px; }
    .group { flex: 1 1 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .group__beat { font-weight: 700; font-size: 12px; color: var(--muted); }
    .group__cells { display: flex; gap: 4px; }
    .pcell { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
    .pcell__accent { font-family: var(--font-display); font-weight: 800; font-size: 16px; line-height: 14px; height: 14px; transform: rotate(90deg); }
    .pcell__box { display: block; width: 100%; height: 44px; border-radius: 8px; }
    .pcell__box--current { outline: 2px solid var(--text); outline-offset: -2px; }
    .pcell__hand { font-weight: 700; font-size: 11px; height: 14px; }
  `,
})
export class InstrumentPage {
  readonly rhythm = input.required<string>();
  readonly inst = input.required<string>();

  readonly player = inject(PlayerService);
  private readonly settings = inject(SettingsService);

  readonly speeds = SPEEDS;
  readonly speed = signal(70);
  readonly mode = signal<Mode>('group');
  readonly click = signal(false);
  readonly variationId = signal<string | null>(null);

  readonly rhythmDef = computed(() => getRhythm(this.rhythm()));
  readonly instrument = computed(() => getInstrument(this.rhythmDef(), this.inst()));
  readonly variations = computed(
    () => this.instrument().variations ?? [{ id: 'base', name: 'Groove de base', pattern: this.instrument().pattern }]
  );
  readonly variation = computed(() => this.variations().find((v) => v.id === this.variationId()) ?? this.variations()[0]);
  readonly pattern = computed(() => parsePattern(this.variation().pattern));
  readonly bars = computed(() => barsOf(this.pattern()));
  /** Une ligne de grille par mesure du pattern, avec le doigté continu sur toute la phrase. */
  readonly rows = computed(() => {
    const allHands = this.instrument().showHands ? hands(this.pattern()) : null;
    return Array.from({ length: this.bars() }, (_, bar) => ({
      bar,
      cells: barSlice(this.pattern(), bar),
      hands: allHands ? allHands.slice(bar * 16, bar * 16 + 16) : null,
    }));
  });
  readonly targetBpm = computed(() => Math.round((this.rhythmDef().bpm * this.speed()) / 100));
  readonly step = computed(() => (this.player.playing() ? this.player.step() : -1));
  /** Mesure du pattern en cours de lecture. */
  readonly phase = computed(() => {
    const spec = this.player.spec();
    if (!this.player.playing() || !spec) return 0;
    return (spec.phase ?? 0) % this.bars();
  });

  constructor() {
    effect(() => {
      const rhythm = this.rhythmDef();
      const instrument = this.instrument();
      const variation = this.variation();
      const click = this.click();
      const spec = buildBarSpec(rhythm, grooveBar(rhythm, { [instrument.id]: variation.pattern }), { click });
      this.player.setProvider((bar) => ({ ...spec, phase: bar }));
    });

    effect(() => {
      const rhythm = this.rhythmDef();
      const instrument = this.instrument();
      const mode = this.mode();
      untracked(() => {
        this.player.setMix((seq) => {
          seq.mineId = instrument.id;
          seq.othersVolume = mode === 'solo' ? 0 : mode === 'group' ? 0.3 : 1;
          seq.muted.delete(instrument.id);
        });
        this.settings.setMyInstrument(rhythm.id, instrument.id);
      });
    });

    effect(() => {
      const bpm = this.targetBpm();
      untracked(() => this.player.setBpm(bpm));
    });
  }

  cellColor(vel: Velocity, bar: number, index: number): string {
    if (vel === 3) return 'var(--accent)';
    if (vel === 2) return 'var(--accent-dim)';
    if (vel === 1) return 'var(--ghost)';
    return bar === this.phase() && this.step() === index ? 'var(--dim)' : 'var(--surface-2)';
  }
}

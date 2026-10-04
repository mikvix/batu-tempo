import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { PlayerService } from '../audio/player.service';
import { BarSpec } from '../audio/sequencer';
import { Velocity } from '../data/types';
import { TempoControl } from '../shared/tempo-control';
import { PlayButton } from '../shared/ui';

const SUBDIVISIONS: { id: string; label: string; pattern: Velocity[] }[] = [
  { id: 'noires', label: 'Noires', pattern: [3, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0] },
  { id: 'croches', label: 'Croches', pattern: [3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0] },
  { id: 'doubles', label: 'Doubles', pattern: [3, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1] },
];

@Component({
  selector: 'app-metronome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TempoControl, PlayButton],
  template: `
    <div class="page">
      <div class="page__head page__top">
        <h1 class="display">Métronome</h1>
        <p class="muted" style="margin-top: 6px">Pour chauffer, ou pour tenir le tempo sans le groupe.</p>
      </div>

      <div class="page__scroll">
        <div style="margin-top: 8px">
          <app-tempo-control [bpm]="player.bpm()" (bpmChange)="player.setBpm($event)" />
        </div>

        <div class="beat-dots" style="margin-top: 28px">
          @for (b of [0, 1, 2, 3]; track b) {
            <span
              class="beat-dot beat-dot--big"
              [class.beat-dot--on]="beat() === b"
              [style.background]="beat() === b ? (b === 0 && accent() ? 'var(--accent)' : 'var(--text)') : null"
              [style.color]="beat() === b ? 'var(--bg)' : null">
              {{ b + 1 }}
            </span>
          }
        </div>

        <p class="label" style="margin-top: 26px">Subdivision</p>
        <div class="chip-row" style="margin-top: 10px">
          @for (s of subdivisions; track s.id) {
            <button class="chip chip--grow" type="button" [class.chip--active]="s.id === sub()" (click)="sub.set(s.id)">{{ s.label }}</button>
          }
        </div>

        <p class="label" style="margin-top: 22px">Accent</p>
        <div class="chip-row" style="margin-top: 10px">
          <button class="chip" type="button" [class.chip--active]="accent()" (click)="accent.set(true)">Accent sur le 1</button>
          <button class="chip" type="button" [class.chip--active]="!accent()" (click)="accent.set(false)">Tous égaux</button>
        </div>

        <div style="display: flex; justify-content: center; margin-top: 36px">
          <app-play-button [playing]="player.playing()" (toggle)="toggle()" />
        </div>
      </div>
    </div>
  `,
  styles: `
    .beat-dot--big { width: 56px; height: 56px; font-size: 18px; }
  `,
})
export class MetronomePage {
  readonly player = inject(PlayerService);
  readonly subdivisions = SUBDIVISIONS;
  readonly sub = signal('noires');
  readonly accent = signal(true);

  readonly beat = computed(() => (this.player.playing() && this.player.step() >= 0 ? Math.floor(this.player.step() / 4) : -1));

  constructor() {
    this.player.setBpmIfIdle(100);
    effect(() => {
      const s = this.subdivisions.find((x) => x.id === this.sub()) ?? this.subdivisions[0];
      const accent = this.accent();
      const pattern = s.pattern.map((v, i) => (i === 0 && !accent ? 2 : v)) as Velocity[];
      const spec: BarSpec = { patterns: { click: pattern }, voices: { click: 'click' } };
      this.player.setProvider(() => spec);
    });
  }

  toggle(): void {
    this.player.resetMix();
    this.player.toggle();
  }
}

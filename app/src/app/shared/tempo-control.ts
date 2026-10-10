import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Icon } from './icon';

@Component({
  selector: 'app-tempo-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="card tempo">
      <div class="row row--between">
        <span class="label">Tempo</span>
        <button class="tap" type="button" (click)="tap()">Tap tempo</button>
      </div>
      <div class="row row--between tempo__main">
        <button class="round" type="button" aria-label="Ralentir" (click)="nudge(-2)">
          <app-icon name="minus" />
        </button>
        <div class="tempo__value">
          <span class="tempo__bpm">{{ bpm() }}</span>
          <span class="tempo__unit">BPM</span>
        </div>
        <button class="round" type="button" aria-label="Accélérer" (click)="nudge(2)">
          <app-icon name="plus" />
        </button>
      </div>
      <input
        class="slider"
        type="range"
        [min]="min()"
        [max]="max()"
        step="1"
        [value]="bpm()"
        [style.--pct.%]="pct()"
        aria-label="Tempo"
        (input)="onSlide($event)" />
      <div class="row row--between muted small">
        <span>{{ min() }}</span>
        @if (reference()) {
          <button class="ref" type="button" (click)="bpmChange.emit(reference()!)">Tempo du groupe : {{ reference() }}</button>
        }
        <span>{{ max() }}</span>
      </div>
    </div>
  `,
  styles: `
    .tempo { padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
    .tap { height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg);
      font-weight: 600; font-size: 12px; }
    .round { width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg);
      display: grid; place-items: center; }
    .tempo__value { display: flex; align-items: baseline; gap: 6px; }
    .tempo__bpm { font-family: var(--font-display); font-weight: 800; font-size: 52px; line-height: 1;
      letter-spacing: -0.03em; color: var(--accent); font-variant-numeric: tabular-nums; }
    .tempo__unit { font-weight: 600; font-size: 14px; color: var(--muted); }
    .slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px; margin: 6px 0 0;
      background: linear-gradient(to right, var(--accent) var(--pct), var(--surface-2) var(--pct)); outline: none; }
    .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%;
      background: var(--text); border: 3px solid var(--surface); }
    .slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--text); border: 3px solid var(--surface); }
    .ref { color: var(--muted); font-size: 11px; }
  `,
})
export class TempoControl {
  readonly bpm = input.required<number>();
  readonly min = input(40);
  readonly max = input(220);
  /** Tempo de référence du groupe, cliquable pour y revenir. */
  readonly reference = input<number>();
  readonly bpmChange = output<number>();

  readonly pct = computed(() => Math.max(0, Math.min(100, ((this.bpm() - this.min()) / (this.max() - this.min())) * 100)));

  private taps: number[] = [];

  nudge(delta: number): void {
    this.bpmChange.emit(this.bpm() + delta);
  }

  onSlide(event: Event): void {
    this.bpmChange.emit(Number((event.target as HTMLInputElement).value));
  }

  tap(): void {
    const now = Date.now();
    this.taps = this.taps.filter((t) => now - t < 2500);
    this.taps.push(now);
    navigator.vibrate?.(10);
    if (this.taps.length >= 3) {
      const intervals = this.taps.slice(1).map((t, i) => t - this.taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      this.bpmChange.emit(Math.round(60000 / avg));
    }
  }
}

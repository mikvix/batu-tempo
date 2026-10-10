import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HitInput } from '../audio/hit-input.service';
import { MicService } from '../audio/mic.service';
import { SettingsService } from '../state/settings.service';
import { Icon } from './icon';

/** Rangée d'étoiles (0 à 3). */
@Component({
  selector: 'app-stars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { style: 'display:inline-flex; gap:2px', '[attr.aria-label]': 'count() + " étoiles sur 3"' },
  template: `
    @for (i of [1, 2, 3]; track i) {
      <app-icon name="star" [filled]="true" [size]="size()" [style.color]="i <= count() ? 'var(--accent)' : 'var(--dim)'" />
    }
  `,
})
export class Stars {
  readonly count = input(0);
  readonly size = input(16);
}

/** Vumètre du micro, horizontal ou vertical. */
@Component({
  selector: 'app-mic-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="meter" [class.meter--v]="vertical()"><i [style.--l]="mic.level()"></i></span>`,
  styles: `
    .meter { display: block; width: 100%; height: 10px; border-radius: 5px; background: var(--surface-2); overflow: hidden; position: relative; }
    .meter i { position: absolute; left: 0; top: 0; bottom: 0; width: calc(var(--l) * 100%); background: var(--reprise); border-radius: 5px;
      transition: width 60ms linear; }
    .meter--v { width: 12px; height: 100%; }
    .meter--v i { top: auto; right: 0; width: auto; height: calc(var(--l) * 100%); transition: height 60ms linear; }
  `,
})
export class MicMeter {
  readonly mic = inject(MicService);
  readonly vertical = input(false);
}

/**
 * Pad de frappe en bas des exercices. Au micro, il montre le niveau capté ; au toucher, c'est lui
 * qu'on frappe (appui immédiat, sans attendre le relâchement). La barre d'espace marche aussi.
 */
@Component({
  selector: 'app-hit-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, MicMeter, RouterLink],
  template: `
    <div class="pad-row">
      @if (micMode()) {
        <div class="meter-col" aria-hidden="true">
          <app-mic-meter [vertical]="true" />
          <app-icon name="mic" [size]="16" style="color: var(--reprise)" />
        </div>
      }
      <button class="pad" type="button" [class.pad--quiet]="micMode()" aria-label="Frapper" (pointerdown)="hit($event)">
        <span class="pad__title">{{ micMode() ? 'Joue sur ton instrument' : 'FRAPPE' }}</span>
        <span class="pad__sub">
          {{ micMode() ? 'Le micro écoute · tu peux aussi toucher ici' : 'Touche ici ou appuie sur Espace à chaque note' }}
        </span>
      </button>
    </div>
    @if (micProblem()) {
      <p class="warn">
        Micro indisponible ({{ micProblem() }}) : l'exercice se joue au toucher.
        <a routerLink="/micro">Régler le micro</a>
      </p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .pad-row { display: flex; gap: 12px; align-items: stretch; }
    .meter-col { width: 28px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0; }
    .meter-col app-mic-meter { flex: 1; display: flex; }
    .pad { flex: 1; min-height: 96px; border-radius: 22px; border: 2px solid var(--border); background: var(--surface);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; touch-action: none;
      transition: transform 60ms, border-color 60ms; }
    .pad:active { transform: scale(0.98); border-color: var(--accent); opacity: 1; }
    .pad--quiet { min-height: 72px; }
    .pad__title { font-family: var(--font-display); font-weight: 800; font-size: 19px; }
    .pad__sub { font-size: 12px; color: var(--muted); text-align: center; padding: 0 12px; }
    .warn { margin: 0; font-size: 12px; color: var(--muted); }
    .warn a { color: var(--accent); font-weight: 700; }
  `,
})
export class HitPad {
  private readonly hits = inject(HitInput);
  private readonly micService = inject(MicService);
  private readonly settings = inject(SettingsService);
  /** Désactive le pad (avant le départ, après la fin). */
  readonly enabled = input(true);

  readonly micMode = computed(() => this.hits.activeMode() === 'micro');
  readonly micProblem = computed(() => {
    if (this.settings.settings().inputMode !== 'micro') return null;
    const s = this.micService.state();
    return s === 'denied' ? 'accès refusé' : s === 'unsupported' ? 'non pris en charge par ce navigateur' : s === 'error' ? 'erreur' : null;
  });

  hit(event: Event): void {
    event.preventDefault();
    if (this.enabled()) this.hits.tap();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.code !== 'Space' || event.repeat || !this.enabled()) return;
    const target = event.target as HTMLElement | null;
    if (target && /input|textarea|select/i.test(target.tagName)) return;
    event.preventDefault();
    this.hits.tap();
  }
}

/** Points d'avance ou de retard moyens, temps par temps, pour l'écran de résultat. */
@Component({
  selector: 'app-beat-offsets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head"><span class="label">Ton placement par temps</span><span class="muted small">tôt · · · tard</span></div>
    @for (b of beats(); track b.beat) {
      <div class="row">
        <span class="name" [class.bad]="b.bad">Temps {{ b.beat + 1 }}</span>
        <div class="track">
          <i class="zero"></i>
          @if (b.count) {
            <i class="bar" [class.bar--bad]="b.bad" [style.left]="b.left" [style.width]="b.width"></i>
          }
        </div>
        <span class="val" [class.bad]="b.bad">{{ b.count ? (b.meanMs > 0 ? '+' : '') + b.meanMs + ' ms' : '—' }}</span>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; }
    .head { display: flex; justify-content: space-between; align-items: center; }
    .row { display: flex; align-items: center; gap: 10px; }
    .name { width: 62px; font-size: 13px; font-weight: 700; }
    .track { flex: 1; height: 20px; position: relative; }
    .zero { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--border); }
    .bar { position: absolute; top: 4px; height: 12px; border-radius: 6px; background: var(--reprise); min-width: 6px; }
    .bar--bad { background: var(--break); }
    .val { width: 58px; text-align: right; font-size: 12px; color: var(--muted); }
    .bad { color: var(--break); }
  `,
})
export class BeatOffsets {
  readonly stats = input.required<{ beat: number; meanMs: number; count: number }[]>();

  /** ±80 ms occupent la demi-largeur de la piste. */
  readonly beats = computed(() =>
    this.stats().map((b) => {
      const clamped = Math.max(-80, Math.min(80, b.meanMs));
      const half = (Math.abs(clamped) / 80) * 50;
      return {
        ...b,
        bad: b.count > 0 && Math.abs(b.meanMs) > 25,
        left: clamped < 0 ? `calc(${50 - half}% )` : '50%',
        width: `${Math.max(half, 1.5)}%`,
      };
    })
  );
}

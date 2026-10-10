import { ChangeDetectionStrategy, Component, computed, inject, input, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';

import { heardNow } from '../audio/hit-input.service';
import { MicService } from '../audio/mic.service';
import { PlayerService } from '../audio/player.service';
import { BarSpec } from '../audio/sequencer';
import { startFrameLoop } from '../exercises/session';
import { Icon } from '../shared/icon';
import { MicMeter } from '../shared/exercise-ui';
import { Header } from '../shared/ui';
import { InputMode, SettingsService } from '../state/settings.service';

/** Tempo de la bille : un trajet (une arrivée sur une cible) par temps. */
const CALIBRATION_BPM = 80;
/** Arrivées où l'on regarde sans frapper, le temps de prendre le mouvement. */
const WATCH_LEGS = 2;
/** Arrivées consécutives dont les décalages doivent tenir dans STABLE_SPREAD pour valider. */
const STABLE_LEGS = 6;
const STABLE_SPREAD = 0.04;
/** Au-delà, on abandonne la mesure et on explique. */
const MAX_LEGS = 32;
/** Frappes affichées sur la piste (les plus récentes). */
const MARKERS = 8;

interface Marker {
  id: number;
  /** Instant brut de la frappe (horloge audio), sans correction. */
  raw: number;
}

/**
 * Réglage du micro : mode de jeu, sensibilité, casque, et mesure du décalage entre le son entendu
 * et la frappe captée. Une bille fait l'aller-retour entre deux cibles, un clic sonne à chaque
 * arrivée, le musicien frappe à chaque arrivée. Chaque frappe captée est posée sur la piste à
 * l'endroit où était la bille — corrigé du décalage estimé jusque-là — et l'estimation se resserre à
 * chaque trajet. Quand les 6 derniers décalages tiennent dans 40 ms (3 aller-retours), c'est réglé.
 */
@Component({
  selector: 'app-mic-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, Icon, MicMeter],
  template: `
    <div class="page page--full">
      <app-header [back]="true" fallback="/parcours" title="Régler le micro" subtitle="Une seule fois, avant le premier exercice" />

      <div class="page__scroll" style="padding-top: 18px">
        <p class="label">Comment tu joues</p>
        <div class="chip-row" style="margin-top: 10px">
          <button class="chip chip--grow" type="button" [class.chip--active]="mode() === 'micro'" (click)="setMode('micro')">
            <app-icon name="mic" [size]="16" /> Au micro
          </button>
          <button class="chip chip--grow" type="button" [class.chip--active]="mode() === 'toucher'" (click)="setMode('toucher')">Au toucher</button>
        </div>
        <p class="muted" style="margin-top: 8px">
          @if (mode() === 'micro') {
            Tu joues sur ton vrai instrument, le téléphone écoute et juge chaque frappe.
          } @else {
            Tu tapes sur l'écran (ou la barre d'espace) : pratique sans instrument, ou si le micro pose problème.
          }
        </p>

        @if (mode() === 'micro') {
          <div class="card mic" style="margin-top: 18px">
            <div class="mic__icon" [class.mic__icon--on]="mic.state() === 'on'" [class.mic__icon--hit]="flash()">
              <app-icon name="mic" [size]="32" />
            </div>
            <div class="grow stack" style="gap: 8px">
              <span class="mic__state" [style.color]="stateColor()">{{ stateLabel() }}</span>
              @if (mic.state() === 'on') {
                <app-mic-meter />
                <span class="muted small">
                  @if (hitCount() === 0) {
                    Frappe une fois : l'icône clignote à chaque frappe détectée.
                  } @else {
                    {{ hitCount() }} frappe{{ hitCount() > 1 ? 's' : '' }} détectée{{ hitCount() > 1 ? 's' : '' }} · dernière force {{ lastStrength() }}
                  }
                </span>
              } @else {
                <button class="chip chip--active" type="button" style="align-self: flex-start" (click)="enable()">Activer le micro</button>
              }
            </div>
          </div>

          <p class="label" style="margin-top: 18px">Sensibilité</p>
          <div class="chip-row" style="margin-top: 10px">
            @for (n of [1, 2, 3, 4, 5]; track n) {
              <button class="chip chip--grow" type="button" [class.chip--active]="sensitivity() === n" (click)="setSensitivity(n)">{{ n }}</button>
            }
          </div>
          <p class="muted small" style="margin-top: 8px">
            Le réglage 3 convient à un tambour joué normalement. Monte si des frappes douces sont oubliées, baisse si des bruits
            ou la musique de l'app déclenchent des frappes fantômes.
          </p>

          <div class="card stack" style="margin-top: 18px; gap: 14px">
            <div class="row row--between">
              <span class="label">Mesure du décalage</span>
              @if (running()) {
                <span class="strong" style="font-size: 13px">trajet {{ legLabel() }}</span>
              }
            </div>
            <p class="muted" style="margin: 0">
              La bille fait l'aller-retour entre les deux cibles, un clic sonne à chaque arrivée. Frappe à chaque arrivée : tes
              frappes s'affichent sur la piste et se recalent au fil des trajets.
            </p>

            <div class="track" [class.track--idle]="!running()" aria-live="polite">
              <span class="goal goal--left" [class.goal--flash]="anim().flash === 0"></span>
              <span class="goal goal--right" [class.goal--flash]="anim().flash === 1"></span>
              <i class="rail"></i>
              @for (m of markerViews(); track m.id) {
                <i class="mark" [style.left.%]="m.x" [style.opacity]="m.opacity" [style.background]="m.color"></i>
              }
              @if (running()) {
                <i class="ball" [style.left.%]="anim().x"></i>
              }
              <span class="track__hint">{{ hint() }}</span>
            </div>

            <div class="readout">
              <div class="readout__main">
                <span class="readout__ms" [style.color]="resultMs() !== null && !running() ? 'var(--reprise)' : 'var(--text)'">
                  {{ estimateMs() === null ? '—' : estimateMs() + ' ms' }}
                </span>
                <span class="muted small">{{ running() ? 'décalage estimé' : resultMs() === null ? 'pas encore mesuré' : 'décalage mesuré, compensé automatiquement' }}</span>
              </div>
              <div class="stability" [attr.aria-label]="'stabilité ' + stableCount() + ' sur ' + stableLegs">
                @for (i of stableSlots; track i) {
                  <span class="stability__dot" [class.stability__dot--on]="i < stableCount()"></span>
                }
                <span class="muted small">stable</span>
              </div>
            </div>

            @if (recentOffsets().length) {
              <div class="offsets">
                @for (o of recentOffsets(); track o.id) {
                  <span class="offset" [style.color]="o.color">{{ o.text }}</span>
                }
              </div>
            }
            @if (message()) {
              <p class="muted small" style="margin: 0; color: var(--break)">{{ message() }}</p>
            }
            <button class="action-btn" type="button" style="flex: none" (click)="running() ? stopCalibration() : calibrate()">
              <app-icon [name]="running() ? 'close' : 'refresh'" [size]="18" />
              <span>{{ running() ? 'Arrêter' : resultMs() === null ? 'Lancer la mesure' : 'Recommencer la mesure' }}</span>
            </button>
          </div>

          <div class="card stack" style="margin-top: 14px; gap: 10px; padding: 0">
            <label class="toggle">
              <span class="stack" style="gap: 2px">
                <span class="strong" style="font-size: 14px">J'écoute au casque filaire</span>
                <span class="muted small">Conseillé : le micro n'entend plus que ton instrument</span>
              </span>
              <input type="checkbox" [checked]="headphones()" (change)="setHeadphones($event)" />
            </label>
            <div class="note">
              <app-icon name="headphones" [size]="18" style="color: var(--break); flex: none" />
              <span class="muted small">Écouteurs Bluetooth déconseillés : leur retard de 150 à 250 ms fausse la mesure.</span>
            </div>
          </div>
        }
      </div>

      <div class="bottom-bar">
        <button class="action-btn action-btn--active" type="button" [disabled]="mode() === 'micro' && resultMs() === null" (click)="done()">
          <span>{{ mode() === 'micro' && resultMs() === null ? 'Fais d’abord la mesure' : 'C’est réglé' }}</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    .mic { display: flex; align-items: center; gap: 16px; }
    .mic__icon { width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center; flex: none;
      background: var(--surface-2); color: var(--muted); transition: transform 80ms, box-shadow 80ms; }
    .mic__icon--on { background: rgba(62, 207, 166, 0.15); color: var(--reprise); box-shadow: 0 0 0 8px rgba(62, 207, 166, 0.06); }
    .mic__icon--hit { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(62, 207, 166, 0.3); }
    .mic__state { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }

    .track { position: relative; height: 96px; margin: 4px 0; }
    .rail { position: absolute; left: 24px; right: 24px; top: 34px; height: 4px; border-radius: 2px; background: var(--surface-2); }
    .goal { position: absolute; top: 12px; width: 48px; height: 48px; border-radius: 50%; border: 3px solid var(--border); background: var(--surface-2);
      transition: background 70ms, border-color 70ms, transform 70ms; }
    .goal--left { left: 0; }
    .goal--right { right: 0; }
    .goal--flash { background: var(--accent); border-color: var(--accent); transform: scale(1.12); }
    .track--idle .goal { opacity: 0.6; }
    .ball { position: absolute; top: 22px; width: 28px; height: 28px; margin-left: -14px; border-radius: 50%; background: var(--text);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); will-change: left; }
    .mark { position: absolute; top: 64px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; transition: left 120ms; }
    .track__hint { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font-size: 12px; font-weight: 700; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.06em; }
    .readout { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-soft); padding-top: 10px; }
    .readout__main { display: flex; flex-direction: column; gap: 2px; }
    .readout__ms { font-family: var(--font-display); font-weight: 800; font-size: 32px; line-height: 1; }
    .stability { display: flex; align-items: center; gap: 5px; }
    .stability__dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface-2); }
    .stability__dot--on { background: var(--reprise); }
    .offsets { display: flex; flex-wrap: wrap; gap: 6px; }
    .offset { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); }
    .toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border-soft); }
    .toggle input { width: 22px; height: 22px; accent-color: var(--accent); flex: none; }
    .note { display: flex; gap: 10px; align-items: flex-start; padding: 0 16px 14px; }
    .action-btn:disabled { opacity: 0.5; }
  `,
})
export class MicSetupPage implements OnDestroy {
  /** Query param `?retour=` : page à rouvrir une fois le réglage fait. */
  readonly retour = input<string>();

  readonly mic = inject(MicService);
  private readonly player = inject(PlayerService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);

  readonly stableLegs = STABLE_LEGS;
  readonly stableSlots = Array.from({ length: STABLE_LEGS }, (_, i) => i);
  readonly mode = computed(() => this.settings.settings().inputMode);
  readonly sensitivity = computed(() => this.settings.settings().micSensitivity);
  readonly headphones = computed(() => this.settings.settings().headphones);
  readonly resultMs = signal<number | null>(this.settings.settings().micLatencyMs);
  readonly running = signal(false);
  readonly message = signal<string | null>(null);
  readonly hitCount = signal(0);
  readonly lastStrength = signal('');
  readonly flash = signal(false);

  /** Horloge de l'animation : instant entendu, et départ de la bille (cible gauche, premier clic). */
  private readonly now = signal(0);
  private readonly start = signal(0);
  private readonly leg = 60 / CALIBRATION_BPM;
  /** Décalage brut (frappe − arrivée) par arrivée, null si aucune frappe pour cette arrivée. */
  private readonly offsets = signal<(number | null)[]>([]);
  private readonly markers = signal<Marker[]>([]);
  private markerSeq = 0;

  /** Estimation courante : médiane des 8 derniers décalages connus (au moins 3), sinon la valeur enregistrée. */
  private readonly estimate = computed<number | null>(() => {
    const known = this.offsets().filter((v): v is number => v !== null).slice(-8);
    if (known.length < 3) return this.resultMs() === null ? null : this.resultMs()! / 1000;
    return median(known);
  });
  readonly estimateMs = computed(() => (this.estimate() === null ? null : Math.round(this.estimate()! * 1000)));

  /** Nombre d'arrivées consécutives, en partant de la plus récente, dont les décalages tiennent dans la tolérance. */
  readonly stableCount = computed(() => {
    const o = this.offsets();
    const tail: number[] = [];
    for (let i = o.length - 1; i >= 0 && tail.length < STABLE_LEGS; i--) {
      const v = o[i];
      if (v === null) break;
      tail.push(v);
      if (Math.max(...tail) - Math.min(...tail) > STABLE_SPREAD) {
        tail.pop();
        break;
      }
    }
    return tail.length;
  });

  /** Position de la bille (0 = cible gauche, 100 = cible droite) à un instant entendu. */
  private ballX(at: number): number {
    const t = (at - this.start()) / this.leg;
    const k = Math.floor(t);
    const frac = t - k;
    return (k % 2 === 0 ? frac : 1 - frac) * 100;
  }

  readonly anim = computed(() => {
    if (!this.running()) return { x: 0, flash: -1 };
    const t = (this.now() - this.start()) / this.leg;
    const k = Math.floor(t);
    const frac = t - k;
    // La cible qui vient d'être touchée s'allume brièvement : gauche aux arrivées paires, droite aux impaires.
    const flash = k >= 0 && frac < 0.12 ? k % 2 : -1;
    return { x: Math.max(0, Math.min(100, this.ballX(this.now()))), flash };
  });

  readonly legLabel = computed(() => {
    const k = Math.floor((this.now() - this.start()) / this.leg);
    return `${Math.max(0, k)} / ${MAX_LEGS}`;
  });

  readonly hint = computed(() => {
    if (!this.running()) return this.resultMs() === null ? 'prêt' : 'mesuré';
    const k = Math.floor((this.now() - this.start()) / this.leg);
    if (k < WATCH_LEGS) return 'regarde la bille, ne frappe pas encore';
    return this.stableCount() >= STABLE_LEGS - 1 ? 'encore une…' : 'frappe à chaque arrivée';
  });

  /** Frappes posées sur la piste, à l'endroit où était la bille une fois le décalage estimé retiré. */
  readonly markerViews = computed(() => {
    const est = this.estimate() ?? 0;
    const list = this.markers();
    return list.map((m, i) => {
      const x = Math.max(0, Math.min(100, this.ballX(m.raw - est)));
      const err = Math.min(Math.abs(x), Math.abs(100 - x));
      return { id: m.id, x, opacity: 0.35 + (0.65 * (i + 1)) / list.length, color: err < 8 ? 'var(--reprise)' : err < 20 ? 'var(--accent)' : 'var(--break)' };
    });
  });

  readonly recentOffsets = computed(() => {
    const est = this.estimate();
    return this.offsets()
      .map((v, i) => ({ v, i }))
      .filter(({ i }) => i >= WATCH_LEGS)
      .slice(-8)
      .map(({ v, i }) => {
        if (v === null) return { id: i, text: '×', color: 'var(--break)' };
        const ms = Math.round(v * 1000);
        const off = est === null ? 0 : Math.abs(v - est);
        return { id: i, text: `${ms >= 0 ? '+' : ''}${ms}`, color: off <= STABLE_SPREAD / 2 ? 'var(--reprise)' : off <= STABLE_SPREAD ? 'var(--accent)' : 'var(--break)' };
      });
  });

  readonly stateLabel = computed(() => {
    switch (this.mic.state()) {
      case 'on':
        return 'Micro actif';
      case 'starting':
        return 'Activation…';
      case 'denied':
        return 'Accès au micro refusé';
      case 'unsupported':
        return 'Micro non pris en charge ici';
      case 'error':
        return 'Micro indisponible';
      default:
        return 'Micro coupé';
    }
  });
  readonly stateColor = computed(() => (this.mic.state() === 'on' ? 'var(--reprise)' : this.mic.state() === 'off' ? 'var(--muted)' : 'var(--break)'));

  private offHit: (() => void) | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private stopRun: (() => void) | null = null;

  constructor() {
    this.player.stop();
    if (this.mode() === 'micro') void this.enable();
  }

  ngOnDestroy(): void {
    this.stopRun?.();
    this.offHit?.();
    this.player.stop();
    this.mic.stop();
  }

  setMode(mode: InputMode): void {
    this.settings.update({ inputMode: mode });
    if (mode === 'micro') void this.enable();
    else {
      this.stopCalibration();
      this.mic.stop();
    }
  }

  async enable(): Promise<void> {
    if (!(await this.mic.start())) {
      this.message.set(
        this.mic.state() === 'denied'
          ? 'Autorise le micro pour ce site dans les réglages du navigateur, puis réessaie.'
          : 'Le micro n’a pas pu démarrer. Tu peux jouer au toucher.'
      );
      return;
    }
    this.message.set(null);
    this.mic.setSensitivity(this.sensitivity());
    this.offHit?.();
    this.offHit = this.mic.onHit((hit) => {
      this.hitCount.update((n) => n + 1);
      this.lastStrength.set(hit.strength.toFixed(2));
      this.flash.set(true);
      if (this.flashTimer) clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => this.flash.set(false), 120);
      if (this.running()) this.onCalibrationHit(hit.time);
    });
  }

  setSensitivity(n: number): void {
    this.settings.update({ micSensitivity: n });
    this.mic.setSensitivity(n);
  }

  setHeadphones(event: Event): void {
    this.settings.update({ headphones: (event.target as HTMLInputElement).checked });
  }

  async calibrate(): Promise<void> {
    if (this.running()) return;
    if (this.mic.state() !== 'on') await this.enable();
    if (this.mic.state() !== 'on') return;

    this.message.set(null);
    this.offsets.set([]);
    this.markers.set([]);

    // Clics seuls, un par temps, tant que la mesure tourne.
    const spec: BarSpec = { patterns: {}, voices: {}, click: true };
    this.player.stop();
    this.player.resetMix();
    this.player.setBpm(CALIBRATION_BPM);
    this.player.setProvider(() => spec);
    await this.player.play();

    this.start.set(this.player.sequencer.startTime);
    this.now.set(heardNow());
    this.running.set(true);
    const stopLoop = startFrameLoop(() => this.frame());
    this.stopRun = () => {
      stopLoop();
      this.player.stop();
      this.running.set(false);
      this.stopRun = null;
    };
  }

  stopCalibration(): void {
    this.stopRun?.();
  }

  private frame(): void {
    const now = heardNow();
    this.now.set(now);
    const k = Math.floor((now - this.start()) / this.leg);
    // Une arrivée sans frappe est actée une fois sa fenêtre de rattrapage passée (demi-trajet).
    const settled = Math.floor((now - this.start()) / this.leg - 0.5);
    if (settled >= 0 && this.offsets().length < settled + 1) {
      this.offsets.update((o) => {
        const next = o.slice();
        while (next.length < settled + 1) next.push(null);
        return next;
      });
    }
    if (this.stableCount() >= STABLE_LEGS) {
      this.finish();
    } else if (k >= MAX_LEGS) {
      this.stopRun?.();
      const known = this.offsets().filter((v) => v !== null).length;
      this.message.set(
        known < STABLE_LEGS
          ? 'Peu de frappes captées. Rapproche le micro de l’instrument ou monte la sensibilité, puis recommence.'
          : 'Les frappes n’étaient pas assez régulières pour valider. Recommence en frappant bien à chaque arrivée de la bille.'
      );
    }
  }

  /** Une frappe pendant la mesure : rattachée à l'arrivée la plus proche (à un demi-trajet près). */
  private onCalibrationHit(raw: number): void {
    this.markers.update((m) => [...m, { id: this.markerSeq++, raw }].slice(-MARKERS));
    const k = Math.round((raw - this.start()) / this.leg);
    if (k < WATCH_LEGS) return;
    const offset = raw - (this.start() + k * this.leg);
    this.offsets.update((o) => {
      const next = o.slice();
      while (next.length < k + 1) next.push(null);
      // Première frappe de l'arrivée seulement : un rebond ou une double ne compte pas.
      if (next[k] === null) next[k] = offset;
      return next;
    });
  }

  private finish(): void {
    const known = this.offsets().filter((v): v is number => v !== null).slice(-STABLE_LEGS);
    const ms = Math.max(0, Math.round(median(known) * 1000));
    this.stopRun?.();
    this.resultMs.set(ms);
    this.settings.update({ micLatencyMs: ms });
  }

  done(): void {
    const target = this.retour();
    void this.router.navigateByUrl(target && target.startsWith('/') ? target : '/parcours', { replaceUrl: true });
  }
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

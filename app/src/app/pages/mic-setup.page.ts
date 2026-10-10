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

type ClickState = 'pending' | 'now' | 'ok' | 'miss';

const CLICKS = 8;
/** Clics de décompte, écoutés sans frapper, avant les clics mesurés. */
const COUNT_IN = 4;
const CALIBRATION_BPM = 90;

/**
 * Réglage du micro : autorisation, sensibilité, et mesure du décalage total du téléphone
 * (sortie haut-parleur + entrée micro). On joue 8 clics, le musicien frappe avec eux, et la
 * médiane des écarts devient la correction appliquée à toutes les frappes captées ensuite.
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
                <span class="muted small">Frappe une fois : la jauge monte et l'icône clignote à chaque frappe détectée ({{ hitCount() }}).</span>
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
            Monte la sensibilité si des frappes sont oubliées, baisse-la si des bruits ou la musique de l'app déclenchent des frappes fantômes.
          </p>

          <div class="card stack" style="margin-top: 18px; gap: 14px">
            <div class="row row--between">
              <span class="label">Mesure du décalage · {{ bpm }} BPM</span>
              <span class="strong" style="font-size: 13px">{{ matched() }} / {{ clicks }}</span>
            </div>
            <p class="muted" style="margin: 0">
              Pose le téléphone à un mètre de ton instrument. Écoute les 4 clics du décompte, puis frappe quand l'anneau touche le cercle.
            </p>
            <div class="target-zone" aria-live="polite">
              <div class="target" [class.target--flash]="cal().flash" [class.target--count]="cal().stage === 'decompte'">
                @if (cal().ring !== null) {
                  <i class="ring" [style.transform]="'scale(' + cal().ring + ')'"></i>
                }
                <span class="target__big">{{ cal().big }}</span>
                <span class="target__small">{{ cal().small }}</span>
              </div>
              @if (lastOffset(); as o) {
                <span class="last" [style.color]="o.color">{{ o.text }}</span>
              }
            </div>
            <div class="dots">
              @for (c of clickStates(); track $index) {
                <span class="dot" [class]="'dot dot--' + c"></span>
              }
            </div>
            @if (resultMs() !== null) {
              <div class="result">
                <span class="result__ms">{{ resultMs() }} ms</span>
                <span class="muted">de décalage mesuré, compensé automatiquement</span>
              </div>
            }
            @if (message()) {
              <p class="muted small" style="margin: 0; color: var(--break)">{{ message() }}</p>
            }
            <button class="action-btn" type="button" style="flex: none" [disabled]="running()" (click)="calibrate()">
              <app-icon name="refresh" [size]="18" />
              <span>{{ running() ? 'Écoute en cours…' : resultMs() === null ? 'Lancer la mesure' : 'Recommencer la mesure' }}</span>
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
    .target-zone { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 8px 0 4px; }
    .target { position: relative; width: 150px; height: 150px; border-radius: 50%; background: var(--surface-2); border: 3px solid var(--border);
      display: flex; flex-direction: column; align-items: center; justify-content: center; transition: background 60ms, border-color 60ms, transform 60ms; }
    .target--count { border-style: dashed; }
    .target--flash { background: var(--accent); border-color: var(--accent); color: var(--on-accent); transform: scale(1.04); }
    .target--flash .target__small { color: var(--on-accent); }
    .ring { position: absolute; inset: -3px; border-radius: 50%; border: 4px solid var(--accent); pointer-events: none; }
    .target__big { font-family: var(--font-display); font-weight: 800; font-size: 40px; line-height: 1; }
    .target__small { font-size: 12px; font-weight: 700; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    .last { font-size: 13px; font-weight: 700; min-height: 18px; }
    .dots { display: flex; justify-content: space-between; }
    .dot { width: 30px; height: 30px; border-radius: 50%; background: var(--surface-2); transition: background 80ms; }
    .dot--now { box-shadow: 0 0 0 3px var(--text); }
    .dot--ok { background: var(--reprise); }
    .dot--miss { background: var(--break); }
    .result { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--border-soft); padding-top: 10px; }
    .result__ms { font-family: var(--font-display); font-weight: 800; font-size: 34px; color: var(--reprise); }
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

  readonly clicks = CLICKS;
  readonly bpm = CALIBRATION_BPM;
  readonly mode = computed(() => this.settings.settings().inputMode);
  readonly sensitivity = computed(() => this.settings.settings().micSensitivity);
  readonly headphones = computed(() => this.settings.settings().headphones);
  readonly resultMs = signal<number | null>(this.settings.settings().micLatencyMs);
  readonly clickStates = signal<ClickState[]>(new Array(CLICKS).fill('pending'));
  readonly matched = computed(() => this.clickStates().filter((c) => c === 'ok').length);
  readonly running = signal(false);
  readonly message = signal<string | null>(null);
  readonly hitCount = signal(0);
  readonly flash = signal(false);
  readonly lastOffset = signal<{ text: string; color: string } | null>(null);

  /** Horloge de l'animation de mesure : instant entendu, et départ du premier clic. */
  private readonly now = signal(0);
  private calStart = 0;
  private readonly beat = 60 / CALIBRATION_BPM;

  /**
   * État de la cible pendant la mesure : grand chiffre au centre, anneau qui se resserre sur le
   * cercle et le touche à l'instant du prochain clic mesuré, éclair du cercle sur chaque clic.
   */
  readonly cal = computed(() => {
    if (!this.running()) {
      return { stage: 'repos', big: this.resultMs() === null ? '?' : '✓', small: this.resultMs() === null ? 'prêt' : 'mesuré', ring: null as number | null, flash: false };
    }
    const t = (this.now() - this.calStart) / this.beat;
    const b = Math.floor(t);
    const frac = t - b;
    const flash = b >= 0 && b < COUNT_IN + CLICKS && frac < 0.14;
    const next = b + 1;
    const ring = next >= COUNT_IN && next < COUNT_IN + CLICKS ? 1 + (1 - frac) * 1.1 : b === -1 ? 1 + (1 - (t + 1)) * 1.1 : null;
    if (b < COUNT_IN) {
      return {
        stage: 'decompte',
        big: b < 0 ? '…' : String(COUNT_IN - b),
        small: b === COUNT_IN - 1 ? 'prépare-toi' : 'écoute, ne frappe pas',
        ring: next >= COUNT_IN ? ring : null,
        flash,
      };
    }
    if (b < COUNT_IN + CLICKS) {
      // Entre deux clics, on annonce le prochain : c'est lui que l'anneau vise.
      const upcoming = b - COUNT_IN + 2;
      return {
        stage: 'mesure',
        big: flash ? 'Frappe' : upcoming <= CLICKS ? String(upcoming) : '✓',
        small: flash ? `clic ${b - COUNT_IN + 1} / ${CLICKS}` : upcoming <= CLICKS ? `prochain clic · ${upcoming} / ${CLICKS}` : 'dernier clic',
        ring,
        flash,
      };
    }
    return { stage: 'fin', big: '✓', small: 'calcul…', ring: null, flash: false };
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
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.player.stop();
    if (this.mode() === 'micro') void this.enable();
  }

  ngOnDestroy(): void {
    this.offHit?.();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.player.stop();
    this.mic.stop();
  }

  setMode(mode: InputMode): void {
    this.settings.update({ inputMode: mode });
    if (mode === 'micro') void this.enable();
    else this.mic.stop();
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
    this.offHit = this.mic.onHit(() => {
      this.hitCount.update((n) => n + 1);
      this.flash.set(true);
      if (this.flashTimer) clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => this.flash.set(false), 120);
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
    this.lastOffset.set(null);
    this.clickStates.set(new Array(CLICKS).fill('pending'));

    // Une mesure de décompte puis deux mesures mesurées, clics seuls, puis arrêt.
    const spec: BarSpec = { patterns: {}, voices: {}, click: true };
    this.player.stop();
    this.player.resetMix();
    this.player.setBpm(CALIBRATION_BPM);
    this.player.setProvider((bar) => (bar < (COUNT_IN + CLICKS) / 4 ? spec : null));
    await this.player.play();

    const beat = this.beat;
    const start = this.player.sequencer.startTime;
    this.calStart = start;
    this.now.set(heardNow());
    this.running.set(true);
    const stopLoop = startFrameLoop(() => this.now.set(heardNow()));
    const clickTimes = Array.from({ length: CLICKS }, (_, i) => start + (COUNT_IN + i) * beat);
    const offsets: (number | null)[] = new Array(CLICKS).fill(null);

    const stopListening = this.mic.onHit((hit) => {
      // Première frappe dans la fenêtre [-150 ms, +450 ms] d'un clic encore libre.
      const i = clickTimes.findIndex((c, k) => offsets[k] === null && hit.time >= c - 0.15 && hit.time <= c + 0.45);
      if (i < 0) return;
      offsets[i] = hit.time - clickTimes[i];
      this.clickStates.update((s) => s.map((v, k) => (k === i ? 'ok' : v)));
      const ms = Math.round(offsets[i]! * 1000);
      this.lastOffset.set({ text: `Clic ${i + 1} : frappe captée (${ms >= 0 ? '+' : ''}${ms} ms)`, color: 'var(--reprise)' });
    });

    const poll = () => {
      const heard = heardNow();
      const current = clickTimes.findIndex((c, k) => heard >= c - 0.05 && heard < c + beat - 0.05 && offsets[k] === null);
      this.clickStates.update((s) =>
        s.map((v, k) => (v === 'ok' ? 'ok' : heard > clickTimes[k] + 0.45 ? 'miss' : k === current ? 'now' : 'pending'))
      );
      if (heard < clickTimes[CLICKS - 1] + 0.6) {
        this.pollTimer = setTimeout(poll, 40);
        return;
      }
      stopListening();
      stopLoop();
      this.running.set(false);
      this.finish(offsets);
    };
    poll();
  }

  private finish(offsets: (number | null)[]): void {
    const values = offsets.filter((v): v is number => v !== null).sort((a, b) => a - b);
    if (values.length < 5) {
      this.message.set('Pas assez de frappes détectées. Rapproche le téléphone ou monte la sensibilité, puis recommence.');
      return;
    }
    const median = values[Math.floor(values.length / 2)];
    const spread = values[values.length - 1] - values[0];
    if (spread > 0.2) {
      this.message.set('Les frappes étaient irrégulières : recommence en restant bien calé sur les clics.');
      return;
    }
    const ms = Math.max(0, Math.round(median * 1000));
    this.resultMs.set(ms);
    this.settings.update({ micLatencyMs: ms });
  }

  done(): void {
    const target = this.retour();
    void this.router.navigateByUrl(target && target.startsWith('/') ? target : '/parcours', { replaceUrl: true });
  }
}

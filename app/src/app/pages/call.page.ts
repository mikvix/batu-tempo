import { ChangeDetectionStrategy, Component, computed, inject, input, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { heardNow, Hit, HitInput } from '../audio/hit-input.service';
import { PlayerService } from '../audio/player.service';
import { BarSpec } from '../audio/sequencer';
import { getInstrument } from '../data/rhythms';
import { parsePattern, STEPS_PER_BAR, Velocity } from '../data/types';
import { buildTargets, expireTargets, judgeHit, MISS_AFTER, Target, xpFor } from '../exercises/judge';
import { restoreMix, startFrameLoop } from '../exercises/session';
import { HitPad, Stars } from '../shared/exercise-ui';
import { Icon } from '../shared/icon';
import { Header } from '../shared/ui';
import { ProgressService } from '../state/progress.service';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { InputMode, SettingsService } from '../state/settings.service';

/** Appels d'une mesure, du plus simple au plus difficile. */
const CALLS = [
  'X... X... X... X...',
  'X.X. X... X.X. X...',
  'X... X.X. X... X.X.',
  'X..X ..X. X... X...',
  'X.XX X... X.XX X...',
  'X..X ..X. ..X. X...',
  'XX.X .X.X X... X...',
  'X.XX .XX. X.X. XXX.',
].map(parsePattern);

const LIVES = 3;
/** Part minimale de notes justes pour réussir une manche. */
const PASS_RATE = 0.6;

type RoundResult = 'pending' | 'ok' | 'fail';
type Phase = 'ready' | 'playing' | 'done';

/**
 * Appel et réponse : le repique joue un appel d'une mesure, le musicien le reproduit la mesure
 * suivante. Huit manches de difficulté croissante, trois vies.
 */
@Component({
  selector: 'app-call-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, Icon, HitPad, Stars, RouterLink],
  template: `
    <div class="page page--full">
      <app-header [back]="true" fallback="/parcours" title="Appel et réponse" [subtitle]="'Le repique appelle, ' + instrument().name.toLowerCase() + ' répond · ' + bpm() + ' BPM'">
        <span class="lives" [attr.aria-label]="lives() + ' vies sur 3'">
          @for (i of [1, 2, 3]; track i) {
            <svg width="18" height="18" viewBox="0 0 24 24" [attr.fill]="i <= lives() ? 'var(--break)' : 'var(--dim)'" aria-hidden="true">
              <path d="M12 21s-7-4.4-9.3-9A5.3 5.3 0 0 1 12 6.6 5.3 5.3 0 0 1 21.3 12C19 16.6 12 21 12 21z" />
            </svg>
          }
        </span>
      </app-header>

      <div class="body">
        <div class="segments">
          @for (r of results(); track $index; let i = $index) {
            <i [class]="'seg seg--' + r" [class.seg--now]="phase() === 'playing' && i === round()"></i>
          }
        </div>

        @if (phase() !== 'done') {
          <p class="muted small" style="margin: 0">Manche {{ round() + 1 }} sur {{ total }} · les appels se compliquent à chaque manche</p>

          <div class="card call" [class.call--dim]="stage() !== 'ecoute'">
            <div class="row row--between">
              <span class="badge" style="background: var(--blue); color: var(--bg)">1 · ÉCOUTE</span>
              <span class="muted small">Repique · 1 mesure</span>
            </div>
            <div class="cells">
              @for (v of callCells(); track $index; let i = $index) {
                <i class="cell" [class.cell--group]="i > 0 && i % 4 === 0" [class.cell--on]="v > 0" [class.cell--now]="stage() === 'ecoute' && step() === i" style="--c: var(--blue)"></i>
              }
            </div>
          </div>

          <div class="card call" [class.call--active]="stage() === 'reponse'">
            <div class="row row--between">
              <span class="badge" style="background: var(--accent); color: var(--on-accent)">2 · À TOI</span>
              @if (stage() === 'reponse') {
                <span class="listening"><app-icon name="mic" [size]="14" /> J'écoute…</span>
              }
            </div>
            <span class="strong" style="font-size: 16px">Réponds avec le même dessin</span>
            <div class="cells">
              @for (c of answerCells(); track $index; let i = $index) {
                <i class="cell cell--tall" [class]="'cell cell--tall cell--' + c" [class.cell--group]="i > 0 && i % 4 === 0" [class.cell--now]="stage() === 'reponse' && step() === i"></i>
              }
            </div>
            <div class="legend muted small">
              <span><i style="background: var(--reprise)"></i>pile</span>
              <span><i style="background: var(--accent)"></i>décalé</span>
              <span><i style="background: var(--break)"></i>manqué</span>
              <span><i class="dashed"></i>à venir</span>
            </div>
          </div>

          <div class="beat-dots">
            @for (b of [0, 1, 2, 3]; track b) {
              <span class="beat-dot" [class.beat-dot--on]="beat() === b" [style.background]="beat() === b ? 'var(--accent)' : null" [style.color]="beat() === b ? 'var(--on-accent)' : null">{{ b + 1 }}</span>
            }
          </div>

          @if (phase() === 'ready') {
            <div class="card stack" style="gap: 12px; align-items: center; text-align: center">
              <span class="muted">Une mesure de décompte (ne joue pas encore), puis le repique joue l'appel. Rejoue exactement le même dessin la mesure suivante.</span>
              @if (needsSetup()) {
                <a class="chip chip--active" [routerLink]="['/micro']" [queryParams]="{ retour: here() }"><app-icon name="mic" [size]="16" /> Régler le micro d'abord</a>
                <button class="chip" type="button" (click)="start('toucher')">Jouer au toucher cette fois</button>
              } @else {
                <button class="start" type="button" (click)="start()"><app-icon name="play" [size]="20" [filled]="true" /> Démarrer</button>
              }
            </div>
          } @else {
            <app-hit-pad [enabled]="phase() === 'playing'" />
          }
        } @else {
          <div class="stack" style="align-items: center; gap: 10px; text-align: center; padding-top: 10px">
            <app-stars [count]="stars()" [size]="40" />
            <span class="display" style="font-size: 28px">{{ passed() }} manche{{ passed() > 1 ? 's' : '' }} sur {{ total }}</span>
            <span class="muted">
              @if (lives() > 0) {
                Toutes les manches jouées.
              } @else {
                Plus de vies : l’appel {{ round() + 1 }} t’a résisté.
              }
            </span>
            <span class="strong" style="color: var(--accent)">+{{ xp() }} XP</span>
          </div>
          <div class="tip">
            <span class="strong">{{ passed() >= 6 ? 'Belle oreille' : 'Écoute avant de jouer' }}</span>
            <span class="muted">{{ passed() >= 6
              ? 'Tu reproduis les appels du premier coup. En répétition, l’appel annonce toujours la suite : break, changement de groove ou arrêt.'
              : 'Pendant l’appel, ne joue pas : chante-le dans ta tête sur les quatre temps, puis rejoue-le tel quel.' }}</span>
          </div>
          <div class="chip-row">
            <button class="action-btn" type="button" (click)="phase.set('ready')"><app-icon name="refresh" [size]="18" /><span>Rejouer</span></button>
            <a class="action-btn" routerLink="/parcours"><app-icon name="route" [size]="18" /><span>Parcours</span></a>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .lives { display: inline-flex; gap: 4px; }
    .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; padding: 16px var(--gutter) calc(var(--safe-bottom) + 20px); overflow-y: auto; }
    .segments { display: flex; gap: 6px; }
    .seg { flex: 1; height: 6px; border-radius: 3px; background: var(--surface-2); }
    .seg--ok { background: var(--reprise); }
    .seg--fail { background: var(--break); }
    .seg--now { background: var(--accent); }
    .call { display: flex; flex-direction: column; gap: 12px; transition: opacity 120ms; }
    .call--dim { opacity: 0.55; }
    .call--active { border: 2px solid var(--accent); }
    .listening { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--reprise); }
    .cells { display: flex; gap: 4px; }
    .cell { flex: 1; height: 34px; border-radius: 6px; background: var(--surface-2); }
    .cell--tall { height: 44px; border-radius: 8px; }
    .cell--group { margin-left: 6px; }
    .cell--on { background: var(--c); }
    .cell--now { outline: 2px solid var(--text); outline-offset: -2px; }
    .cell--pending { background: transparent; border: 2px dashed var(--accent); }
    .cell--perfect { background: var(--reprise); }
    .cell--good { background: var(--accent); }
    .cell--miss { background: var(--break); }
    .legend { display: flex; gap: 14px; flex-wrap: wrap; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 10px; height: 10px; border-radius: 3px; }
    .legend i.dashed { border: 2px dashed var(--accent); }
    .start { height: 54px; padding: 0 26px; border-radius: 16px; background: var(--accent); color: var(--on-accent); font-weight: 700; font-size: 15px;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .tip { padding: 14px 16px; border-radius: 18px; background: rgba(242,177,52,0.1); border: 1px solid rgba(242,177,52,0.35); display: flex; flex-direction: column; gap: 4px; }
  `,
})
export class CallPage implements OnDestroy {
  readonly rhythm = input.required<string>();
  readonly inst = input<string>();
  readonly etape = input<string>();

  private readonly player = inject(PlayerService);
  private readonly hits = inject(HitInput);
  private readonly library = inject(RhythmLibrary);
  private readonly settings = inject(SettingsService);
  private readonly progressService = inject(ProgressService);
  private readonly router = inject(Router);

  readonly total = CALLS.length;
  readonly rhythmDef = computed(() => this.library.get(this.rhythm()));
  readonly instrument = computed(() => getInstrument(this.rhythmDef(), this.inst() ?? this.settings.myInstrumentFor(this.rhythmDef().id)));
  /** Tempo confortable pour l'oreille : celui du rythme, plafonné à 100 BPM. */
  readonly bpm = computed(() => Math.min(100, this.rhythmDef().bpm));
  readonly needsSetup = computed(() => this.settings.settings().inputMode === 'micro' && this.settings.settings().micLatencyMs === null);

  readonly phase = signal<Phase>('ready');
  readonly now = signal(0);
  readonly targets = signal<Target[]>([]);
  readonly results = signal<RoundResult[]>(CALLS.map(() => 'pending'));
  readonly lives = signal(LIVES);
  readonly xp = signal(0);
  private startTime = 0;

  readonly barLength = computed(() => (60 / this.bpm()) * 4);
  /** Mesure en cours depuis le départ (0 = décompte). */
  readonly barIndex = computed(() => (this.phase() === 'playing' ? Math.floor((this.now() - this.startTime) / this.barLength()) : 0));
  readonly round = computed(() => Math.min(this.total - 1, Math.max(0, Math.floor((this.barIndex() - 1) / 2))));
  readonly stage = computed<'decompte' | 'ecoute' | 'reponse'>(() => {
    const b = this.barIndex();
    return b < 1 ? 'decompte' : b % 2 === 1 ? 'ecoute' : 'reponse';
  });
  readonly step = computed(() => {
    const t = this.now() - this.startTime - this.barIndex() * this.barLength();
    return this.phase() === 'playing' ? Math.floor((t / this.barLength()) * STEPS_PER_BAR) : -1;
  });
  readonly beat = computed(() => (this.step() >= 0 ? Math.floor(this.step() / 4) : -1));

  readonly callCells = computed<Velocity[]>(() => CALLS[this.round()]);
  readonly answerCells = computed(() => {
    const answerBar = 2 + 2 * this.round();
    const byStep = new Map(this.targets().filter((t) => t.bar === answerBar).map((t) => [t.step, t.state]));
    return this.callCells().map((v, i) => (v > 0 ? (byStep.get(i) ?? 'pending') : 'empty'));
  });

  readonly passed = computed(() => this.results().filter((r) => r === 'ok').length);
  readonly stars = computed(() => {
    const p = this.passed();
    return p >= 8 ? 3 : p >= 6 ? 2 : p >= 4 ? 1 : 0;
  });

  private stopLoop: (() => void) | null = null;
  private stopHits: (() => void) | null = null;

  constructor() {
    this.player.stop();
  }

  ngOnDestroy(): void {
    this.cleanup();
    restoreMix(this.player);
  }

  here(): string {
    return this.router.url;
  }

  async start(mode?: InputMode): Promise<void> {
    this.cleanup();
    this.results.set(CALLS.map(() => 'pending'));
    this.lives.set(LIVES);

    await this.hits.start(mode);
    this.stopHits = this.hits.onHit((hit) => this.onHit(hit));

    const countIn: BarSpec = { patterns: {}, voices: {}, click: true };
    const answer: BarSpec = { patterns: {}, voices: {}, click: true };
    const calls: BarSpec[] = CALLS.map((p) => ({ patterns: { call: p }, voices: { call: 'repique' }, click: true }));
    restoreMix(this.player);
    this.player.setBpm(this.bpm());
    this.player.setProvider((bar) => {
      if (bar === 0) return countIn;
      const r = Math.floor((bar - 1) / 2);
      if (r >= CALLS.length) return null;
      return (bar - 1) % 2 === 0 ? calls[r] : answer;
    });
    await this.player.play();

    this.startTime = this.player.sequencer.startTime;
    // Décompte : on mesure le clic de l'app repris par le micro, pour ne pas le compter ensuite.
    this.hits.measureNoise(this.startTime, this.startTime + this.barLength());
    const sixteenth = this.barLength() / STEPS_PER_BAR;
    const targets: Target[] = [];
    CALLS.forEach((p, r) => {
      for (const t of buildTargets(p, this.startTime, sixteenth, 2 + 2 * r, 1, () => 0)) targets.push({ ...t, id: targets.length });
    });
    this.targets.set(targets);
    this.now.set(heardNow());
    this.phase.set('playing');
    this.stopLoop = startFrameLoop(() => this.frame());
  }

  private frame(): void {
    const now = heardNow();
    this.now.set(now);
    const expired = expireTargets(this.targets(), now);
    if (expired) this.targets.set(expired.targets);

    // Bilan de chaque manche dès que sa mesure de réponse est passée.
    const results = this.results();
    results.forEach((res, r) => {
      if (res !== 'pending') return;
      const answerBar = 2 + 2 * r;
      if (now < this.startTime + (answerBar + 1) * this.barLength() + MISS_AFTER) return;
      const round = this.targets().filter((t) => t.bar === answerBar);
      const score = round.filter((t) => t.state === 'perfect').length + 0.6 * round.filter((t) => t.state === 'good').length;
      const ok = round.length > 0 && score / round.length >= PASS_RATE;
      this.results.update((list) => list.map((v, k) => (k === r ? (ok ? 'ok' : 'fail') : v)));
      if (!ok) this.lives.update((l) => l - 1);
    });

    const allDone = this.results().every((r) => r !== 'pending');
    if (this.lives() <= 0 || allDone) this.finish();
  }

  private onHit(hit: Hit): void {
    // Seules les notes des mesures de réponse existent : une frappe pendant l'appel ne compte pas.
    if (this.phase() !== 'playing') return;
    const result = judgeHit(this.targets(), hit.time);
    if (result) this.targets.set(result.targets);
  }

  private finish(): void {
    this.cleanup();
    const xp = xpFor(this.stars());
    this.xp.set(xp);
    this.phase.set('done');
    this.progressService.record({ rhythmId: this.rhythmDef().id, instrumentId: this.instrument().id, stepId: this.etape(), stars: this.stars(), xp });
  }

  private cleanup(): void {
    this.stopLoop?.();
    this.stopLoop = null;
    this.stopHits?.();
    this.stopHits = null;
    this.hits.stop();
    this.player.stop();
  }
}

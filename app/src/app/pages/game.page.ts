import { ChangeDetectionStrategy, Component, computed, inject, input, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { heardNow, Hit, HitInput } from '../audio/hit-input.service';
import { buildBarSpec, PlayerService } from '../audio/player.service';
import { BarSpec } from '../audio/sequencer';
import { getInstrument, grooveBar } from '../data/rhythms';
import { parsePattern, STEPS_PER_BAR } from '../data/types';
import { buildTargets, expireTargets, judgeHit, Summary, summarize, Target, xpFor } from '../exercises/judge';
import { PARCOURS } from '../exercises/parcours';
import { applyBacking, Backing, Feedback, restoreMix, startFrameLoop } from '../exercises/session';
import { BeatOffsets, HitPad, Stars } from '../shared/exercise-ui';
import { Icon } from '../shared/icon';
import { Header } from '../shared/ui';
import { ProgressService } from '../state/progress.service';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { InputMode, SettingsService } from '../state/settings.service';

type Phase = 'ready' | 'playing' | 'done';

/** Vitesse de défilement des notes, en pixels par seconde, et hauteur de la ligne de frappe. */
const SPEED = 260;
const HIT_LINE = 64;
const SPEEDS = [50, 70, 85, 100];

/**
 * Jeu « Suis le rythme » : les notes de l'instrument descendent vers une ligne, le musicien frappe
 * quand elles la touchent. Chaque frappe (micro ou toucher) est jugée par rapport à l'instant exact
 * où la note est jouée par le séquenceur.
 */
@Component({
  selector: 'app-game-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, Icon, HitPad, Stars, BeatOffsets, RouterLink],
  template: `
    <div class="page page--full">
      <app-header [back]="true" fallback="/parcours" [title]="title()" [subtitle]="instrument().name + ' · ' + rhythmDef().name + ' · ' + bpm() + ' BPM'">
        <div class="score">
          <span class="score__value">{{ score() }}</span>
          <span class="muted small">points</span>
        </div>
      </app-header>

      <div class="body">
        <div class="progress"><i [style.width.%]="progress()"></i></div>

        @if (phase() !== 'done') {
          <div class="lane">
            @for (g of guides(); track g.key) {
              <i class="guide" [class.guide--bar]="g.bar" [style.bottom.px]="g.y"></i>
            }
            <i class="glow"></i>
            <i class="line"></i>
            <i class="target" [class.target--hit]="pulse()"></i>
            @for (n of notes(); track n.id) {
              <i class="note" [class]="'note note--' + n.state" [class.note--accent]="n.accent" [style.bottom.px]="n.y" [style.opacity]="n.opacity"></i>
            }

            @if (countdown(); as c) {
              <div class="count">{{ c }}<span>Écoute, ne joue pas encore</span></div>
            }
            @if (feedback(); as f) {
              <div class="feedback" [style.color]="f.color" [style.opacity]="feedbackOpacity()">{{ f.text }}</div>
            }
            @if (combo() >= 3 && phase() === 'playing') {
              <div class="combo">Série × {{ combo() }}</div>
            }

            @if (phase() === 'ready') {
              <div class="overlay">
                <span class="overlay__title">Prêt ?</span>
                <span class="muted">
                  {{ motif() === 'temps' ? 'Frappe les quatre temps' : 'Joue ta partie de ' + instrument().name.toLowerCase() }} quand une note touche la ligne.
                  Les grosses notes sont les accents. Pendant la mesure de décompte, écoute sans jouer.
                </span>
                @if (needsSetup()) {
                  <a class="chip chip--active" [routerLink]="['/micro']" [queryParams]="{ retour: here() }"><app-icon name="mic" [size]="16" /> Régler le micro d'abord</a>
                  <button class="chip" type="button" (click)="start('toucher')">Jouer au toucher cette fois</button>
                } @else {
                  <div class="chip-row chip-row--wrap" style="justify-content: center">
                    @for (b of backings; track b.id) {
                      <button class="chip chip--small" type="button" [class.chip--active]="backing() === b.id" (click)="backing.set(b.id)">{{ b.label }}</button>
                    }
                    <button class="chip chip--small" type="button" [class.chip--outline]="guide()" (click)="guide.set(!guide())">Entendre ma partie</button>
                  </div>
                  <button class="start" type="button" (click)="start()">
                    <app-icon name="play" [size]="20" [filled]="true" />
                    Démarrer {{ mode() === 'micro' ? 'au micro' : 'au toucher' }}
                  </button>
                }
              </div>
            }
          </div>

          <app-hit-pad [enabled]="phase() === 'playing'" />
        } @else if (summary(); as s) {
          <div class="results">
            <div class="stack" style="align-items: center; gap: 8px; text-align: center">
              <app-stars [count]="s.stars" [size]="40" />
              <span class="display" style="font-size: 28px">{{ verdict() }}</span>
              <span class="muted">{{ instrument().name }} · {{ bpm() }} BPM · {{ bars() }} mesures</span>
            </div>
            <div class="tiles">
              <div class="tile"><span class="tile__v" style="color: var(--reprise)">{{ s.accuracy }} %</span><span class="muted small">précision</span></div>
              <div class="tile"><span class="tile__v">{{ bestCombo() }}</span><span class="muted small">meilleure série</span></div>
              <div class="tile"><span class="tile__v" style="color: var(--accent)">+{{ xp() }}</span><span class="muted small">XP</span></div>
            </div>
            <div class="card"><app-beat-offsets [stats]="s.perBeat" /></div>
            <div class="tip">
              <span class="strong">{{ s.tip.title }}</span>
              <span class="muted">{{ s.tip.text }}</span>
            </div>
            <div class="counts muted">
              <span><b style="color: var(--reprise)">{{ s.perfect }}</b> parfaits</span>
              <span><b style="color: var(--accent)">{{ s.good }}</b> bien</span>
              <span><b style="color: var(--break)">{{ s.miss }}</b> ratés</span>
            </div>
            <div class="stack" style="gap: 10px">
              @if (nextSpeed(); as ns) {
                <button class="start" type="button" (click)="goSpeed(ns)">Passer à {{ ns }} % · {{ bpmAt(ns) }} BPM</button>
              }
              <div class="chip-row">
                <button class="action-btn" type="button" (click)="replay()"><app-icon name="refresh" [size]="18" /><span>Rejouer</span></button>
                <a class="action-btn" routerLink="/parcours"><app-icon name="route" [size]="18" /><span>Parcours</span></a>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .score { display: flex; flex-direction: column; align-items: flex-end; }
    .score__value { font-family: var(--font-display); font-weight: 800; font-size: 22px; color: var(--accent); }
    .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; padding: 14px var(--gutter) calc(var(--safe-bottom) + 20px); overflow-y: auto; }
    .progress { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; flex: none; }
    .progress i { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
    .lane { flex: 1; min-height: 280px; position: relative; overflow: hidden; border-radius: 24px; background: #1a1820; border: 1px solid var(--border-soft); }
    .guide { position: absolute; left: 24px; right: 24px; height: 1px; background: #26232c; }
    .guide--bar { height: 2px; background: var(--border); }
    .glow { position: absolute; left: 0; right: 0; bottom: 30px; height: 64px; background: linear-gradient(180deg, rgba(242,177,52,0), rgba(242,177,52,0.08)); }
    .line { position: absolute; left: 22%; right: 22%; bottom: 62px; height: 4px; border-radius: 2px; background: var(--text); opacity: 0.85; }
    .target { position: absolute; left: 50%; bottom: 40px; width: 48px; height: 48px; margin-left: -24px; border-radius: 50%;
      border: 3px solid var(--text); opacity: 0.9; transition: box-shadow 80ms, border-color 80ms; }
    .target--hit { border-color: var(--accent); box-shadow: 0 0 0 8px rgba(242,177,52,0.25); }
    .note { position: absolute; left: 50%; width: 32px; height: 32px; margin: 0 0 -16px -16px; border-radius: 50%; background: var(--accent-dim); }
    .note--accent { width: 46px; height: 46px; margin: 0 0 -23px -23px; background: var(--accent); border: 3px solid var(--text); }
    .note--perfect { background: var(--reprise); border-color: transparent; }
    .note--good { background: var(--accent); border-color: transparent; }
    .note--miss { background: var(--dim); border-color: transparent; }
    .count { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      font-family: var(--font-display); font-weight: 800; font-size: 120px; line-height: 1; color: var(--text); opacity: 0.9; pointer-events: none; }
    .count span { font-family: var(--font-body); font-size: 14px; font-weight: 600; color: var(--muted); }
    .feedback { position: absolute; left: 0; right: 0; top: 28%; text-align: center; font-family: var(--font-display); font-weight: 800; font-size: 30px; pointer-events: none; }
    .combo { position: absolute; left: 0; right: 0; top: calc(28% + 42px); text-align: center; font-size: 13px; font-weight: 700; color: var(--muted); }
    .overlay { position: absolute; inset: 0; background: rgba(20,18,22,0.88); display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; padding: 0 26px; text-align: center; }
    .overlay__title { font-family: var(--font-display); font-weight: 800; font-size: 26px; }
    .start { height: 54px; padding: 0 26px; border-radius: 16px; background: var(--accent); color: var(--on-accent); font-weight: 700; font-size: 15px;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .results { display: flex; flex-direction: column; gap: 16px; padding-top: 8px; }
    .tiles { display: flex; gap: 10px; }
    .tile { flex: 1; padding: 14px 8px; border-radius: 18px; background: var(--surface); border: 1px solid var(--border-soft); display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .tile__v { font-family: var(--font-display); font-weight: 800; font-size: 26px; }
    .tip { padding: 14px 16px; border-radius: 18px; background: rgba(242,177,52,0.1); border: 1px solid rgba(242,177,52,0.35); display: flex; flex-direction: column; gap: 4px; }
    .counts { display: flex; justify-content: space-between; font-size: 13px; }
  `,
})
export class GamePage implements OnDestroy {
  /** Paramètre de route et query params. */
  readonly rhythm = input.required<string>();
  readonly inst = input<string>();
  readonly vitesse = input<string>();
  readonly mesures = input<string>();
  readonly motif = input<string>();
  readonly etape = input<string>();

  private readonly player = inject(PlayerService);
  private readonly hits = inject(HitInput);
  private readonly library = inject(RhythmLibrary);
  private readonly settings = inject(SettingsService);
  private readonly progressService = inject(ProgressService);
  private readonly router = inject(Router);

  readonly backings: { id: Backing; label: string }[] = [
    { id: 'fond', label: 'Groupe en fond' },
    { id: 'fort', label: 'Groupe fort' },
    { id: 'clic', label: 'Clic seul' },
  ];
  readonly backing = signal<Backing>('fond');
  readonly guide = signal(false);

  readonly rhythmDef = computed(() => this.library.get(this.rhythm()));
  readonly instrument = computed(() => getInstrument(this.rhythmDef(), this.inst() ?? this.settings.myInstrumentFor(this.rhythmDef().id)));
  readonly speed = computed(() => Math.min(100, Math.max(40, Number(this.vitesse()) || 70)));
  readonly bpm = computed(() => Math.round((this.rhythmDef().bpm * this.speed()) / 100));
  readonly bars = computed(() => Math.min(16, Math.max(2, Number(this.mesures()) || 8)));
  readonly step = computed(() => PARCOURS.find((s) => s.id === this.etape()));
  readonly title = computed(() => this.step()?.title ?? 'Suis le rythme');
  readonly pattern = computed(() => parsePattern(this.motif() === 'temps' ? 'X... x... x... x...' : this.instrument().pattern));
  readonly mode = computed(() => this.settings.settings().inputMode);
  readonly needsSetup = computed(() => this.mode() === 'micro' && this.settings.settings().micLatencyMs === null);

  readonly phase = signal<Phase>('ready');
  readonly targets = signal<Target[]>([]);
  readonly now = signal(0);
  readonly score = signal(0);
  readonly combo = signal(0);
  readonly bestCombo = signal(0);
  readonly feedback = signal<Feedback | null>(null);
  readonly lastHitAt = signal(-10);
  readonly summary = signal<Summary | null>(null);
  readonly xp = signal(0);
  private startTime = 0;

  readonly sixteenth = computed(() => 60 / this.bpm() / 4);
  readonly barLength = computed(() => this.sixteenth() * STEPS_PER_BAR);
  private readonly endTime = computed(() => this.startTime + (this.bars() + 1) * this.barLength());

  readonly progress = computed(() => {
    if (this.phase() === 'ready') return 0;
    if (this.phase() === 'done') return 100;
    const total = (this.bars() + 1) * this.barLength();
    return Math.max(0, Math.min(100, ((this.now() - this.startTime) / total) * 100));
  });

  readonly countdown = computed(() => {
    if (this.phase() !== 'playing') return null;
    const t = this.now() - this.startTime;
    if (t < 0 || t >= this.barLength()) return null;
    return 4 - Math.floor(t / (this.barLength() / 4));
  });

  readonly notes = computed(() => {
    const now = this.phase() === 'ready' ? this.startTime : this.now();
    return this.targets()
      .filter((t) => t.time - now < 2.4 && now - t.time < 0.45)
      .map((t) => {
        const age = now - t.time;
        const fading = t.state === 'perfect' || t.state === 'good';
        return {
          id: t.id,
          state: t.state,
          accent: t.vel === 3,
          y: HIT_LINE + (t.time - now) * SPEED,
          opacity: fading ? Math.max(0, 1 - age / 0.3) : 1,
        };
      });
  });

  readonly guides = computed(() => {
    if (this.phase() !== 'playing') return [];
    const now = this.now();
    const beat = this.barLength() / 4;
    const first = Math.floor((now - this.startTime - 0.5) / beat);
    const out: { key: number; y: number; bar: boolean }[] = [];
    for (let b = first; b < first + 14; b++) {
      const y = HIT_LINE + (this.startTime + b * beat - now) * SPEED;
      if (y > -10) out.push({ key: b, y, bar: b % 4 === 0 });
    }
    return out;
  });

  readonly pulse = computed(() => this.now() - this.lastHitAt() < 0.14);
  readonly feedbackOpacity = computed(() => {
    const f = this.feedback();
    return f ? Math.max(0, 1 - (this.now() - f.at) / 0.7) : 0;
  });

  readonly verdict = computed(() => {
    const stars = this.summary()?.stars ?? 0;
    return stars === 3 ? 'Excellent !' : stars === 2 ? 'Bien joué !' : stars === 1 ? 'C’est un début' : 'On recommence ?';
  });
  readonly nextSpeed = computed(() => {
    const s = this.summary();
    if (!s || s.stars < 2) return null;
    return SPEEDS.find((v) => v > this.speed()) ?? null;
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

  bpmAt(speed: number): number {
    return Math.round((this.rhythmDef().bpm * speed) / 100);
  }

  async start(mode?: InputMode): Promise<void> {
    this.cleanup();
    this.summary.set(null);
    this.score.set(0);
    this.combo.set(0);
    this.bestCombo.set(0);
    this.feedback.set(null);

    await this.hits.start(mode);
    this.stopHits = this.hits.onHit((hit) => this.onHit(hit));

    const rhythm = this.rhythmDef();
    const mine = this.instrument();
    const overrides = this.motif() === 'temps' ? { [mine.id]: 'X... x... x... x...' } : {};
    const groove = buildBarSpec(rhythm, grooveBar(rhythm, overrides), { click: this.backing() === 'clic' });
    // Décompte : l'accompagnement joue déjà (avec le clic) pendant que le musicien écoute.
    const countIn: BarSpec = { ...groove, click: true, phase: 0 };
    const bars = this.bars();

    applyBacking(this.player, mine.id, { backing: this.backing(), guide: this.guide(), headphones: this.settings.settings().headphones });
    this.player.setBpm(this.bpm());
    this.player.setProvider((bar) => (bar === 0 ? countIn : bar <= bars ? { ...groove, phase: bar - 1 } : null));
    await this.player.play();

    this.startTime = this.player.sequencer.startTime;
    this.hits.measureNoise(this.startTime, this.startTime + this.barLength());
    this.targets.set(buildTargets(this.pattern(), this.startTime, this.sixteenth(), 1, bars));
    this.now.set(heardNow());
    this.phase.set('playing');
    this.stopLoop = startFrameLoop(() => this.frame());
  }

  private frame(): void {
    const now = heardNow();
    this.now.set(now);
    const expired = expireTargets(this.targets(), now);
    if (expired) {
      this.targets.set(expired.targets);
      this.combo.set(0);
      this.feedback.set({ text: 'Raté', color: 'var(--break)', at: now });
    }
    if (now > this.endTime() + 0.3) this.finish();
  }

  private onHit(hit: Hit): void {
    if (this.phase() !== 'playing') return;
    this.lastHitAt.set(hit.time);
    const result = judgeHit(this.targets(), hit.time);
    if (!result) return; // frappe en trop (ghost note, rebond) : ni bonus ni pénalité
    this.targets.set(result.targets);
    const combo = this.combo() + 1;
    this.combo.set(combo);
    this.bestCombo.set(Math.max(this.bestCombo(), combo));
    const offset = result.target.offset ?? 0;
    if (result.target.state === 'perfect') {
      this.score.update((s) => s + 100 + Math.min(combo, 10) * 5);
      this.feedback.set({ text: 'Parfait !', color: 'var(--reprise)', at: this.now() });
    } else {
      this.score.update((s) => s + 50);
      this.feedback.set({ text: offset < 0 ? 'Bien · un peu tôt' : 'Bien · un peu tard', color: 'var(--accent)', at: this.now() });
    }
  }

  private finish(): void {
    this.cleanup();
    const s = summarize(this.targets());
    const xp = xpFor(s.stars);
    this.summary.set(s);
    this.xp.set(xp);
    this.phase.set('done');
    this.progressService.record({ rhythmId: this.rhythmDef().id, instrumentId: this.instrument().id, stepId: this.etape(), stars: s.stars, xp });
  }

  private cleanup(): void {
    this.stopLoop?.();
    this.stopLoop = null;
    this.stopHits?.();
    this.stopHits = null;
    this.hits.stop();
    this.player.stop();
  }

  replay(): void {
    this.phase.set('ready');
    this.targets.set([]);
  }

  goSpeed(speed: number): void {
    this.phase.set('ready');
    this.targets.set([]);
    void this.router.navigate([], { queryParams: { vitesse: speed }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

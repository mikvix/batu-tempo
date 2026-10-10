import { ChangeDetectionStrategy, Component, computed, inject, input, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { heardNow, Hit, HitInput } from '../audio/hit-input.service';
import { buildBarSpec, PlayerService } from '../audio/player.service';
import { getInstrument, grooveBar } from '../data/rhythms';
import { parsePattern, STEPS_PER_BAR } from '../data/types';
import { buildTargets, judgeHit, Target, xpFor } from '../exercises/judge';
import { applyBacking, restoreMix, startFrameLoop } from '../exercises/session';
import { HitPad, Stars } from '../shared/exercise-ui';
import { Icon } from '../shared/icon';
import { Header } from '../shared/ui';
import { ProgressService } from '../state/progress.service';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { InputMode, SettingsService } from '../state/settings.service';

const GROUP_BARS = 4;
const SOLO_BARS = 8;
const RETURN_BARS = 4;
const TOTAL_BARS = GROUP_BARS + SOLO_BARS + RETURN_BARS;
const FIRST_SOLO = 1 + GROUP_BARS;
const FIRST_RETURN = FIRST_SOLO + SOLO_BARS;

type Phase = 'ready' | 'playing' | 'done';

/** Régression linéaire y = a + b·x ; renvoie la pente b (ou null s'il n'y a pas assez de points). */
function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 3) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den > 0 ? num / den : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Défi « Tiens le tempo seul » : 4 mesures avec le groupe, 8 mesures où l'app se tait et le musicien
 * continue, puis 4 mesures de retour du groupe. Les frappes sont comparées à la grille du tempo de
 * départ : si l'écart grandit régulièrement, le musicien accélère (écart négatif) ou ralentit.
 */
@Component({
  selector: 'app-tempo-solo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, Icon, HitPad, Stars, RouterLink],
  template: `
    <div class="page page--full">
      <app-header [back]="true" fallback="/parcours" title="Tiens le tempo seul" [subtitle]="instrument().name + ' · ' + rhythmDef().name + ' · ' + bpm() + ' BPM'" />

      <div class="body">
        <div class="stack" style="gap: 6px">
          <div class="timeline-bar">
            <span style="flex: 4; background: var(--accent)"></span>
            <span style="flex: 8; background: var(--dim)"></span>
            <span style="flex: 4; background: var(--reprise)"></span>
            <i class="head" [style.left.%]="progress()"></i>
          </div>
          <div class="row row--between seg-labels">
            <span style="color: var(--accent)">Groupe · {{ groupBars }}</span>
            <span>Toi seul · {{ soloBars }}</span>
            <span style="color: var(--reprise)">Retour · {{ returnBars }}</span>
          </div>
        </div>

        @if (phase() !== 'done') {
          <div class="card gauge-card">
            <span class="badge" [style.background]="section().color" [style.color]="section().on">{{ section().label }}</span>
            <svg width="250" height="140" viewBox="0 0 250 140" [attr.aria-label]="'Tempo joué : ' + (liveBpm() ?? '—') + ' BPM, cible ' + bpm()">
              <path d="M25 125 A100 100 0 0 1 225 125" fill="none" stroke="var(--surface-2)" stroke-width="16" stroke-linecap="round" />
              <path d="M93 31 A100 100 0 0 1 157 31" fill="none" stroke="rgba(62,207,166,0.45)" stroke-width="16" />
              <line x1="125" y1="125" [attr.x2]="needle().x" [attr.y2]="needle().y" stroke="var(--text)" stroke-width="4" stroke-linecap="round" />
              <circle cx="125" cy="125" r="8" fill="var(--text)" />
              <text x="25" y="140" fill="var(--muted)" font-size="11" text-anchor="middle">−10</text>
              <text x="225" y="140" fill="var(--muted)" font-size="11" text-anchor="middle">+10</text>
            </svg>
            <div class="bpm">
              <span class="bpm__v" [style.color]="liveColor()">{{ liveBpm() ?? '—' }}</span>
              <span class="muted strong" style="font-size: 14px">BPM · cible {{ bpm() }}</span>
            </div>
            <span class="strong" style="font-size: 14px; text-align: center" [style.color]="liveColor()">{{ liveMessage() }}</span>
          </div>

          @if (phase() === 'ready') {
            <div class="card stack" style="gap: 12px; align-items: center; text-align: center">
              <span class="muted">
                Une mesure de décompte (écoute sans jouer), puis joue ta partie avec le groupe. Quand il se tait, continue
                seul pendant {{ soloBars }} mesures : s'il revient pile avec toi, tu as tenu le tempo.
              </span>
              @if (needsSetup()) {
                <a class="chip chip--active" [routerLink]="['/micro']" [queryParams]="{ retour: here() }"><app-icon name="mic" [size]="16" /> Régler le micro d'abord</a>
                <button class="chip" type="button" (click)="start('toucher')">Jouer au toucher cette fois</button>
              } @else {
                <button class="start" type="button" (click)="start()"><app-icon name="play" [size]="20" [filled]="true" /> Démarrer</button>
              }
            </div>
          } @else {
            <app-hit-pad [enabled]="true" />
          }
        } @else {
          <div class="stack" style="align-items: center; gap: 10px; text-align: center; padding-top: 6px">
            <app-stars [count]="stars()" [size]="40" />
            <span class="display" style="font-size: 28px">{{ resultTitle() }}</span>
            <span class="strong" style="color: var(--accent)">+{{ xp() }} XP</span>
          </div>
          <div class="tiles">
            <div class="tile"><span class="tile__v" [style.color]="liveColor()">{{ soloBpm() ?? '—' }}</span><span class="muted small">BPM seul</span></div>
            <div class="tile"><span class="tile__v">{{ soloBpm() === null ? '—' : (soloBpm()! - bpm() > 0 ? '+' : '') + (soloBpm()! - bpm()) }}</span><span class="muted small">écart</span></div>
            <div class="tile"><span class="tile__v" style="color: var(--reprise)">{{ returnMs() === null ? '—' : returnMs() + ' ms' }}</span><span class="muted small">au retour</span></div>
          </div>
        }

        @if (phase() !== 'ready') {
          <div class="card stack" style="gap: 10px">
            <div class="row row--between">
              <span class="label">Ton écart avec le groupe</span>
              <span class="muted small" style="color: var(--reprise)">zone ± 40 ms</span>
            </div>
            <svg viewBox="0 0 320 90" style="width: 100%; height: 90px" aria-label="Écart moyen avec le tempo du groupe, mesure par mesure">
              <rect x="0" y="35" width="320" height="20" fill="rgba(62,207,166,0.12)" />
              <line x1="0" y1="45" x2="320" y2="45" stroke="var(--reprise)" stroke-width="1" stroke-dasharray="3 4" />
              <line [attr.x1]="barX(firstSolo - 1)" y1="0" [attr.x2]="barX(firstSolo - 1)" y2="90" stroke="var(--border)" />
              <line [attr.x1]="barX(firstReturn - 1)" y1="0" [attr.x2]="barX(firstReturn - 1)" y2="90" stroke="var(--border)" />
              @if (curve().length > 1) {
                <polyline [attr.points]="curvePoints()" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              }
              @for (p of curve(); track p.bar) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" fill="var(--accent)" />
              }
              <text x="4" y="12" fill="var(--muted)" font-size="10">en retard</text>
              <text x="4" y="86" fill="var(--muted)" font-size="10">en avance</text>
            </svg>
          </div>
        }

        @if (phase() === 'done') {
          <div class="tip">
            <span class="strong">{{ tip().title }}</span>
            <span class="muted">{{ tip().text }}</span>
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
    .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; padding: 16px var(--gutter) calc(var(--safe-bottom) + 20px); overflow-y: auto; }
    .timeline-bar { position: relative; display: flex; gap: 2px; height: 8px; }
    .timeline-bar span { display: block; height: 8px; }
    .timeline-bar span:first-child { border-radius: 4px 0 0 4px; }
    .timeline-bar span:last-of-type { border-radius: 0 4px 4px 0; }
    .head { position: absolute; top: -3px; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px; background: var(--text); }
    .seg-labels { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .gauge-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 16px 16px; }
    .bpm { display: flex; align-items: baseline; gap: 8px; margin-top: -6px; }
    .bpm__v { font-family: var(--font-display); font-weight: 800; font-size: 46px; letter-spacing: -0.03em; }
    .start { height: 54px; padding: 0 26px; border-radius: 16px; background: var(--accent); color: var(--on-accent); font-weight: 700; font-size: 15px;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .tiles { display: flex; gap: 10px; }
    .tile { flex: 1; padding: 14px 8px; border-radius: 18px; background: var(--surface); border: 1px solid var(--border-soft); display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .tile__v { font-family: var(--font-display); font-weight: 800; font-size: 24px; }
    .tip { padding: 14px 16px; border-radius: 18px; background: rgba(242,177,52,0.1); border: 1px solid rgba(242,177,52,0.35); display: flex; flex-direction: column; gap: 4px; }
  `,
})
export class TempoSoloPage implements OnDestroy {
  readonly rhythm = input.required<string>();
  readonly inst = input<string>();
  readonly etape = input<string>();

  private readonly player = inject(PlayerService);
  private readonly hits = inject(HitInput);
  private readonly library = inject(RhythmLibrary);
  private readonly settings = inject(SettingsService);
  private readonly progressService = inject(ProgressService);
  private readonly router = inject(Router);

  readonly groupBars = GROUP_BARS;
  readonly soloBars = SOLO_BARS;
  readonly returnBars = RETURN_BARS;
  readonly firstSolo = FIRST_SOLO;
  readonly firstReturn = FIRST_RETURN;

  readonly rhythmDef = computed(() => this.library.get(this.rhythm()));
  readonly instrument = computed(() => getInstrument(this.rhythmDef(), this.inst() ?? this.settings.myInstrumentFor(this.rhythmDef().id)));
  readonly bpm = computed(() => this.settings.settings().bpm[this.rhythmDef().id] ?? this.rhythmDef().bpm);
  readonly needsSetup = computed(() => this.settings.settings().inputMode === 'micro' && this.settings.settings().micLatencyMs === null);

  readonly phase = signal<Phase>('ready');
  readonly now = signal(0);
  readonly targets = signal<Target[]>([]);
  readonly xp = signal(0);
  private readonly startTime = signal(0);
  private window = 0.2;

  readonly barLength = computed(() => (60 / this.bpm()) * 4);
  readonly barIndex = computed(() => (this.phase() === 'playing' ? Math.floor((this.now() - this.startTime()) / this.barLength()) : 0));
  readonly progress = computed(() => {
    if (this.phase() === 'ready') return 0;
    if (this.phase() === 'done') return 100;
    const t = (this.now() - this.startTime()) / this.barLength() - 1;
    return Math.max(0, Math.min(100, (t / TOTAL_BARS) * 100));
  });

  readonly section = computed(() => {
    const b = this.barIndex();
    if (this.phase() === 'ready') return { label: 'PRÊT', color: 'var(--surface-2)', on: 'var(--text)' };
    if (b < 1) return { label: 'DÉCOMPTE · ÉCOUTE', color: 'var(--text)', on: 'var(--bg)' };
    if (b < FIRST_SOLO) return { label: `AVEC LE GROUPE · ${b} / ${GROUP_BARS}`, color: 'var(--accent)', on: 'var(--on-accent)' };
    if (b < FIRST_RETURN) return { label: `SILENCE · MESURE ${b - FIRST_SOLO + 1} / ${SOLO_BARS}`, color: 'var(--dim)', on: 'var(--text)' };
    return { label: 'RETOUR DU GROUPE', color: 'var(--reprise)', on: 'var(--on-reprise)' };
  });

  private readonly matched = computed(() => this.targets().filter((t) => t.offset !== undefined));

  /** Tempo estimé à partir de la dérive des frappes sur une plage de mesures. */
  private bpmOver(fromBar: number, toBar: number): number | null {
    const pts = this.matched()
      .filter((t) => t.bar >= fromBar && t.bar < toBar)
      .map((t) => ({ x: t.time, y: t.offset ?? 0 }));
    const s = slope(pts);
    return s === null ? null : Math.round((this.bpm() / (1 + s)) * 10) / 10;
  }

  /** Pendant le silence : tempo des deux dernières mesures jouées. Sinon : tempo du groupe. */
  readonly liveBpm = computed(() => {
    const b = this.barIndex();
    if (this.phase() === 'done') return this.soloBpm();
    if (b >= FIRST_SOLO && b < FIRST_RETURN) {
      const est = this.bpmOver(Math.max(FIRST_SOLO, b - 2), b + 1);
      return est === null ? null : Math.round(est);
    }
    return this.phase() === 'playing' ? this.bpm() : null;
  });

  readonly soloBpm = computed(() => {
    const est = this.bpmOver(FIRST_SOLO, FIRST_RETURN);
    return est === null ? null : Math.round(est);
  });

  readonly returnMs = computed(() => {
    const m = median(this.matched().filter((t) => t.bar >= FIRST_RETURN).map((t) => Math.abs((t.offset ?? 0) * 1000)));
    return m === null ? null : Math.round(m);
  });

  readonly needle = computed(() => {
    const live = this.liveBpm();
    const diff = live === null ? 0 : Math.max(-10, Math.min(10, live - this.bpm()));
    const angle = Math.PI - ((diff + 10) / 20) * Math.PI;
    return { x: 125 + Math.cos(angle) * 92, y: 125 - Math.sin(angle) * 92 };
  });

  readonly liveColor = computed(() => {
    const live = this.liveBpm();
    if (live === null) return 'var(--text)';
    const d = Math.abs(live - this.bpm());
    return d <= 1.5 ? 'var(--reprise)' : d <= 3.5 ? 'var(--accent)' : 'var(--break)';
  });

  readonly liveMessage = computed(() => {
    const b = this.barIndex();
    if (this.phase() === 'ready') return 'Prêt quand tu veux';
    if (b < 1) return 'Écoute le groupe, ne joue pas encore';
    if (b < FIRST_SOLO) return FIRST_SOLO - b === 1 ? 'Le groupe se tait à la prochaine mesure' : 'Cale-toi bien sur le groupe';
    if (b < FIRST_RETURN) {
      const live = this.liveBpm();
      if (live === null) return 'Continue, tu es seul';
      const d = live - this.bpm();
      return Math.abs(d) <= 1.5 ? 'Parfaitement stable' : d > 0 ? 'Tu accélères un peu, reste posé' : 'Tu ralentis, garde l’élan';
    }
    return 'Le groupe est revenu : es-tu pile avec lui ?';
  });

  /** Écart médian par mesure, pour la courbe (± 120 ms sur la hauteur). */
  readonly curve = computed(() => {
    const out: { bar: number; x: number; y: number }[] = [];
    for (let bar = 1; bar <= TOTAL_BARS; bar++) {
      const m = median(this.matched().filter((t) => t.bar === bar).map((t) => (t.offset ?? 0) * 1000));
      if (m === null) continue;
      out.push({ bar, x: this.barX(bar - 1) + 10, y: 45 - Math.max(-120, Math.min(120, m)) * (40 / 120) });
    }
    return out;
  });
  readonly curvePoints = computed(() => this.curve().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

  readonly stars = computed(() => {
    const solo = this.soloBpm();
    if (solo === null) return 0;
    const d = Math.abs(solo - this.bpm());
    return d <= 1 ? 3 : d <= 2.5 ? 2 : d <= 4 ? 1 : 0;
  });
  readonly resultTitle = computed(() => {
    const s = this.stars();
    return s === 3 ? 'Métronome humain !' : s === 2 ? 'Tempo bien tenu' : s === 1 ? 'Ça dérive un peu' : this.soloBpm() === null ? 'Pas assez de frappes' : 'Le tempo t’a échappé';
  });
  readonly tip = computed(() => {
    const solo = this.soloBpm();
    if (solo === null) return { title: 'Continue pendant le silence', text: 'Le défi se joue quand le groupe se tait : garde ta partie jusqu’au bout, même si tu doutes.' };
    const d = solo - this.bpm();
    if (Math.abs(d) <= 1) return { title: 'Tempo solide', text: 'Tu gardes le tempo sans le groupe. C’est exactement ce qu’on attend pendant un break.' };
    return d > 0
      ? { title: 'Tu accélères seul', text: 'Sans repère, on a tendance à presser. Pense « lourd » : marque le temps 1 avec le pied et respire sur le 4.' }
      : { title: 'Tu ralentis seul', text: 'L’énergie retombe quand le groupe se tait. Garde un geste ample et chante le surdo dans ta tête.' };
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

  barX(barIndex: number): number {
    return (barIndex / TOTAL_BARS) * 320;
  }

  async start(mode?: InputMode): Promise<void> {
    this.cleanup();
    await this.hits.start(mode);
    this.stopHits = this.hits.onHit((hit) => this.onHit(hit));

    const rhythm = this.rhythmDef();
    const mine = this.instrument();
    const groove = buildBarSpec(rhythm, grooveBar(rhythm));
    applyBacking(this.player, mine.id, { backing: 'fort', guide: false, headphones: this.settings.settings().headphones });
    this.player.setBpm(this.bpm());
    this.player.setProvider((bar) => {
      if (bar === 0) return { ...groove, click: true, phase: 0 };
      if (bar > TOTAL_BARS) return null;
      const silent = bar >= FIRST_SOLO && bar < FIRST_RETURN;
      return { ...groove, phase: bar - 1, silent };
    });
    await this.player.play();

    this.startTime.set(this.player.sequencer.startTime);
    this.hits.measureNoise(this.startTime(), this.startTime() + this.barLength());
    const sixteenth = this.barLength() / STEPS_PER_BAR;
    const targets = buildTargets(parsePattern(mine.pattern), this.startTime(), sixteenth, 1, TOTAL_BARS);
    // Fenêtre d'appariement large (la dérive peut grandir pendant le silence), sans chevaucher deux notes.
    let gap = Infinity;
    for (let i = 1; i < targets.length; i++) gap = Math.min(gap, targets[i].time - targets[i - 1].time);
    this.window = Math.min(0.25, (Number.isFinite(gap) ? gap : 0.5) * 0.48);
    this.targets.set(targets);
    this.now.set(heardNow());
    this.phase.set('playing');
    this.stopLoop = startFrameLoop(() => this.frame());
  }

  private frame(): void {
    const now = heardNow();
    this.now.set(now);
    if (now > this.startTime() + (TOTAL_BARS + 1) * this.barLength() + this.window + 0.2) this.finish();
  }

  private onHit(hit: Hit): void {
    if (this.phase() !== 'playing') return;
    const result = judgeHit(this.targets(), hit.time, this.window);
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

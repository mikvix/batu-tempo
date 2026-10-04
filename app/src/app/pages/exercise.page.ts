import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { buildBarSpec, PlayerService } from '../audio/player.service';
import { BarSpec } from '../audio/sequencer';
import { getExercise } from '../data/exercises';
import { breakBars, getInstrument, getRhythm, grooveBar } from '../data/rhythms';
import { ExerciseKind, parsePattern, SILENT_BAR, Velocity } from '../data/types';
import { Icon } from '../shared/icon';
import { StepCells } from '../shared/pattern-grid';
import { Header, PlayButton } from '../shared/ui';
import { SettingsService } from '../state/settings.service';

type SegKind = 'groove' | 'call' | 'countdown' | 'break' | 'silence' | 'reprise' | 'accel' | 'ralenti';

interface Segment {
  kind: SegKind;
  label: string;
  color: string;
  onColor: string;
  bars: BarSpec[];
}

interface Cycle {
  start: number;
  segments: Segment[];
  bars: { spec: BarSpec; seg: number; indexInSeg: number }[];
}

interface CycleParams {
  kind: ExerciseKind;
  rhythm: ReturnType<typeof getRhythm>;
  breakId: string | undefined;
  random: boolean;
  grooveBars: number;
  baseBpm: number;
}

const SEG_STYLE: Record<SegKind, { label: string; color: string; onColor: string }> = {
  groove: { label: 'Groove', color: 'var(--accent)', onColor: 'var(--on-accent)' },
  call: { label: 'Appel', color: 'var(--blue)', onColor: 'var(--bg)' },
  countdown: { label: 'Compte', color: 'var(--text)', onColor: 'var(--bg)' },
  break: { label: 'Break', color: 'var(--break)', onColor: 'var(--on-break)' },
  silence: { label: 'Silence', color: 'var(--dim)', onColor: 'var(--text)' },
  reprise: { label: 'Reprise', color: 'var(--reprise)', onColor: 'var(--on-reprise)' },
  accel: { label: 'Accélère', color: 'var(--blue)', onColor: 'var(--bg)' },
  ralenti: { label: 'Ralentit', color: 'var(--blue)', onColor: 'var(--bg)' },
};

function seg(kind: SegKind, bars: BarSpec[]): Segment {
  return { kind, bars, ...SEG_STYLE[kind] };
}

function hint(kind: SegKind, remaining: number): string {
  switch (kind) {
    case 'groove':
      return remaining === 1 ? 'Break à la prochaine mesure' : 'mesures avant le break';
    case 'call':
      return "L'appel ! Le break arrive";
    case 'countdown':
      return remaining === 1 ? 'Break sur le prochain 1' : 'cloches avant le break';
    case 'break':
      return remaining === 1 ? 'Reprise sur le 1 !' : 'mesures avant la reprise';
    case 'silence':
      return remaining === 1 ? 'Le groupe revient sur le 1' : 'mesures seul, tiens le tempo';
    case 'reprise':
      return 'Tiens le tempo du groupe';
    case 'accel':
      return 'ça accélère, reste collé';
    case 'ralenti':
      return 'ça ralentit, ne cours pas';
  }
}

@Component({
  selector: 'app-exercise-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Header, PlayButton, StepCells],
  template: `
    <div class="page page--full">
      <app-header
        [back]="true"
        fallback="/exercices"
        [title]="exercise().name"
        [subtitle]="rhythmDef().name + ' · ' + player.bpm() + ' BPM · ' + mine().name">
        <span class="pill">Mesure {{ player.playing() ? barInCycle() + 1 : 1 }} / {{ total() }}</span>
      </app-header>

      <div class="page__scroll" style="padding-top: 20px">
        <div class="row row--between">
          @for (s of cycle().segments; track $index) {
            <span class="seg-label" [style.color]="s.kind === 'silence' ? 'var(--muted)' : s.color">{{ s.label }} · {{ s.bars.length }}</span>
          }
        </div>
        <div class="track">
          <div class="timeline">
            @for (s of cycle().segments; track $index) {
              <span [style.flex]="s.bars.length" [style.background]="s.color"></span>
            }
          </div>
          <i class="playhead" [style.left.%]="progress() * 100"></i>
        </div>

        <div class="card phase">
          <span class="badge" [style.background]="segment().color" [style.color]="segment().onColor">{{ segment().label.toUpperCase() }}</span>
          <span class="phase__big" [style.color]="segment().kind === 'silence' ? 'var(--text)' : segment().color">{{ remaining() }}</span>
          <span class="phase__hint">{{ hintText() }}</span>
          <div class="beat-dots" style="margin-top: 6px">
            @for (b of [0, 1, 2, 3]; track b) {
              <span
                class="beat-dot"
                [class.beat-dot--on]="beat() === b"
                [style.background]="beat() === b ? segment().color : null"
                [style.color]="beat() === b ? segment().onColor : null">
                {{ b + 1 }}
              </span>
            }
          </div>
        </div>

        @if (showsBreak()) {
          <div class="card stack" style="margin-top: 18px; gap: 12px">
            <div class="row row--between">
              <span class="label">Le break à jouer</span>
              <span style="font-weight: 700; font-size: 12px; color: var(--break)">{{ currentBreak().name }}</span>
            </div>
            @for (bar of brkBars(); track $index; let i = $index) {
              <div class="stack" style="gap: 6px">
                <span class="muted small">Mesure {{ i + 1 }}</span>
                <div class="row" style="gap: 10px">
                  <span class="rname">{{ mine().short }}</span>
                  <app-step-cells
                    [pattern]="minePattern(bar)"
                    [step]="segment().kind === 'break' && current().indexInSeg === i ? player.step() : -1"
                    color="var(--break)"
                    [cell]="14"
                    [height]="24"
                    [gap]="3"
                    [groupGap]="8" />
                </div>
                <div class="row" style="gap: 10px">
                  <span class="rname" style="color: var(--muted)">Groupe</span>
                  <app-step-cells [pattern]="union(bar)" [step]="-1" color="var(--dim)" [cell]="14" [height]="16" [gap]="3" [groupGap]="8" />
                </div>
              </div>
            }
            <span class="muted">{{ currentBreak().description }}</span>
          </div>
        }

        <div class="chip-row chip-row--scroll" style="margin-top: 16px">
          @for (n of [4, 8, 12, 16]; track n) {
            <button class="chip" type="button" [class.chip--active]="!random() && settings.grooveBars() === n" (click)="setBars(n)">{{ n }} mesures</button>
          }
          @if (exercise().id !== 'tempo') {
            <button class="chip" type="button" [class.chip--outline]="random()" (click)="random.set(!random())">
              <app-icon name="shuffle" [size]="14" /> Break surprise
            </button>
          }
        </div>
      </div>

      <div class="bottom-bar">
        <button class="action-btn" type="button" (click)="restart()">
          <app-icon name="refresh" [size]="18" />
          <span>Recommencer</span>
        </button>
        <app-play-button [playing]="player.playing()" [color]="player.playing() ? segment().color : 'var(--accent)'" (toggle)="player.toggle()" />
        <button class="action-btn" type="button" [disabled]="rhythmDef().breaks.length < 2" (click)="nextBreak()">
          <app-icon name="skip" [size]="18" />
          <span>{{ rhythmDef().breaks.length > 1 ? 'Break suivant' : 'Un seul break' }}</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    .seg-label { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    .track { position: relative; height: 14px; margin-top: 8px; display: flex; align-items: center; }
    .track .timeline { width: 100%; }
    .playhead { position: absolute; top: 0; width: 4px; height: 14px; border-radius: 2px; background: var(--text); margin-left: -2px; }
    .phase { margin-top: 22px; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 26px 16px; }
    .phase__big { font-family: var(--font-display); font-weight: 800; font-size: 120px; line-height: 1; letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums; }
    .phase__hint { font-weight: 600; font-size: 15px; color: var(--muted); text-align: center; }
    .rname { width: 48px; font-weight: 700; font-size: 12px; flex: 0 0 auto; }
  `,
})
export class ExercisePage {
  readonly id = input.required<string>();
  /** Query param `?rhythm=` */
  readonly rhythm = input<string>();

  readonly player = inject(PlayerService);
  readonly settings = inject(SettingsService);

  readonly random = signal(false);
  readonly breakId = signal<string | undefined>(undefined);
  private readonly liveCycle = signal<Cycle | null>(null);
  private cycleRef: Cycle | null = null;

  readonly exercise = computed(() => getExercise(this.id()));
  readonly rhythmDef = computed(() => getRhythm(this.rhythm() ?? this.settings.lastRhythmId()));
  readonly mine = computed(() => getInstrument(this.rhythmDef(), this.settings.myInstrumentFor(this.rhythmDef().id)));
  readonly baseBpm = computed(() => this.settings.settings().bpm[this.rhythmDef().id] ?? this.rhythmDef().bpm);
  readonly currentBreak = computed(() => this.rhythmDef().breaks.find((b) => b.id === this.breakId()) ?? this.rhythmDef().breaks[0]);
  readonly brkBars = computed(() => breakBars(this.rhythmDef(), this.currentBreak().id));
  readonly showsBreak = computed(() => this.exercise().id !== 'blind' && this.exercise().id !== 'tempo');

  /** Les paramètres dont dépend la construction d'un cycle, regroupés pour ne reconstruire qu'une fois. */
  private readonly params = computed<CycleParams>(() => ({
    kind: this.exercise().id,
    rhythm: this.rhythmDef(),
    breakId: this.currentBreak().id,
    random: this.random(),
    grooveBars: this.settings.grooveBars(),
    baseBpm: this.baseBpm(),
  }));

  private readonly previewCycle = computed(() => this.buildCycle(0, this.params()));
  readonly cycle = computed(() => (this.player.playing() && this.liveCycle() ? (this.liveCycle() as Cycle) : this.previewCycle()));
  readonly total = computed(() => this.cycle().bars.length);
  readonly barInCycle = computed(() =>
    this.player.playing() ? Math.max(0, Math.min(this.total() - 1, this.player.bar() - this.cycle().start)) : 0
  );
  readonly current = computed(() => this.cycle().bars[this.barInCycle()]);
  readonly segment = computed(() => this.cycle().segments[this.current().seg]);
  readonly remaining = computed(() => this.segment().bars.length - this.current().indexInSeg);
  readonly beat = computed(() => (this.player.playing() && this.player.step() >= 0 ? Math.floor(this.player.step() / 4) : -1));
  readonly progress = computed(() => {
    if (!this.player.playing()) return 0;
    const stepFrac = this.player.step() >= 0 ? this.player.step() / 16 : 0;
    return (this.barInCycle() + stepFrac) / this.total();
  });
  readonly hintText = computed(() => (this.player.playing() ? hint(this.segment().kind, this.remaining()) : 'Appuie sur lecture pour commencer'));

  constructor() {
    effect(() => {
      const rhythm = this.rhythmDef();
      const bpm = this.baseBpm();
      untracked(() => {
        // Un exercice démarre toujours au début de son cycle.
        this.player.stop();
        this.cycleRef = null;
        this.player.resetMix();
        this.player.sequencer.muted.clear();
        this.player.setBpmIfIdle(bpm);
        if (!rhythm.breaks.some((b) => b.id === this.breakId())) this.breakId.set(rhythm.breaks[0]?.id);
      });
    });

    // Les réglages ont changé : le prochain cycle sera reconstruit à la mesure suivante.
    effect(() => {
      const params = this.params();
      this.cycleRef = null;
      this.player.setProvider((bar) => {
        let c = this.cycleRef;
        if (!c || bar >= c.start + c.bars.length || bar < c.start) {
          c = this.buildCycle(bar, params);
          this.cycleRef = c;
          this.liveCycle.set(c);
        }
        return c.bars[bar - c.start].spec;
      });
    });
  }

  private buildCycle(start: number, p: CycleParams): Cycle {
    const rhythm = p.rhythm;
    const n = p.random ? 4 + Math.floor(Math.random() * 13) : p.grooveBars;
    const groove = buildBarSpec(rhythm, grooveBar(rhythm));
    // Chaque segment de groove repart de la première mesure de la phrase (phase 0).
    const grooveN = (count: number, bpm?: number) => Array.from({ length: count }, (_, i) => ({ ...groove, bpm, phase: i }));
    const brk = breakBars(rhythm, p.breakId).map((b) => buildBarSpec(rhythm, b));
    const segments: Segment[] = [];

    if (p.kind === 'break') {
      segments.push(seg('groove', grooveN(n)), seg('break', brk), seg('reprise', grooveN(p.grooveBars)));
    } else if (p.kind === 'blind') {
      const silent = Array.from({ length: 2 }, () => ({ ...groove, silent: true }));
      segments.push(seg('groove', grooveN(n)), seg('silence', silent), seg('reprise', grooveN(p.grooveBars)));
    } else if (p.kind === 'call') {
      const call = rhythm.call;
      const callBar = buildBarSpec(rhythm, call ? { ...grooveBar(rhythm), [call.instrumentId]: call.pattern } : grooveBar(rhythm));
      if (call) {
        for (const id of Object.keys(callBar.patterns)) {
          if (id !== call.instrumentId && !id.startsWith('surdo') && !id.startsWith('alfaia')) {
            callBar.patterns[id] = parsePattern(SILENT_BAR);
          }
        }
      }
      segments.push(seg('groove', grooveN(n)), seg('call', [callBar]), seg('break', brk), seg('reprise', grooveN(p.grooveBars)));
    } else if (p.kind === 'countdown') {
      const count = Array.from({ length: 4 }, () => ({ ...groove, bell: true }));
      segments.push(seg('groove', grooveN(Math.max(1, n - 4))), seg('countdown', count), seg('break', brk), seg('reprise', grooveN(p.grooveBars)));
    } else {
      const steps = Math.max(4, n);
      const top = Math.round(p.baseBpm * 1.15);
      const up = Array.from({ length: steps }, (_, i) => ({ ...groove, bpm: Math.round(p.baseBpm + ((top - p.baseBpm) * (i + 1)) / steps) }));
      const down = Array.from({ length: steps }, (_, i) => ({ ...groove, bpm: Math.round(top - ((top - p.baseBpm) * (i + 1)) / steps) }));
      segments.push(seg('groove', grooveN(4, p.baseBpm)), seg('accel', up), seg('ralenti', down));
    }

    const bars: Cycle['bars'] = [];
    segments.forEach((s, si) => s.bars.forEach((spec, bi) => bars.push({ spec, seg: si, indexInSeg: bi })));
    return { start, segments, bars };
  }

  minePattern(bar: Record<string, string>): Velocity[] {
    return parsePattern(bar[this.mine().id] ?? SILENT_BAR);
  }

  /** Ce que joue le reste du groupe sur cette mesure : vélocité max par pas, hors mon instrument. */
  union(bar: Record<string, string>): Velocity[] {
    const out = new Array<Velocity>(16).fill(0);
    for (const [id, p] of Object.entries(bar)) {
      if (id === this.mine().id) continue;
      parsePattern(p).forEach((v, i) => {
        if (v > out[i]) out[i] = v;
      });
    }
    return out;
  }

  setBars(n: number): void {
    this.random.set(false);
    this.settings.update({ grooveBars: n });
  }

  restart(): void {
    this.player.stop();
    this.cycleRef = null;
    setTimeout(() => void this.player.play(), 50);
  }

  nextBreak(): void {
    const ids = this.rhythmDef().breaks.map((b) => b.id);
    if (ids.length < 2) return;
    const i = ids.indexOf(this.breakId() ?? ids[0]);
    this.breakId.set(ids[(i + 1) % ids.length]);
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { buildBarSpec, PlayerService } from '../audio/player.service';
import { BarSpec } from '../audio/sequencer';
import { breakBars, getInstrument, grooveBar, grooveCycle } from '../data/rhythms';
import { shareRhythm } from '../data/share';
import { Icon } from '../shared/icon';
import { BeatRuler, GRID_LEFT, InstrumentRow } from '../shared/pattern-grid';
import { TempoControl } from '../shared/tempo-control';
import { Header, PlayButton } from '../shared/ui';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { SettingsService } from '../state/settings.service';
import { ToastService } from '../state/toast.service';

@Component({
  selector: 'app-player-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Header, PlayButton, TempoControl, BeatRuler, InstrumentRow],
  template: `
    <div class="page page--full">
      <app-header [back]="true" fallback="/" [title]="rhythm().name" [subtitle]="rhythm().origin + ' · Groove de base'">
        <a class="pill pill--accent" [routerLink]="['/exercice', 'break']" [queryParams]="{ rhythm: rhythm().id }">
          <app-icon name="target" [size]="16" />
          Exercices
        </a>
      </app-header>

      <div class="page__scroll" style="padding-top: 18px">
        <app-tempo-control
          [bpm]="player.bpm()"
          [reference]="rhythm().bpm"
          [min]="rhythm().bpmRange[0] - 30"
          [max]="rhythm().bpmRange[1] + 40"
          (bpmChange)="changeBpm($event)" />

        <div class="row row--between" style="margin: 22px 0 12px">
          <div class="row" style="gap: 10px">
            <h2 class="title">Instruments</h2>
            @if (inBreak()) {
              <span class="badge" style="background: var(--break); color: var(--on-break)">BREAK</span>
            }
            @if (inCount()) {
              <span class="badge" style="background: var(--text); color: var(--bg)">COMPTE</span>
            }
            @if (cycle() > 1 && !inBreak() && !inCount()) {
              <span class="badge" style="background: var(--surface-2); color: var(--muted)">MESURE {{ phase() + 1 }}/{{ cycle() }}</span>
            }
          </div>
          <div class="row" style="gap: 6px">
            <button class="chip chip--small" type="button" [class.chip--active]="allAudible()" (click)="unmuteAll()">Tous</button>
            <button class="chip chip--small" type="button" [class.chip--outline]="mineMuted()" (click)="player.toggleMute(mine().id)">
              Sans le mien
            </button>
          </div>
        </div>

        <div [style.padding-left.px]="gridLeft" style="margin-bottom: 6px">
          <app-beat-ruler [step]="shownStep()" />
        </div>
        <div class="stack" style="gap: 2px">
          @for (inst of rhythm().instruments; track inst.id) {
            <app-instrument-row
              [instrument]="inst"
              [pattern]="livePattern(inst.id)"
              [step]="shownStep()"
              [bar]="phase()"
              [muted]="!player.isAudible(inst.id)"
              [highlighted]="inst.id === mine().id"
              (toggleMute)="player.toggleMute(inst.id)"
              (open)="openInstrument(inst.id)" />
          }
        </div>

        <a class="list-card" style="margin-top: 18px; padding: 12px 14px" [routerLink]="['/instrument', rhythm().id, mine().id]">
          <span class="monogram monogram--filled" style="width: 38px; height: 38px; border-radius: 12px; font-size: 12px">{{ mine().short }}</span>
          <div class="grow stack">
            <span class="muted">Mon instrument</span>
            <span class="strong">{{ mine().name }} · voir la décomposition</span>
          </div>
          <app-icon name="chevron-right" [size]="20" style="color: var(--muted)" />
        </a>

        @if (rhythm().description) {
          <p class="muted" style="margin-top: 14px">{{ rhythm().description }}</p>
        }

        <div class="chip-row" style="margin-top: 16px">
          @if (isCustom()) {
            <a class="action-btn" style="height: 48px" [routerLink]="['/editeur', rhythm().id]">
              <app-icon name="edit" [size]="18" />
              <span>Modifier</span>
            </a>
            <button class="action-btn" style="height: 48px" type="button" (click)="share()">
              <app-icon name="share" [size]="18" />
              <span>Partager</span>
            </button>
          } @else {
            <a class="action-btn" style="height: 48px" routerLink="/editeur" [queryParams]="{ depuis: rhythm().id }">
              <app-icon name="copy" [size]="18" />
              <span>Créer une variante</span>
            </a>
          }
        </div>
      </div>

      <div class="bottom-bar">
        <button class="action-btn" type="button" [class.action-btn--active]="countIn()" (click)="countIn.set(!countIn())">
          <app-icon name="list" [size]="18" />
          <span>Compte · 1 mesure</span>
        </button>
        <app-play-button [playing]="player.playing()" (toggle)="player.toggle()" />
        <button class="action-btn" type="button" [class.action-btn--active]="breakPending()" (click)="triggerBreak()">
          <app-icon name="flash" [size]="18" />
          <span>Break !</span>
        </button>
      </div>
    </div>
  `,
})
export class PlayerPage {
  readonly id = input.required<string>();

  readonly player = inject(PlayerService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly library = inject(RhythmLibrary);
  private readonly toast = inject(ToastService);

  readonly gridLeft = GRID_LEFT;
  readonly countIn = signal(false);
  readonly breakPending = signal(false);
  private queuedBreak: { bars: BarSpec[]; start: number | null } | null = null;
  /** Mesures de groove enchaînées depuis le dernier break : donne la phase des patterns multi-mesures. */
  private grooveRun = 0;

  readonly rhythm = computed(() => this.library.get(this.id()));
  readonly isCustom = computed(() => this.library.isCustom(this.rhythm().id));
  readonly cycle = computed(() => grooveCycle(this.rhythm()));
  /** Mesure du groove en cours d'affichage (0 à l'arrêt). */
  readonly phase = computed(() => {
    const spec = this.player.spec();
    if (!this.player.playing() || !spec || spec.label) return 0;
    return (spec.phase ?? 0) % this.cycle();
  });
  readonly mine = computed(() => getInstrument(this.rhythm(), this.settings.myInstrumentFor(this.rhythm().id)));
  readonly shownStep = computed(() => (this.player.playing() ? this.player.step() : -1));
  readonly inBreak = computed(() => this.player.playing() && this.player.spec()?.label === 'Break');
  readonly inCount = computed(() => this.player.playing() && this.player.spec()?.label === 'Compte');
  readonly mineMuted = computed(() => this.player.isMuted(this.mine().id));
  readonly allAudible = computed(() => {
    this.player.mix();
    return this.player.sequencer.muted.size === 0 && !this.player.sequencer.solo;
  });

  constructor() {
    // Nouveau rythme ouvert : on repart de zéro, on le mémorise, on remet le mixage à plat et on pose son tempo.
    effect(() => {
      const rhythm = this.rhythm();
      untracked(() => {
        this.player.stop();
        this.queuedBreak = null;
        this.breakPending.set(false);
        this.settings.update({ lastRhythmId: rhythm.id });
        this.player.resetMix();
        this.player.setBpmIfIdle(this.settings.settings().bpm[rhythm.id] ?? rhythm.bpm);
      });
    });

    // Fournisseur de mesures : compte éventuel, break en attente, sinon le groove.
    effect(() => {
      const rhythm = this.rhythm();
      const countIn = this.countIn();
      const groove = buildBarSpec(rhythm, grooveBar(rhythm));
      const count = buildBarSpec(rhythm, {}, { silent: true, click: true, label: 'Compte' });
      this.player.setProvider((bar) => {
        if (bar === 0) this.grooveRun = 0;
        if (countIn && bar === 0) return count;
        const q = this.queuedBreak;
        if (q) {
          if (q.start === null) q.start = bar;
          const i = bar - q.start;
          if (i < q.bars.length) {
            if (i === q.bars.length - 1) this.breakPending.set(false);
            // Après un break, les phrases repartent de leur première mesure.
            this.grooveRun = 0;
            return q.bars[i];
          }
          this.queuedBreak = null;
        }
        return { ...groove, phase: this.grooveRun++ };
      });
    });
  }

  changeBpm(bpm: number): void {
    this.player.setBpm(bpm);
    this.settings.setBpm(this.rhythm().id, this.player.bpm());
  }

  livePattern(instrumentId: string) {
    const spec = this.player.spec();
    return this.player.playing() && spec ? spec.patterns[instrumentId] : undefined;
  }

  unmuteAll(): void {
    this.player.setMix((seq) => {
      seq.muted.clear();
      seq.solo = null;
    });
  }

  triggerBreak(): void {
    const rhythm = this.rhythm();
    const bars = breakBars(rhythm, rhythm.breaks[0]?.id).map((b) => buildBarSpec(rhythm, b, { label: 'Break' }));
    this.queuedBreak = { bars, start: null };
    this.breakPending.set(true);
    if (!this.player.playing()) void this.player.play();
  }

  async share(): Promise<void> {
    try {
      const result = await shareRhythm(this.rhythm());
      if (result === 'copied') this.toast.show('Lien copié, colle-le dans ta conversation');
    } catch {
      this.toast.show('Impossible de partager ce rythme');
    }
  }

  openInstrument(instrumentId: string): void {
    void this.router.navigate(['/instrument', this.rhythm().id, instrumentId]);
  }
}

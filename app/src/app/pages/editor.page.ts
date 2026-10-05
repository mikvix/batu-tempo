import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { buildBarSpec, PlayerService } from '../audio/player.service';
import { defaultBreak, fitCells, INSTRUMENT_PRESETS, newCustomId, sanitizeRhythm, toPattern } from '../data/custom';
import { shareRhythm } from '../data/share';
import { barsOf, parsePattern, RhythmDef, SILENT_BAR, STEPS_PER_BAR, Velocity, VoiceId } from '../data/types';
import { Icon } from '../shared/icon';
import { NEXT_VELOCITY, StepEditor } from '../shared/step-editor';
import { TempoControl } from '../shared/tempo-control';
import { Header, PlayButton } from '../shared/ui';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { ConfirmService } from '../state/confirm.service';
import { ToastService } from '../state/toast.service';

interface DraftInstrument {
  key: string;
  name: string;
  voice: VoiceId;
  role: string;
  cells: Velocity[];
}

interface Draft {
  id: string | null;
  name: string;
  origin: string;
  level: 1 | 2 | 3;
  bpm: number;
  description: string;
  bars: number;
  instruments: DraftInstrument[];
  breakBars: number;
  breakCells: Record<string, Velocity[]>;
}

type Section = 'groove' | 'break';

const BAR_CHOICES = [1, 2, 4];
const BREAK_CHOICES = [1, 2];

function uniqueKey(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'instrument';
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  return key;
}

function newDraft(): Draft {
  const instruments: DraftInstrument[] = [
    { key: 'surdo1', name: 'Surdo 1', voice: 'surdo1', role: 'marcação', cells: parsePattern('.... X... .... X...') },
    { key: 'surdo2', name: 'Surdo 2', voice: 'surdo2', role: 'resposta', cells: parsePattern('X... .... X... ....') },
    { key: 'caixa', name: 'Caixa', voice: 'caixa', role: 'tapis', cells: parsePattern('X.x. x.x. X.x. x.x.') },
  ];
  const brk = parsePattern('X... X... X... X... | X... .... .... ....');
  return {
    id: null,
    name: 'Nouveau rythme',
    origin: 'Création',
    level: 1,
    bpm: 100,
    description: '',
    bars: 1,
    instruments,
    breakBars: 2,
    breakCells: Object.fromEntries(instruments.map((i) => [i.key, [...brk]])),
  };
}

/** Rythme existant → brouillon. `asCopy` crée une variante indépendante (nouvel id, nouveau nom). */
function draftFrom(r: RhythmDef, asCopy: boolean): Draft {
  const bars = Math.min(4, Math.max(1, ...r.instruments.map((i) => barsOf(parsePattern(i.pattern)))));
  const brk = r.breaks[0];
  const breakBars = Math.min(2, Math.max(1, brk?.bars.length ?? 1));
  const instruments: DraftInstrument[] = r.instruments.map((i) => ({
    key: i.id,
    name: i.name,
    voice: i.voice,
    role: i.role,
    cells: fitCells(parsePattern(i.pattern), bars),
  }));
  const breakCells: Record<string, Velocity[]> = {};
  for (const inst of instruments) {
    const cells: Velocity[] = [];
    for (let b = 0; b < breakBars; b++) {
      cells.push(...parsePattern(brk?.bars[b]?.[inst.key] ?? SILENT_BAR).slice(0, STEPS_PER_BAR));
    }
    breakCells[inst.key] = cells;
  }
  return {
    id: asCopy ? null : r.id,
    name: asCopy ? `${r.name} (variante)` : r.name,
    origin: r.origin,
    level: r.level,
    bpm: r.bpm,
    description: asCopy ? '' : r.description,
    bars,
    instruments,
    breakBars,
    breakCells,
  };
}

/** Brouillon → rythme au format du JSON, normalisé par sanitizeRhythm. */
function toRhythm(d: Draft, id: string): RhythmDef {
  const bars: Record<string, string>[] = [];
  for (let b = 0; b < d.breakBars; b++) {
    const bar: Record<string, string> = {};
    for (const inst of d.instruments) {
      const slice = (d.breakCells[inst.key] ?? []).slice(b * STEPS_PER_BAR, (b + 1) * STEPS_PER_BAR);
      if (slice.some((v) => v > 0)) bar[inst.key] = toPattern(slice);
    }
    bars.push(bar);
  }
  const hasBreak = bars.some((bar) => Object.keys(bar).length > 0);
  const raw = {
    id,
    name: d.name.trim() || 'Sans titre',
    origin: d.origin,
    level: d.level,
    bpm: d.bpm,
    description: d.description,
    instruments: d.instruments.map((i) => ({
      id: i.key,
      name: i.name.trim() || 'Instrument',
      // Abréviation habituelle (CX, S1…) quand le nom est celui d'un instrument connu.
      short: INSTRUMENT_PRESETS.find((p) => p.name === i.name.trim())?.short,
      role: i.role,
      voice: i.voice,
      pattern: toPattern(i.cells),
    })),
    breaks: hasBreak ? [{ id: 'break', name: 'Break', description: '', bars }] : [],
  };
  const r = sanitizeRhythm(raw) as RhythmDef;
  if (!hasBreak) r.breaks = [defaultBreak(r.instruments)];
  return r;
}

@Component({
  selector: 'app-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Header, PlayButton, TempoControl, StepEditor],
  template: `
    <div class="page page--full">
      <app-header [back]="true" fallback="/" [title]="isNew() ? 'Nouveau rythme' : 'Modifier le rythme'" [subtitle]="draft().name">
        @if (!isNew()) {
          <button class="icon-btn" type="button" aria-label="Supprimer ce rythme" (click)="remove()">
            <app-icon name="trash" [size]="20" />
          </button>
        }
      </app-header>

      <div class="page__scroll" style="padding-top: 18px">
        <div class="card stack" style="gap: 12px">
          <label class="field">
            <span class="label">Nom</span>
            <input class="input" type="text" maxlength="60" [value]="draft().name" (input)="patch({ name: value($event) })" />
          </label>
          <label class="field">
            <span class="label">Origine ou groupe</span>
            <input class="input" type="text" maxlength="60" placeholder="ex. Batucada du jeudi" [value]="draft().origin" (input)="patch({ origin: value($event) })" />
          </label>
          <div class="field">
            <span class="label">Niveau</span>
            <div class="chip-row">
              @for (l of levels; track l.level) {
                <button class="chip chip--grow" type="button" [class.chip--active]="draft().level === l.level" (click)="patch({ level: l.level })">{{ l.label }}</button>
              }
            </div>
          </div>
          <label class="field">
            <span class="label">Notes</span>
            <textarea class="input" rows="2" maxlength="300" placeholder="Consignes, appel, nuances…" [value]="draft().description" (input)="patch({ description: value($event) })"></textarea>
          </label>
        </div>

        <div style="margin-top: 14px">
          <app-tempo-control [bpm]="draft().bpm" [min]="40" [max]="220" (bpmChange)="setBpm($event)" />
        </div>

        <div class="chip-row" style="margin-top: 22px">
          <button class="chip chip--grow" type="button" [class.chip--active]="section() === 'groove'" (click)="setSection('groove')">Groove</button>
          <button class="chip chip--grow" type="button" [class.chip--active]="section() === 'break'" (click)="setSection('break')">Break</button>
        </div>

        <div class="stack" style="gap: 8px; margin-top: 14px">
          <span class="label">{{ section() === 'groove' ? 'Longueur du groove' : 'Longueur du break' }}</span>
          <div class="chip-row">
            @for (n of section() === 'groove' ? barChoices : breakChoices; track n) {
              <button class="chip chip--grow" type="button" [class.chip--active]="currentBars() === n" (click)="setBars(n)">
                {{ n }} {{ n > 1 ? 'mesures' : 'mesure' }}
              </button>
            }
          </div>
        </div>
        <p class="muted small" style="margin-top: 8px">
          Touche une case pour passer de silence à frappe, accent, ghost, puis silence.
          @if (section() === 'break') {
            Les instruments sans aucune frappe se taisent pendant le break.
          }
        </p>

        <div class="stack" style="gap: 12px; margin-top: 14px">
          @for (inst of draft().instruments; track inst.key; let i = $index) {
            <div class="card stack" style="gap: 10px; padding: 12px">
              <div class="row" style="gap: 8px">
                <input class="input input--name" type="text" maxlength="30" [value]="inst.name" [attr.aria-label]="'Nom de l\\'instrument ' + (i + 1)" (input)="patchInst(i, { name: value($event) })" />
                <select class="input input--voice" [value]="inst.voice" aria-label="Son" (change)="patchInst(i, { voice: value($event) })">
                  @for (p of presets; track p.voice) {
                    <option [value]="p.voice" [selected]="p.voice === inst.voice">{{ p.name }}</option>
                  }
                </select>
                <button class="icon-btn icon-btn--small" type="button" [attr.aria-label]="'Retirer ' + inst.name" [disabled]="draft().instruments.length < 2" (click)="removeInst(i)">
                  <app-icon name="trash" [size]="16" />
                </button>
              </div>
              @if (section() === 'groove') {
                <app-step-editor [cells]="inst.cells" [playBar]="playBar()" [playStep]="playStep()" (cellToggle)="toggleGroove(inst.key, $event)" />
              } @else {
                <app-step-editor
                  [cells]="breakCellsOf(inst.key)"
                  color="var(--break)"
                  [playBar]="playBar()"
                  [playStep]="playStep()"
                  (cellToggle)="toggleBreak(inst.key, $event)" />
              }
            </div>
          }
        </div>

        <label class="field" style="margin-top: 14px">
          <span class="label">Ajouter un instrument</span>
          <select class="input" (change)="addInst($event)">
            <option value="" selected>Choisir…</option>
            @for (p of presets; track p.voice) {
              <option [value]="p.voice">{{ p.name }}</option>
            }
          </select>
        </label>
      </div>

      <div class="bottom-bar">
        <button class="action-btn" type="button" (click)="share()">
          <app-icon name="share" [size]="18" />
          <span>Partager</span>
        </button>
        <app-play-button [playing]="player.playing()" [color]="section() === 'break' ? 'var(--break)' : 'var(--accent)'" (toggle)="player.toggle()" />
        <button class="action-btn action-btn--active" type="button" (click)="save()">
          <span>Enregistrer</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    .field { display: flex; flex-direction: column; gap: 6px; }
    .input { width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font: inherit; font-size: 15px; user-select: text; -webkit-user-select: text; }
    .input:focus { outline: none; border-color: var(--accent); }
    textarea.input { resize: vertical; }
    select.input { appearance: none; -webkit-appearance: none; padding-right: 30px;
      background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%);
      background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
    .input--name { flex: 1 1 auto; min-width: 0; font-weight: 700; }
    .input--voice { flex: 0 0 auto; width: 130px; font-size: 13px; }
    .icon-btn--small { width: 40px; height: 40px; border-radius: 12px; }
    .icon-btn:disabled { opacity: 0.35; }
  `,
})
export class EditorPage implements OnDestroy {
  /** Paramètre de route : id du rythme personnel à modifier (absent pour une création). */
  readonly id = input<string>();
  /** Query param `?depuis=` : crée une variante à partir d'un rythme existant. */
  readonly depuis = input<string>();

  readonly player = inject(PlayerService);
  private readonly library = inject(RhythmLibrary);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly presets = INSTRUMENT_PRESETS;
  readonly barChoices = BAR_CHOICES;
  readonly breakChoices = BREAK_CHOICES;
  readonly levels = [
    { level: 1 as const, label: 'Débutant' },
    { level: 2 as const, label: 'Intermédiaire' },
    { level: 3 as const, label: 'Avancé' },
  ];

  readonly draft = signal<Draft>(newDraft());
  readonly section = signal<Section>('groove');
  readonly dirty = signal(false);
  readonly isNew = computed(() => this.draft().id === null);
  readonly currentBars = computed(() => (this.section() === 'groove' ? this.draft().bars : this.draft().breakBars));

  /** Rythme équivalent au brouillon, utilisé par la prévisualisation et le partage. */
  private readonly preview = computed(() => toRhythm(this.draft(), this.draft().id ?? 'perso-brouillon'));

  readonly playBar = computed(() => {
    const spec = this.player.spec();
    if (!this.player.playing() || !spec) return -1;
    return (spec.phase ?? 0) % this.currentBars();
  });
  readonly playStep = computed(() => (this.player.playing() ? this.player.step() : -1));

  constructor() {
    // Chargement du brouillon : rythme personnel existant, variante d'un rythme, ou création.
    effect(() => {
      const id = this.id();
      const from = this.depuis();
      untracked(() => {
        this.player.stop();
        this.player.resetMix();
        this.player.sequencer.muted.clear();
        const existing = id ? this.library.find(id) : undefined;
        const source = from ? this.library.find(from) : undefined;
        if (existing && this.library.isCustom(existing.id)) this.draft.set(draftFrom(existing, false));
        else if (source) this.draft.set(draftFrom(source, true));
        else this.draft.set(newDraft());
        this.dirty.set(false);
        this.player.setBpm(this.draft().bpm);
      });
    });

    // Prévisualisation : les modifications s'entendent dès la mesure suivante.
    this.player.setProvider((bar) => {
      const r = this.preview();
      if (this.section() === 'break') {
        const n = this.draft().breakBars;
        const breakBarsSpecs = r.breaks[0].bars.map((b, i) => buildBarSpec(r, fillBar(r, b), { phase: i }));
        return breakBarsSpecs[bar % n] ?? breakBarsSpecs[0];
      }
      return { ...buildBarSpec(r, {}), phase: bar };
    });
  }

  ngOnDestroy(): void {
    this.player.stop();
  }

  /** Utilisé par le garde de route : confirmation si des modifications ne sont pas enregistrées. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty()) return true;
    return this.confirm.ask('Quitter sans enregistrer les modifications ?', { confirmLabel: 'Quitter', danger: true });
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  patch(p: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...p }));
    this.dirty.set(true);
  }

  patchInst(index: number, p: Partial<Omit<DraftInstrument, 'voice'>> & { voice?: string }): void {
    this.draft.update((d) => ({
      ...d,
      instruments: d.instruments.map((inst, i) => (i === index ? { ...inst, ...(p as Partial<DraftInstrument>) } : inst)),
    }));
    this.dirty.set(true);
  }

  setBpm(bpm: number): void {
    const clamped = Math.round(Math.min(220, Math.max(40, bpm)));
    this.patch({ bpm: clamped });
    this.player.setBpm(clamped);
  }

  setSection(s: Section): void {
    this.section.set(s);
  }

  setBars(n: number): void {
    if (this.section() === 'groove') {
      this.draft.update((d) => ({ ...d, bars: n, instruments: d.instruments.map((i) => ({ ...i, cells: fitCells(i.cells, n) })) }));
    } else {
      this.draft.update((d) => ({
        ...d,
        breakBars: n,
        breakCells: Object.fromEntries(
          d.instruments.map((i) => {
            const cells = d.breakCells[i.key] ?? [];
            const next = Array.from({ length: n * STEPS_PER_BAR }, (_, k) => (cells[k] ?? 0) as Velocity);
            return [i.key, next];
          })
        ),
      }));
    }
    this.dirty.set(true);
  }

  breakCellsOf(key: string): Velocity[] {
    const d = this.draft();
    const cells = d.breakCells[key] ?? [];
    return Array.from({ length: d.breakBars * STEPS_PER_BAR }, (_, k) => (cells[k] ?? 0) as Velocity);
  }

  toggleGroove(key: string, index: number): void {
    this.draft.update((d) => ({
      ...d,
      instruments: d.instruments.map((inst) => {
        if (inst.key !== key) return inst;
        const cells = [...inst.cells];
        cells[index] = NEXT_VELOCITY[cells[index] ?? 0];
        return { ...inst, cells };
      }),
    }));
    this.dirty.set(true);
  }

  toggleBreak(key: string, index: number): void {
    this.draft.update((d) => {
      const cells = Array.from({ length: d.breakBars * STEPS_PER_BAR }, (_, k) => (d.breakCells[key]?.[k] ?? 0) as Velocity);
      cells[index] = NEXT_VELOCITY[cells[index]];
      return { ...d, breakCells: { ...d.breakCells, [key]: cells } };
    });
    this.dirty.set(true);
  }

  addInst(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const preset = this.presets.find((p) => p.voice === select.value);
    select.value = '';
    if (!preset) return;
    this.draft.update((d) => {
      const key = uniqueKey(preset.name, new Set(d.instruments.map((i) => i.key)));
      const sameName = d.instruments.filter((i) => i.voice === preset.voice).length;
      return {
        ...d,
        instruments: [
          ...d.instruments,
          {
            key,
            name: sameName ? `${preset.name} ${sameName + 1}` : preset.name,
            voice: preset.voice,
            role: preset.role,
            cells: new Array<Velocity>(d.bars * STEPS_PER_BAR).fill(0),
          },
        ],
        breakCells: { ...d.breakCells, [key]: new Array<Velocity>(d.breakBars * STEPS_PER_BAR).fill(0) },
      };
    });
    this.dirty.set(true);
  }

  removeInst(index: number): void {
    this.draft.update((d) => {
      if (d.instruments.length < 2) return d;
      const removed = d.instruments[index];
      const breakCells = { ...d.breakCells };
      delete breakCells[removed.key];
      return { ...d, instruments: d.instruments.filter((_, i) => i !== index), breakCells };
    });
    this.dirty.set(true);
  }

  save(): void {
    const d = this.draft();
    const id = d.id ?? newCustomId(d.name);
    const rhythm = toRhythm(d, id);
    this.library.save(rhythm);
    this.dirty.set(false);
    this.toast.show('Rythme enregistré');
    void this.router.navigate(['/rythme', rhythm.id], { replaceUrl: true });
  }

  async share(): Promise<void> {
    const d = this.draft();
    if (d.id === null || this.dirty()) {
      // On enregistre d'abord : le lien partagé correspond alors exactement à ce qui est sur l'appareil.
      const id = d.id ?? newCustomId(d.name);
      this.draft.update((x) => ({ ...x, id }));
      this.library.save(toRhythm(this.draft(), id));
      this.dirty.set(false);
    }
    try {
      const result = await shareRhythm(this.library.get(this.draft().id ?? undefined));
      if (result === 'copied') this.toast.show('Lien copié, colle-le dans ta conversation');
    } catch {
      this.toast.show('Impossible de partager ce rythme');
    }
  }

  async remove(): Promise<void> {
    const id = this.draft().id;
    if (!id) return;
    const ok = await this.confirm.ask(`Supprimer « ${this.draft().name} » de tes rythmes ?`, { confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    this.library.remove(id);
    this.dirty.set(false);
    this.toast.show('Rythme supprimé');
    void this.router.navigate(['/'], { replaceUrl: true });
  }
}

/** Mesure de break complète : les instruments absents se taisent. */
function fillBar(r: RhythmDef, bar: Record<string, string>): Record<string, string> {
  const full: Record<string, string> = {};
  for (const inst of r.instruments) full[inst.id] = bar[inst.id] ?? SILENT_BAR;
  return full;
}

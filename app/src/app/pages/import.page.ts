import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';

import { buildBarSpec, PlayerService } from '../audio/player.service';
import { sanitizeRhythm } from '../data/custom';
import { decodeRhythm } from '../data/share';
import { RhythmDef } from '../data/types';
import { LEVELS } from '../data/rhythms';
import { Icon } from '../shared/icon';
import { Header, PlayButton } from '../shared/ui';
import { RhythmLibrary } from '../state/rhythm-library.service';
import { ToastService } from '../state/toast.service';

/**
 * Page ouverte par un lien partagé : https://…/batu-tempo/import#<rythme encodé>.
 * Le rythme voyage entièrement dans le fragment de l'URL, aucun serveur n'est sollicité.
 */
@Component({
  selector: 'app-import-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Header, PlayButton],
  template: `
    <div class="page page--full">
      <app-header [back]="true" fallback="/" title="Rythme partagé" [subtitle]="rhythm()?.name ?? ''" />

      <div class="page__scroll" style="padding-top: 18px">
        @if (error()) {
          <div class="card stack" style="gap: 8px">
            <span class="strong">Ce lien ne contient pas de rythme lisible</span>
            <span class="muted">{{ error() }}</span>
          </div>
        } @else if (rhythm(); as r) {
          <div class="card stack" style="gap: 10px">
            <span class="display" style="font-size: 26px">{{ r.name }}</span>
            <span class="muted">{{ r.origin }} · {{ r.bpm }} BPM · {{ levelLabel(r.level) }}</span>
            @if (r.description) {
              <p class="muted">{{ r.description }}</p>
            }
          </div>

          <p class="label" style="margin-top: 22px">{{ r.instruments.length }} instruments</p>
          <div class="stack" style="gap: 8px; margin-top: 10px">
            @for (inst of r.instruments; track inst.id) {
              <div class="list-card" style="padding: 10px 14px">
                <span class="monogram" style="width: 38px; height: 38px; border-radius: 12px; font-size: 12px">{{ inst.short }}</span>
                <div class="grow stack">
                  <span class="strong">{{ inst.name }}</span>
                  <span class="muted small">{{ inst.role }}</span>
                </div>
              </div>
            }
          </div>

          @if (existing()) {
            <p class="muted" style="margin-top: 16px">Tu as déjà ce rythme : l'ajouter remplacera ta version.</p>
          }
        } @else {
          <p class="muted">Lecture du lien…</p>
        }
      </div>

      @if (rhythm()) {
        <div class="bottom-bar">
          <span class="grow muted small">Écoute avant d'ajouter</span>
          <app-play-button [playing]="player.playing()" (toggle)="player.toggle()" />
          <button class="action-btn action-btn--active" type="button" (click)="add()">
            <app-icon name="plus" [size]="18" />
            <span>{{ existing() ? 'Mettre à jour' : 'Ajouter' }}</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class ImportPage implements OnDestroy {
  readonly player = inject(PlayerService);
  private readonly library = inject(RhythmLibrary);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly rhythm = signal<RhythmDef | null>(null);
  readonly error = signal<string | null>(null);
  readonly existing = computed(() => {
    const r = this.rhythm();
    return r ? this.library.isCustom(r.id) : false;
  });

  constructor() {
    this.player.stop();
    this.player.resetMix();
    void this.read(window.location.hash.slice(1));
  }

  ngOnDestroy(): void {
    this.player.stop();
  }

  private async read(code: string): Promise<void> {
    if (!code) {
      this.error.set('Le lien est incomplet : il manque la partie après le #.');
      return;
    }
    try {
      const r = sanitizeRhythm(await decodeRhythm(code));
      if (!r) throw new Error('Le rythme est vide ou mal formé.');
      this.rhythm.set(r);
      this.player.setBpm(r.bpm);
      const spec = buildBarSpec(r, {});
      this.player.setProvider((bar) => ({ ...spec, phase: bar }));
    } catch (e) {
      this.error.set((e as Error).message || 'Lien illisible.');
    }
  }

  levelLabel(level: 1 | 2 | 3): string {
    return LEVELS.find((l) => l.level === level)?.label ?? '';
  }

  add(): void {
    const r = this.rhythm();
    if (!r) return;
    const update = this.existing();
    this.library.save(r);
    this.toast.show(update ? 'Rythme mis à jour' : 'Rythme ajouté à tes rythmes');
    void this.router.navigate(['/rythme', r.id], { replaceUrl: true });
  }
}

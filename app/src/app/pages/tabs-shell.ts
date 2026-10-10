import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { PlayerService } from '../audio/player.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-tabs-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <div class="shell">
      <div class="shell__content">
        <router-outlet />
      </div>
      <nav class="tabs" aria-label="Navigation principale">
        <a routerLink="/" routerLinkActive="tabs__item--active" [routerLinkActiveOptions]="{ exact: true }" class="tabs__item">
          <app-icon name="pulse" [size]="24" />
          <span>Rythmes</span>
        </a>
        <a routerLink="/parcours" routerLinkActive="tabs__item--active" class="tabs__item">
          <app-icon name="route" [size]="24" />
          <span>Parcours</span>
        </a>
        <a routerLink="/exercices" routerLinkActive="tabs__item--active" class="tabs__item">
          <app-icon name="target" [size]="24" />
          <span>Exercices</span>
        </a>
        <a routerLink="/metronome" routerLinkActive="tabs__item--active" class="tabs__item">
          <app-icon name="metronome" [size]="24" />
          <span>Métronome</span>
        </a>
        <a routerLink="/profil" routerLinkActive="tabs__item--active" class="tabs__item">
          <app-icon name="person" [size]="24" />
          <span>Profil</span>
        </a>
      </nav>
    </div>
  `,
  styles: `
    .shell { display: flex; flex-direction: column; height: 100dvh; }
    .shell__content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .tabs { display: flex; justify-content: space-around; padding: 10px 8px calc(var(--safe-bottom) + 12px);
      border-top: 1px solid var(--border-soft); background: var(--tabbar); }
    .tabs__item { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1 1 0; max-width: 80px; min-width: 0; padding: 6px 0;
      color: var(--muted); font-size: 11px; font-weight: 600; }
    .tabs__item--active { color: var(--accent); }

    /* Tablette et desktop : la barre d'onglets devient un rail vertical à gauche. */
    @media (min-width: 768px) {
      .shell { flex-direction: row; }
      .tabs { order: -1; flex-direction: column; justify-content: flex-start; gap: 6px; width: 96px; flex: 0 0 auto;
        padding: calc(var(--safe-top) + 24px) 8px 24px; border-top: none; border-right: 1px solid var(--border-soft); }
      .tabs__item { flex: none; width: 100%; max-width: none; padding: 12px 0; border-radius: 14px; }
      .tabs__item--active { background: var(--surface); }
    }
    @media (hover: hover) {
      .tabs__item:hover { color: var(--text); }
      .tabs__item--active:hover { color: var(--accent); }
    }
  `,
})
export class TabsShell {
  constructor() {
    // Retour aux onglets depuis un rythme ou un exercice : on coupe la lecture.
    inject(PlayerService).stop();
  }
}

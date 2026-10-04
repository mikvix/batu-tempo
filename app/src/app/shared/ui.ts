import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { Icon } from './icon';

/** En-tête de page : bouton retour optionnel, titre, sous-titre, et un emplacement à droite. */
@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <header class="header page__top">
      @if (back()) {
        <button class="icon-btn" type="button" aria-label="Retour" (click)="goBack()">
          <app-icon name="back" />
        </button>
      }
      <div class="grow">
        <h1 class="header__title">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="muted header__sub">{{ subtitle() }}</p>
        }
      </div>
      <ng-content />
    </header>
  `,
  styles: `
    .header { display: flex; align-items: center; gap: 12px; padding-left: 20px; padding-right: 20px; }
    .header__title { font-family: var(--font-display); font-weight: 800; font-size: 22px; letter-spacing: -0.02em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .header__sub { margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `,
})
export class Header {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly back = input(false);
  readonly fallback = input('/');

  private readonly location = inject(Location);
  private readonly router = inject(Router);

  goBack(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl(this.fallback());
  }
}

/** Gros bouton rond Lecture / Pause. */
@Component({
  selector: 'app-play-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      class="play"
      type="button"
      [attr.aria-label]="playing() ? 'Pause' : 'Lancer'"
      [style.background]="color()"
      [style.box-shadow]="'0 8px 24px ' + color() + '59'"
      (click)="toggle.emit()">
      <app-icon [name]="playing() ? 'pause' : 'play'" [size]="32" [filled]="true" />
    </button>
  `,
  styles: `
    .play { width: 76px; height: 76px; border-radius: 50%; color: var(--on-accent); display: grid; place-items: center;
      flex: 0 0 auto; transition: transform 80ms; }
    .play:active { transform: scale(0.96); opacity: 1; }
  `,
})
export class PlayButton {
  readonly playing = input(false);
  readonly color = input('var(--accent)');
  readonly toggle = output<void>();
}

/** Trois points de niveau. */
@Component({
  selector: 'app-level-dots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="level-dots" [attr.aria-label]="label()">
      @for (i of [1, 2, 3]; track i) {
        <i [class.on]="i <= level()"></i>
      }
    </span>
  `,
})
export class LevelDots {
  readonly level = input.required<1 | 2 | 3>();

  label(): string {
    return levelLabel(this.level());
  }
}

export function levelLabel(level: 1 | 2 | 3): string {
  return level === 1 ? 'Débutant' : level === 2 ? 'Intermédiaire' : 'Avancé';
}

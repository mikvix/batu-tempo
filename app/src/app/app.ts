import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

import { PlayerService } from './audio/player.service';
import { ConfirmService } from './state/confirm.service';
import { SettingsService } from './state/settings.service';
import { ToastService } from './state/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (toast.message(); as message) {
      <div class="toast" role="status" aria-live="polite">{{ message }}</div>
    }
    @if (confirm.request(); as req) {
      <div class="backdrop" (click)="req.resolve(false)">
        <div class="dialog" role="alertdialog" aria-modal="true" [attr.aria-label]="req.message" (click)="$event.stopPropagation()">
          <p class="dialog__msg">{{ req.message }}</p>
          <div class="dialog__actions">
            <button class="dialog__btn" type="button" (click)="req.resolve(false)">Annuler</button>
            <button class="dialog__btn dialog__btn--ok" [class.dialog__btn--danger]="req.danger" type="button" (click)="req.resolve(true)">
              {{ req.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.6); display: grid; place-items: center; padding: 20px; }
    .dialog { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
      padding: 20px; display: flex; flex-direction: column; gap: 18px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); }
    .dialog__msg { font-weight: 600; font-size: 16px; line-height: 1.4; }
    .dialog__actions { display: flex; gap: 10px; }
    .dialog__btn { flex: 1 1 0; height: 48px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg);
      font-weight: 700; font-size: 14px; }
    .dialog__btn--ok { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
    .dialog__btn--danger { background: var(--break); border-color: var(--break); color: var(--on-break); }
    .toast { position: fixed; left: 50%; bottom: calc(var(--safe-bottom) + 112px); transform: translateX(-50%); z-index: 50;
      max-width: calc(100% - 40px); padding: 12px 18px; border-radius: 14px; background: var(--text); color: var(--bg);
      font-weight: 700; font-size: 14px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); text-align: center; }
  `,
})
export class App {
  // Instancié dès le démarrage pour charger les réglages persistés.
  private readonly settings = inject(SettingsService);
  readonly toast = inject(ToastService);
  readonly confirm = inject(ConfirmService);
  private readonly player = inject(PlayerService);
  private readonly swUpdate = inject(SwUpdate);
  private updateWaiting = false;

  constructor() {
    // Version web installée : dès qu'une nouvelle version est prête, on recharge la page (même adresse,
    // fragment compris), sauf pendant une lecture où l'on attend l'arrêt. Sans ça, un lien vers une page
    // ajoutée récemment (ex. /import#…) serait ouvert par l'ancienne version en cache.
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((event) => {
        if (event.type !== 'VERSION_READY') return;
        if (!this.player.playing()) {
          document.location.reload();
        } else if (!this.updateWaiting) {
          this.updateWaiting = true;
          this.toast.show('Nouvelle version prête : elle s’appliquera à l’arrêt de la lecture', 4000);
          this.player.sequencer.subscribe({ onStop: () => document.location.reload() });
        }
      });
    }
  }
}

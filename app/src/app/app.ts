import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

import { PlayerService } from './audio/player.service';
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
  `,
  styles: `
    .toast { position: fixed; left: 50%; bottom: calc(var(--safe-bottom) + 112px); transform: translateX(-50%); z-index: 50;
      max-width: calc(100% - 40px); padding: 12px 18px; border-radius: 14px; background: var(--text); color: var(--bg);
      font-weight: 700; font-size: 14px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); text-align: center; }
  `,
})
export class App {
  // Instancié dès le démarrage pour charger les réglages persistés.
  private readonly settings = inject(SettingsService);
  readonly toast = inject(ToastService);
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


    if (Capacitor.isNativePlatform()) {
      void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
      if (Capacitor.getPlatform() === 'android') {
        void StatusBar.setBackgroundColor({ color: '#141216' }).catch(() => undefined);
      }
    }
  }
}

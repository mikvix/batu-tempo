import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

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

  constructor() {
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
      if (Capacitor.getPlatform() === 'android') {
        void StatusBar.setBackgroundColor({ color: '#141216' }).catch(() => undefined);
      }
    }
  }
}

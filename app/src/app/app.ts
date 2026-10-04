import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

import { SettingsService } from './state/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  // Instancié dès le démarrage pour charger les réglages persistés.
  private readonly settings = inject(SettingsService);

  constructor() {
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
      if (Capacitor.getPlatform() === 'android') {
        void StatusBar.setBackgroundColor({ color: '#141216' }).catch(() => undefined);
      }
    }
  }
}

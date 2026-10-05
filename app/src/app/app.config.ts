import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';

import { routes } from './app.routes';
import { RhythmLibrary } from './state/rhythm-library.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Les rythmes personnels sont chargés avant la première navigation : un lien direct vers
    // /rythme/perso-… ouvre bien ce rythme et pas le rythme par défaut.
    provideAppInitializer(() => inject(RhythmLibrary).load()),
    provideRouter(routes, withComponentInputBinding()),
    // Le service worker rend la version web installable et utilisable hors ligne.
    // Inutile dans l'app Capacitor (les fichiers sont déjà embarqués) et absent en développement.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !Capacitor.isNativePlatform(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

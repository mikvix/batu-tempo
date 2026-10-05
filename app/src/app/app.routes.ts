import { Routes } from '@angular/router';

import type { EditorPage } from './pages/editor.page';
import { TabsShell } from './pages/tabs-shell';

/** Confirme avant de quitter l'éditeur avec des modifications non enregistrées. */
const leaveEditor = (page: EditorPage) => page.canLeave();

export const routes: Routes = [
  {
    path: '',
    component: TabsShell,
    children: [
      { path: '', loadComponent: () => import('./pages/rhythms.page').then((m) => m.RhythmsPage) },
      { path: 'exercices', loadComponent: () => import('./pages/exercises.page').then((m) => m.ExercisesPage) },
      { path: 'metronome', loadComponent: () => import('./pages/metronome.page').then((m) => m.MetronomePage) },
      { path: 'profil', loadComponent: () => import('./pages/profile.page').then((m) => m.ProfilePage) },
    ],
  },
  { path: 'rythme/:id', loadComponent: () => import('./pages/player.page').then((m) => m.PlayerPage) },
  {
    path: 'instrument/:rhythm/:inst',
    loadComponent: () => import('./pages/instrument.page').then((m) => m.InstrumentPage),
  },
  { path: 'exercice/:id', loadComponent: () => import('./pages/exercise.page').then((m) => m.ExercisePage) },
  {
    path: 'editeur',
    loadComponent: () => import('./pages/editor.page').then((m) => m.EditorPage),
    canDeactivate: [leaveEditor],
  },
  {
    path: 'editeur/:id',
    loadComponent: () => import('./pages/editor.page').then((m) => m.EditorPage),
    canDeactivate: [leaveEditor],
  },
  { path: 'import', loadComponent: () => import('./pages/import.page').then((m) => m.ImportPage) },
  { path: '**', redirectTo: '' },
];

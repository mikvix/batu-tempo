import { ExerciseDef } from './types';

export const EXERCISES: ExerciseDef[] = [
  {
    id: 'break',
    name: 'Break & reprise',
    tagline: 'BREAK · REPRISE',
    description:
      "Le groupe joue quelques mesures, s'arrête sur un break, puis reprend. Objectif : rentrer pile sur le 1.",
    level: 2,
    tags: ['Breaks', 'Reprises'],
  },
  {
    id: 'blind',
    name: "Reprise à l'aveugle",
    tagline: 'REPRISE',
    description: 'Le son coupe deux mesures, tu continues seul. Le groupe revient : es-tu encore en place ?',
    level: 3,
    tags: ['Reprises', 'Tempo'],
  },
  {
    id: 'call',
    name: 'Appel du repique',
    tagline: 'APPEL',
    description: "Reconnaître l'appel et enchaîner le break au bon moment avec ton instrument.",
    level: 2,
    tags: ['Appels', 'Breaks'],
  },
  {
    id: 'tempo',
    name: 'Tempo qui bouge',
    tagline: 'TEMPO',
    description: 'Accélérations et ralentis progressifs à suivre sans décrocher.',
    level: 1,
    tags: ['Tempo'],
  },
  {
    id: 'countdown',
    name: 'Compte à rebours',
    tagline: 'BREAK',
    description: 'Le break est annoncé 4, 3, 2, 1 par la cloche. On entre tous ensemble sur le 1.',
    level: 1,
    tags: ['Breaks'],
  },
];

export const EXERCISE_FILTERS = ['Tous', 'Breaks', 'Reprises', 'Tempo', 'Appels'];

export function getExercise(id: string | undefined): ExerciseDef {
  return EXERCISES.find((e) => e.id === id) ?? EXERCISES[0];
}

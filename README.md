# Batu Tempo

Application web (PWA) pour s'entraîner à la batucada : lancer un rythme, isoler ou couper chaque instrument, ralentir sa propre partie, et travailler les breaks et les reprises sur le tempo.

Stack : **Angular 21** (standalone, signaux, zoneless), installable comme PWA. Le son est produit par la Web Audio API du navigateur, entièrement synthétisé (aucun sample).

En ligne : https://mikvix.github.io/batu-tempo/

## Contenu du dépôt

| Dossier | Rôle |
| --- | --- |
| `app/` | L'application Angular. |
| `maquette/` | Les maquettes cliquables (artboards HTML du canvas de design). |

## Lancer l'app

```bash
cd app
npm install
npm start            # http://localhost:4200, le son marche directement dans le navigateur
```

### Version web (PWA)

`npm run build` produit un site statique dans `app/dist/batu-tempo/browser`, à déposer tel quel sur un hébergement statique. C'est une PWA : manifeste, icônes, et service worker qui met l'app en cache pour qu'elle fonctionne hors ligne et puisse s'installer sur l'écran d'accueil depuis le navigateur (« Ajouter à l'écran d'accueil »). Le service worker n'est actif qu'en production, servi en HTTPS (ou sur `localhost`).

L'app utilise des URL propres : l'hébergeur doit renvoyer `index.html` pour toute route inconnue. Le fichier `public/_redirects` le fait pour Netlify et Cloudflare Pages ; pour Vercel, ajouter un `vercel.json` avec une règle `rewrites` vers `/index.html` ; pour nginx, `try_files $uri /index.html`. Pour GitHub Pages, copier `index.html` en `404.html` dans le dossier publié. Si le site n'est pas à la racine du domaine, construire avec `ng build --base-href /sous-dossier/`.

Pour tester la PWA en local comme en production : `npm run serve:web` puis http://localhost:4300.

#### GitHub Pages

Le workflow `.github/workflows/pages.yml` construit et déploie le site à chaque push sur `main`, à l'adresse https://mikvix.github.io/batu-tempo/. Il construit avec `--base-href /batu-tempo/` et copie `index.html` en `404.html` pour que les routes profondes fonctionnent. À faire une fois dans les réglages du dépôt : Settings → Pages → Source = « GitHub Actions ». Sur un compte gratuit, GitHub Pages n'est disponible que pour un dépôt public.

## Architecture

```
app/src/app/
  app.routes.ts              routes (onglets + écrans de détail, chargés à la demande)
  pages/
    tabs-shell.ts            coque avec la barre d'onglets
    rhythms.page.ts          Rythmes
    exercises.page.ts        Liste des exercices
    metronome.page.ts        Métronome
    profile.page.ts          Mon instrument, réglages
    player.page.ts           Lecteur d'un rythme (grille par instrument, tempo, mute, break à la volée)
    instrument.page.ts       Décomposition d'un instrument (mains, accents, vitesse, variations)
    exercise.page.ts         Exercice en cours (break & reprise, reprise à l'aveugle, appel, tempo, compte à rebours)
    parcours.page.ts         Parcours guidé : étapes à étoiles, mission du jour, accès au réglage du micro
    mic-setup.page.ts        Réglage du micro : mode (micro / toucher), sensibilité, mesure du décalage à la bille
    game.page.ts             « Suis le rythme » : notes qui descendent, jugées au micro ou au toucher
    call.page.ts             « Répondre à l'appel » : reproduire l'appel du repique, 3 vies
    tempo-solo.page.ts       « Tiens le tempo seul » : le groupe se tait, on mesure la dérive
  audio/
    engine.ts                AudioContext unique, sortie passée par un limiteur
    synth.ts                 Sons synthétisés de chaque instrument
    sequencer.ts             Séquenceur 16 pas, planification anticipée, mesures fournies par un provider
    player.service.ts        Service Angular (signaux) autour du séquenceur global
    mic.service.ts           Micro + détecteur de frappes (AudioWorklet public/onset-processor.js)
    hit-input.service.ts     Source unique des frappes (micro corrigé du décalage, ou toucher)
  exercises/                 Jugement des frappes (fenêtres, étoiles), boucle d'images, étapes du parcours
  state/progress.service.ts  Progression (XP, étoiles par étape, jours de pratique)
  data/
    rhythms.json             Rythmes, instruments, patterns, breaks, appels (données)
    rhythms.ts               Chargement, vérification et tri du JSON
    exercises.ts             Catalogue des exercices
    types.ts                 Types et parseur de patterns
  state/settings.service.ts  Réglages persistés (localStorage)
  shared/                    Icônes SVG, en-tête, bouton lecture, contrôle de tempo, grilles
```

Le séquenceur est unique pour toute l'app : la lecture continue quand on change d'écran, et chaque page installe simplement son fournisseur de mesures. Les notes sont planifiées 140 ms à l'avance sur l'horloge audio, ce qui donne un tempo stable même si le JavaScript a un peu de retard.

## Exercices au micro

Le parcours guidé juge les frappes du musicien sur son vrai instrument. Le micro passe par un AudioWorklet (`app/public/onset-processor.js`) qui tourne sur l'horloge de l'AudioContext, la même que le séquenceur : chaque frappe est datée à l'échantillon près et comparée aux notes attendues. Le détecteur filtre tout ce qui est sous 1,2 kHz (la résonance grave d'un surdo dure une demi-seconde et masquerait les attaques) puis compare une enveloppe rapide à un niveau ambiant : une attaque est un saut net au-dessus de l'ambiant. La sensibilité (1 à 5) règle le niveau minimal d'une attaque et le rapport exigé ; 3 convient à un tambour joué normalement.

Le réglage du micro mesure le décalage entre le son entendu et la frappe captée : une bille fait l'aller-retour entre deux cibles avec un clic à chaque arrivée, chaque frappe détectée se pose sur la piste à l'endroit où était la bille une fois le décalage estimé retiré, et la mesure se valide quand six arrivées consécutives tiennent dans 40 ms. Ce décalage est ensuite retiré de toutes les frappes captées. Sans casque, le micro entend aussi l'app : le niveau capté pendant le décompte sert de plancher pour ignorer ses propres sons.

## Icônes

La source unique est `app/assets/logo.png` (carré, 1024 px). `npm run assets` en dérive le favicon, l'icône d'écran d'accueil iOS et les icônes du manifeste de la PWA, dont une version « maskable » où le visuel est réduit dans la zone sûre sur fond sombre. Pour changer de visuel, remplace ce fichier et relance la commande.

## Créer et partager des rythmes depuis l'app

Depuis l'accueil, « Créer un rythme » ouvre l'éditeur : nom, niveau, tempo, longueur du groove (1, 2 ou 4 mesures) et du break (1 ou 2 mesures), puis une grille par instrument où chaque case tourne au toucher entre silence, frappe, accent et ghost. La lecture joue le brouillon en direct : une case modifiée s'entend dès la mesure suivante. Sur un rythme livré, « Créer une variante » ouvre l'éditeur prérempli.

Les rythmes créés sont enregistrés dans le navigateur (section « Mes rythmes » de l'accueil) et utilisables partout : lecteur, décomposition, exercices. « Partager » produit un lien `…/batu-tempo/import#…` qui contient tout le rythme, compressé dans le fragment de l'URL : aucun serveur n'est sollicité, et la personne qui ouvre le lien peut écouter le rythme puis l'ajouter à ses propres rythmes. Pour intégrer un rythme au catalogue livré avec l'app, il suffit de recopier son contenu dans `rhythms.json`.

Code concerné : `pages/editor.page.ts`, `pages/import.page.ts`, `shared/step-editor.ts`, `data/custom.ts` (conversion, validation des données reçues), `data/share.ts` (encodage du lien), `state/rhythm-library.service.ts` (rythmes livrés + personnels).

## Modifier les rythmes

Tout se passe dans `app/src/app/data/rhythms.json` (le fichier `rhythms.ts` ne fait que le charger, le vérifier et le trier par niveau). Chaque rythme a un `level` (1 débutant, 2 intermédiaire, 3 avancé), un tempo de référence et une plage, des instruments avec leur `voice` (le son synthétisé utilisé), des breaks et éventuellement un appel. Au démarrage, une vérification signale en console les voix inconnues, les patterns mal formés et les instruments manquants dans un break. Un pattern est une chaîne de 16 caractères par mesure (doubles-croches), les espaces servent juste à lire les temps :

```
X = accent   x = frappe   o = ghost note   . = silence
caixa : 'XooX ooXo ooXo Xooo'
```

Un pattern peut couvrir plusieurs mesures : 32 caractères pour une phrase de 2 mesures, 64 pour 4 (le `|` entre les mesures est décoratif). Il boucle sur sa propre longueur pendant que les patterns d'une mesure se répètent dessous, et toutes les phrases repartent de leur première mesure après un break. La grille du lecteur affiche la mesure en cours avec un repère « 1/2 », « 2/2 », et la décomposition d'un instrument montre toutes les mesures de sa phrase.

Un break est une liste de mesures ; chaque mesure indique le pattern de chaque instrument qui joue, les autres se taisent. Les patterns livrés sont indicatifs : remplace-les par ceux de ta batucada.

Pour remplacer un son synthétisé par un vrai sample, il suffit de changer la voix correspondante dans `app/src/app/audio/synth.ts` (le séquenceur ne connaît que des identifiants de voix).

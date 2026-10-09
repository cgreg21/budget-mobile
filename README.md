# Budget Mobile

Application mobile NativeScript + Angular + TypeScript, portage de `budget-app` (node-gtk).

## Fonctionnalités

- Navigation par mois (passé/futur), totaux revenus / dépenses / solde coloré selon les seuils
- Ajout, modification, suppression de transactions (balayage d'une ligne vers la gauche = supprimer, avec confirmation), recherche et filtres
- Transactions récurrentes (mensuelle, trimestrielle, annuelle, nombre d'occurrences limité), modification d'une occurrence ou de la série
- Catégories avec icônes symboliques, seuils du solde, statistiques par catégorie et historique mensuel
- Menu latéral (`nativescript-ui-sidedrawer`, comme le modèle *drawer-navigation* officiel, ouvert par le
  bouton ☰ ou un balayage depuis le bord gauche, fermé par un balayage vers la gauche) : Transactions, Catégories (création, modification, suppression, choix d'icône),
  Statistiques, Historique et Réglages. L'en-tête
  ne garde que le bouton du menu et, sur l'accueil, celui des filtres.
- Réglages : langue (fr/en), devise, formats de date et de montant, thème clair/sombre/système

La logique métier (transactions, mois, récurrences) vient de la
bibliothèque partagée [`budget-lib`](https://github.com/cgreg21/budget-lib), commune avec la version GTK ; les transactions,
catégories et récurrences sont stockées dans une base SQLite (`budget.db`, `core/database.ts`), les
anciennes données `ApplicationSettings` (`month:AAAA-MM`, catégories, récurrences) étant migrées au
premier lancement. Si la bibliothèque SQLite native n'est pas disponible dans l'application en cours
(client Preview, build antérieur à l'ajout du plugin), les données restent dans `ApplicationSettings`.
La configuration (réglages généraux et seuils du solde) reste dans `ApplicationSettings`.
Les données restent locales par défaut ; la synchronisation optionnelle CalDAV échange les
transactions avec un calendrier en ligne. SQLite reste la copie de travail hors connexion.
Non porté : sauvegarde/CSV.

## Organisation du code

```text
src/app/
├── core/                     services (budget, réglages, base SQLite, calendrier CalDAV, import bancaire, traductions)
├── shared/                   éléments utilisés par plusieurs pages
│   ├── icons.ts              glyphes Material Design Icons (interface et icônes de catégorie)
│   ├── bottom-sheet.ts       classe de base des feuilles du bas et fonction d'ouverture
│   ├── tab-pager.ts          onglets glissants (Transactions, Statistiques)
│   ├── page-transition.ts    sens de l'animation entre les pages
│   ├── motion.ts             directives `nsAppear` (apparition) et `nsPress` (effet d'appui)
│   ├── list-reveal.ts        apparition des lignes d'une liste à l'entrée dans l'écran (scroll haut/bas)
│   ├── canvas-polyfill.ts    canvas iOS pour les graphiques
│   ├── header/               en-tête (menu, filtres)
│   ├── month-bar/            barre de navigation par mois
│   └── month-picker-modal/   sélecteur de mois (feuille du bas)
└── pages/                    une page par dossier, avec ses propres composants et sous-pages
    ├── budget/               Transactions
    │   ├── delete-transaction.ts  suppression (occurrence ou série d'une récurrence)
    │   ├── editor-modal/     ajout / modification d'une transaction
    │   └── filters-modal/    recherche et filtres
    ├── categories/           Catégories
    ├── stats/                Statistiques
    │   └── category-pie/     camembert par catégorie
    ├── history/              Historique
    │   └── monthly-lines/    graphique en lignes
    └── settings/             Réglages
        └── recurrences/      liste des récurrences (ouverte depuis les réglages)
```

## Design

L'interface suit le *Style Guide* fourni (maquettes « Student Financial Planner ») : thème sombre
par défaut (`#0A0F1E` fond, `#111827` surfaces, `#1A2235` cartes, `#1E2D45` bordures), vert primaire
`#00E5A0`, bleu `#4F8EF7`, jaune `#F7C948`, rouge `#FF6B6B`, texte `#F0F4FF` / `#7A8BA6`, rayons
8/16/32/rond, police **DM Sans** (`src/fonts/DMSans-*.ttf`, chargée par son nom PostScript : les graisses
se choisissent avec `font-family`, pas `font-weight`). Toutes les couleurs sont dans `src/app.scss` ; le
thème clair (réglable) ne redéfinit que les surfaces et les textes. Les camemberts utilisent la même palette.
Il faut reconstruire l'application pour embarquer la police.

## Calendrier en ligne (CalDAV)

Réglages → *Calendrier en ligne* : activer la synchronisation, saisir l'adresse complète du
calendrier (par exemple `https://cloud.example.com/remote.php/dav/calendars/user/budget`), l'identifiant et le mot de passe (ou mot de passe d'application).
*Tester la connexion* vérifie l'accès sans échanger de transactions ; *Enregistrer* et
*Synchroniser maintenant* lancent un échange si la synchronisation est activée.

- Les transactions de **tous les mois** deviennent des événements sur toute la journée,
  partagés entre bureau, mobile et web via le même calendrier. Utiliser un calendrier dédié.
  Les événements non Budget sont ignorés ; le calendrier doit déjà exister.
- La configuration, la dernière synchronisation et la référence de comparaison sont locales
  (ApplicationSettings). Le mot de passe est uniquement dans le stockage sécurisé de l'appareil ;
  si le plugin natif manque, il reste en mémoire pour la session et doit être ressaisi au redémarrage.
- Synchronisation au lancement, environ deux secondes après une modification (y compris les imports
  bancaires), au retour du réseau ou de l'application, et manuellement. Les échanges sont sérialisés ;
  une modification faite pendant un échange déclenche un autre passage sans bloquer la saisie locale.
  L'état est affiché dans les réglages et le menu latéral.
- Les changements et suppressions sont propagés ; en cas de modifications concurrentes, le calendrier
  fait référence. Les refus ETag sont signalés pour réessayer, jamais écrasés aveuglément.
  Les nouvelles catégories reçoivent l'icône par défaut. Les modèles de récurrence et les
  réglages ne sont pas synchronisés : seules les occurrences, avec leur empreinte de récurrence,
  deviennent des événements simples. Une occurrence supprimée n'est pas recréée localement.
- Transport natif `@nativescript/core Http.request` (PROPFIND, REPORT, PUT, DELETE), corps texte,
  en-têtes de réponse normalisés en minuscules ; pas de contrainte CORS sur mobile.
  Utiliser HTTPS, car l'authentification Basic n'est pas chiffrée sur HTTP.

## Import bancaire (Enable Banking)

Réglages → Banque importe les opérations d'un compte (visé : Crédit Mutuel de Bretagne) via l'agrégateur [Enable Banking](https://enablebanking.com), gratuit pour ses propres comptes.

1. Sur enablebanking.com/cp, créer une application en mode production restreint, lier son compte,
   déclarer l'adresse de retour (`budgetmobile://bank` par défaut) et télécharger la clé privée (PEM).
2. Dans l'app : saisir l'identifiant de l'application et coller la clé (stockée dans le stockage sécurisé
   de l'appareil), choisir la banque puis « Connecter la banque ».
3. Après l'autorisation, la banque renvoie vers l'app (schéma `budgetmobile://`, déclaré dans
   `Info.plist` et `AndroidManifest.xml`). Sinon, coller l'adresse affichée dans le champ prévu.

- `budget-lib` (`bank`, `enable-banking`) porte la logique : jeton RS256, client de l'API, pagination,
  conversion en transactions (catégorie devinée, identifiants déterministes), lecture de l'adresse de retour.
  `core/bank/platform.ts` fournit le transport HTTP NativeScript et la signature RSA (jsrsasign) ;
  `core/bank/bank.service.ts` gère la connexion, l'import et l'import automatique au plus toutes les 6 h.
- Les identifiants déterministes évitent les doublons lors des imports ; une transaction supprimée
  n'est pas réimportée.
- L'accès doit être renouvelé environ tous les 90 jours ; la banque limite les imports automatiques (~4/jour).

## Lancer

```sh
npm install             # installe les dépendances et lie budget-lib localement
npm i -g nativescript   # une seule fois
ns run android          # ou ns run ios
```

`budget-lib` est référencée par `../budget-lib` : elle doit être disponible dans le
workspace, à côté de `budget-mobile`.

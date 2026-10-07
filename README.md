# Budget Mobile

Application mobile NativeScript + Angular + TypeScript, portage de `budget-app` (node-gtk).

## Fonctionnalités

- Navigation par mois (passé/futur), totaux revenus / dépenses / solde coloré selon les seuils
- Ajout, modification, suppression de transactions (balayage d'une ligne vers la gauche = supprimer, avec confirmation), recherche et filtres
- Transactions récurrentes (mensuelle, trimestrielle, annuelle, nombre d'occurrences limité), modification d'une occurrence ou de la série
- Catégories avec icônes symboliques, seuils du solde, statistiques par catégorie et historique mensuel
- Menu latéral (`nativescript-ui-sidedrawer`, comme le modèle *drawer-navigation* officiel, ouvert par le
  bouton ☰ ou un balayage depuis le bord gauche, fermé par un balayage vers la gauche) : Transactions, Catégories (création, modification, suppression, choix d'icône),
  Statistiques, Historique et Réglages ; l'état de la synchronisation kDrive y est affiché. L'en-tête
  ne garde que le bouton du menu et, sur l'accueil, celui des filtres.
- Réglages : langue (fr/en), devise, formats de date et de montant, thème clair/sombre/système

La couche `src/app/domain` est reprise telle quelle du projet GTK (logique pure) ; les transactions,
catégories et récurrences sont stockées dans une base SQLite (`budget.db`, `core/database.ts`), les
anciennes données `ApplicationSettings` (`month:AAAA-MM`, catégories, récurrences) étant migrées au
premier lancement. Si la bibliothèque SQLite native n'est pas disponible dans l'application en cours
(client Preview, build antérieur à l'ajout du plugin), les données restent dans `ApplicationSettings`.
La configuration (réglages généraux et seuils du solde) reste dans `ApplicationSettings`.
Non porté : sauvegarde/CSV.

## Design

L'interface suit le *Style Guide* fourni (maquettes « Student Financial Planner ») : thème sombre
par défaut (`#0A0F1E` fond, `#111827` surfaces, `#1A2235` cartes, `#1E2D45` bordures), vert primaire
`#00E5A0`, bleu `#4F8EF7`, jaune `#F7C948`, rouge `#FF6B6B`, texte `#F0F4FF` / `#7A8BA6`, rayons
8/16/32/rond, police **DM Sans** (`src/fonts/DMSans-*.ttf`, chargée par son nom PostScript : les graisses
se choisissent avec `font-family`, pas `font-weight`). Toutes les couleurs sont dans `src/app.scss` ; le
thème clair (réglable) ne redéfinit que les surfaces et les textes. Les camemberts utilisent la même palette.
Il faut reconstruire l'application pour embarquer la police.

## Synchronisation kDrive (WebDAV)

Réglages → *Synchronisation* : adresse WebDAV du kDrive Infomaniak (ex.
`https://<id>.connect.kdrive.infomaniak.com`), identifiant, mot de passe (ou mot de passe
d'application) et dossier distant (`budget-app` par défaut). L'organisation des fichiers est celle de
l'application de bureau `budget-app` : `categories.json`, `thresholds.json`, `recurrences.json` et
`months/AAAA-MM.json`, afin de partager le même dossier.

- Le mot de passe est stocké dans le coffre sécurisé du système (`@nativescript/secure-storage`),
  jamais dans les réglages ; sans ce plugin natif il n'est gardé que pour la session.
- **Mode hors ligne** : la base SQLite reste la copie de travail, on peut toujours modifier. Les
  changements sont mémorisés (indicateur nuage dans le menu latéral : nuage coché à jour, flèches en cours,
  nuage barré + *n* hors ligne avec *n* modifications en attente, nuage alerte erreur) et réconciliés dès que le serveur répond :
  au démarrage, au retour à l'application, au retour du réseau, après chaque modification
  (différée de 2,5 s) et toutes les 60 s tant que le serveur est injoignable.
- **Fusion à trois voies** (`domain/sync-merge.ts`) entre la dernière version synchronisée, la
  version locale et la version distante, par identifiant de transaction : un changement fait d'un
  seul côté est repris, en cas de modification des deux côtés la version locale l'emporte, une
  suppression ne l'emporte jamais sur une modification faite de l'autre côté. Les occurrences d'une
  récurrence générées sur les deux appareils sont dédoublonnées. À la première synchronisation avec un
  serveur déjà rempli, les catégories et seuils du serveur font référence ; les transactions et
  récurrences des deux côtés sont réunies.
- Seuls les fichiers modifiés sont retéléchargés (comparaison des ETag).
- Les icônes de catégorie sont stockées sous leur nom symbolique du bureau (`emoji-food-symbolic`,
  `tabler:car`…, `domain/category-icons.ts`), donc `categories.json` est partagé tel quel. Elles sont
  dessinées avec la police *Material Design Icons* (`src/fonts`, classe CSS `.mdi`, points de code dans
  `domain/icons.ts`) ; les emoji enregistrés par les versions précédentes sont convertis au chargement.
- Comme les plugins SQLite, graphiques et coffre sécurisé sont natifs, il faut reconstruire
  l'application (`ns clean; ns run android|ios`).

## Stockage iCloud Drive (iOS)

Réglages → *Synchronisation* → *Stockage* → **iCloud Drive** (choix proposé uniquement sur iOS).
Le moteur de synchronisation est le même que pour kDrive (fusion à trois voies, mode hors ligne,
même organisation de fichiers) ; seul le support change : `core/icloud.ts` lit et écrit les fichiers
dans `<conteneur iCloud>/Documents/<dossier distant>` et iOS les propage aux autres appareils.
Aucune adresse ni mot de passe : c'est le compte iCloud de l'appareil.

- Les fichiers apparaissent dans l'app *Fichiers* → iCloud Drive → *Budget* (`NSUbiquitousContainers`
  dans `Info.plist`).
- Les fichiers créés par un autre appareil sont d'abord des « espaces réservés » (`.nom.json.icloud`) :
  la synchronisation en déclenche le téléchargement et réessaie si besoin.
- Prérequis : compte Apple Developer payant, capacité **iCloud → iCloud Documents** activée sur
  l'App ID `org.nativescript.budgetmobile` avec le conteneur `iCloud.org.nativescript.budgetmobile`
  (déclaré dans `App_Resources/iOS/app.entitlements`) ; si l'identifiant de l'application change,
  adapter ce fichier et `Info.plist`. Sans iCloud disponible, la synchronisation passe en erreur
  avec un message explicite.
- L'application de bureau (GTK) ne lit pas iCloud : pour partager avec elle, utiliser kDrive.
- Changer de support (kDrive ↔ iCloud) repart d'une première synchronisation.

## Lancer

```sh
npm install
npm i -g nativescript   # une seule fois
ns run android          # ou ns run ios
```

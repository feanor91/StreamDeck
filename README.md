# StreamDeck

Clone logiciel d'un Stream Deck, en trois morceaux :

| Élément | Rôle |
| --- | --- |
| **Application PC** (Windows, Linux, macOS) | Héberge le **serveur** qui exécute les actions, et affiche l'**interface de configuration** des touches. Reste active dans la zone de notification. |
| **Application Android** | La **console** : on appuie sur les touches depuis le téléphone ou la tablette. Détecte le PC automatiquement sur le Wi-Fi. |
| Serveur seul (facultatif) | `npm start` : le même serveur sans fenêtre, configurable depuis un navigateur. |

Chaque appui sur le téléphone envoie l'action au logiciel qui doit la recevoir sur
le PC : raccourci clavier, texte, commande multimédia, lancement d'application…

```
 ┌──────────── PC ─────────────┐             ┌──── Android ────┐
 │ Application PC (Electron)   │   Wi-Fi     │ Application     │
 │  ├─ configuration (fenêtre) │ ◄─────────► │ StreamDeck      │
 │  └─ serveur :3210 ──► OBS,  │  HTTP 3210  │  (le Deck)      │
 │     Chrome, Discord…        │  UDP  3211  │                 │
 └─────────────────────────────┘ (découverte)└─────────────────┘
```

## Installation

Les installateurs sont produits automatiquement par GitHub Actions à chaque
modification (onglet **Actions** du dépôt → dernière exécution de « Build » →
section *Artifacts*), et publiés dans **Releases** pour chaque version étiquetée `v*`.
Pour publier une version : onglet **Actions** → « Build » → *Run workflow*, en
indiquant le numéro de version (ex. `v0.2.2`) ; l'étiquette et la page de
publication sont créées automatiquement.

| Fichier | Pour |
| --- | --- |
| `StreamDeck-Setup-x.y.z.exe` | Windows : installateur de l'application PC |
| `StreamDeck-x.y.z.AppImage` | Linux : application PC |
| `StreamDeck-Android-x.y.z.apk` | Android 7.0 ou plus récent |

### Sur le PC

1. Lancez l'installateur puis **StreamDeck**.
2. Au premier lancement, Windows demande l'autorisation réseau : acceptez pour les
   **réseaux privés**, sinon le téléphone ne pourra pas se connecter.
3. La fenêtre de configuration s'ouvre. La fermer laisse StreamDeck actif dans la zone
   de notification (clic sur l'icône pour la rouvrir, clic droit pour le menu :
   adresse du PC, lancement au démarrage, quitter).

### Sur Android

1. Copiez l'APK sur le téléphone et ouvrez-le (autorisez l'installation
   d'applications de sources inconnues si Android le demande).
2. Ouvrez **StreamDeck** : le PC apparaît dans « Sur ce réseau ». Touchez-le.
   Sinon, saisissez son adresse IP (menu « Connexion Android » de l'icône StreamDeck).
3. L'application se reconnecte automatiquement au dernier PC. Le bouton ▭ en haut à
   droite du Deck (ou la touche Retour) permet de changer de PC.

L'écran reste allumé et s'affiche en plein écran ; les touches vibrent légèrement.
Les touches occupent **tout l'écran**, en portrait comme en paysage : en portrait,
une grille pensée pour le paysage (ex. 3×5) s'affiche en 5×3 (lignes et colonnes
inversées, touches fusionnées comprises) pour garder des touches presque carrées ;
icônes et titres s'agrandissent ou rétrécissent avec les touches.

Sur **Android 7 à 9**, l'affichage du Deck repose sur **Google Chrome** (et sur
**Android System WebView** à partir d'Android 10) : mettez-le à jour depuis le Play
Store. L'application prévient au démarrage si la version est trop ancienne.

**Si l'installation échoue** (« Google Play Store a cessé de fonctionner »,
« Application non installée ») :

- ouvrez l'APK depuis le **gestionnaire de fichiers** plutôt que depuis la
  notification de téléchargement ;
- désinstallez une ancienne version de StreamDeck : les versions antérieures à la
  0.6.1 n'ont pas toutes la même signature et ne s'installent pas l'une sur l'autre ;
- désactivez temporairement l'analyse **Play Protect** (Play Store → menu →
  Play Protect), ou videz le cache du Play Store ;
- en dernier recours, depuis le PC : `adb install -r StreamDeck-Android-x.y.z.apk`.

## Interface de configuration

- **Bibliothèque d'actions** (à gauche) : glissez une action sur une touche, ou
  cliquez dessus pour l'appliquer à la touche sélectionnée.
- **Grille** (au centre) : glissez une touche sur une autre pour les échanger,
  ou sur l'onglet d'une page pour l'y déplacer. Clic droit : tester, copier,
  dupliquer, déplacer, effacer.
- **Inspecteur** (à droite) : type d'action, paramètres, **logiciel cible**,
  titre, icône (emoji ou image) et couleur.
- **Pages** : onglets au-dessus de la grille (double-clic pour renommer, clic
  droit pour les autres options). Une touche « Page » permet de naviguer entre
  elles sur le Deck, comme les dossiers d'un Stream Deck.
- **Profils** : menu en haut. Le profil sélectionné est celui qu'affiche le Deck.
  Export et import de la configuration au format JSON.
- **Dispositions** : Mini (2×3), Standard (3×5), Plus (4×4) et XL (4×8).
- L'enregistrement est automatique. `Ctrl+Z` / `Ctrl+Y` pour annuler/rétablir.

Raccourcis clavier : flèches pour se déplacer, `Suppr` pour effacer,
`Ctrl+C` / `Ctrl+V` pour copier-coller, `Ctrl+D` pour dupliquer, `Échap` pour désélectionner.

### Types d'action

| Action | Description |
| --- | --- |
| Raccourci clavier | Combinaison de touches (enregistrée au clavier ou composée à la main), répétable |
| Saisir du texte | Tape un texte (Unicode, accents, emojis), avec Entrée en option |
| Multimédia | Lecture/pause, piste suivante/précédente, stop, volume, muet |
| Lancer une application | Programme, document ou raccourci, avec arguments |
| Ouvrir un site web | Ouvre une adresse dans le navigateur par défaut |
| Commande système | Exécute une commande shell |
| Page | Change la page du Deck (page précise, suivante ou précédente) |
| Multi-actions | Enchaîne plusieurs actions avec des pauses |
| Commande MSFS | Envoie une commande à Microsoft Flight Simulator (SimConnect) |
| Bouton rotatif | Tourner (glisser le doigt) pour « + » / « − », appuyer pour valider ; peut afficher une valeur du simulateur |
| Curseur | Glisser pour régler une position (gaz, volets…) ou envoyer des crans « + » / « − » |
| Bascule (2 états) | Alterne entre deux états (ex. train rentré / sorti) : titre, icône, couleur et action propres à chaque état |

### Touches à bascule

Une bascule a deux états, chacun avec son titre, son icône, sa couleur et
l'action à envoyer (ou la même action pour les deux, ex. la touche `G` du train
d'atterrissage). À chaque appui, elle envoie l'action de son état puis change
d'état ; deux pastilles indiquent l'état courant.

- L'état est gardé par le PC : le téléphone, la tablette et l'écran de
  configuration affichent toujours le même.
- Si le simulateur se désynchronise (touche pressée au clavier, vol rechargé…),
  un **appui long** sur la touche du Deck change l'état **sans rien envoyer**.
  Le bouton « Changer d'état » de l'inspecteur fait de même.
- Préréglages prêts à l'emploi dans la bibliothèque, catégorie *Simulation* :
  train d'atterrissage, feux d'atterrissage, frein de parc (raccourcis par
  défaut de Microsoft Flight Simulator, modifiables).

### Microsoft Flight Simulator 2024 (et 2020)

StreamDeck pilote MSFS directement par **SimConnect**, l'interface officielle
intégrée au simulateur :

- **aucun fichier de configuration** : quand StreamDeck tourne sur le même PC que
  le simulateur, la liaison s'établit toute seule dès que MSFS est lancé
  (indicateur « MSFS connecté » en haut de l'écran de configuration) ;
- les commandes partent **même si la fenêtre du simulateur n'a pas le focus**, et
  ne dépendent pas de vos affectations clavier ;
- les touches à bascule affichent **l'état réel** de l'avion (train sorti, feux
  allumés, pilote automatique engagé…), même si vous agissez à la souris dans le
  cockpit.

Dans la bibliothèque, catégorie *MSFS 2024 (SimConnect)* : 37 touches prêtes à
l'emploi (train, frein de parc, volets, aérofreins, compensateur, feux, modes du
pilote automatique, batterie, avionique, pitot, ceintures, radios, pause,
pushback…) avec leurs icônes. L'action « Commande MSFS » donne accès à une
cinquantaine de commandes, ou à n'importe quel événement SimConnect par son nom.
L'onglet *Aviation* du choix d'icône propose 36 icônes dédiées.

#### Trois façons d'agir sur le simulateur

L'action « Commande MSFS » propose trois modes :

| Mode | Pour quoi | Exemple |
| --- | --- | --- |
| **Commande** | Événements standard ou personnalisés d'un avion | `GEAR_TOGGLE`, `A32NX.FCU_HDG_PUSH` |
| **Variable** | Écrire une SimVar ou une variable locale `L:` d'un avion | `L:…` : fixer, basculer 0 ↔ 1, ajouter un pas |
| **Input Event** | Commandes de cockpit de MSFS 2024 (avion chargé) | `LIGHTING_LANDING_1` : fixer, basculer, ajouter |

L'état d'une bascule, la valeur affichée par un bouton rotatif et la position d'un
curseur peuvent de même être lus dans une SimVar, une variable `L:` ou un Input
Event. Pour une bascule, l'option « État 2 si la valeur vaut… » permet par
exemple d'allumer une touche seulement quand l'auto-freinage est sur MED.

#### Explorateur MSFS

Cliquez sur l'indicateur **MSFS** en haut de l'écran de configuration :
l'explorateur liste les commandes de cockpit (Input Events) **de l'avion
chargé**, avec une recherche et la lecture de leur valeur actuelle. Actionnez un
interrupteur dans le cockpit puis relisez pour repérer la bonne commande. Il lit
aussi n'importe quelle variable (`L:` ou SimVar) et exporte la liste des
commandes. C'est l'outil pour configurer un avion non documenté (ex. le Rafale
d'AzurPoly).

#### Airbus A320neo FlyByWire

Catégorie *A320 FlyByWire*, construite à partir de la documentation officielle
FlyByWire, sans module supplémentaire :

- boutons **SPD, HDG, ALT, V/S** et **BARO** : tourner = régler, **appui =
  enfoncer (managé)**, **appui long = tirer (sélecté)** ; la touche affiche la
  valeur du FCU, les tirets « --- » et le point du mode managé ;
- **AP1, AP2, A/THR, LOC, APPR, EXPED, FD, LS** avec leur voyant ;
- pas d'altitude 100 / 1000, HDG-V/S / TRK-FPA, SPD / MACH ;
- **auto-freinage LO / MED / MAX** (la touche du mode armé s'allume).

> Certains avions très détaillés ont leurs propres systèmes et ignorent une partie
> des commandes standard : utilisez alors leurs commandes personnalisées, leurs
> variables `L:` ou leurs Input Events (voir l'explorateur), ou à défaut des
> raccourcis clavier (catégorie *Simulation (raccourcis clavier)*).

La liaison utilise la bibliothèque [node-simconnect](https://github.com/EvenAR/node-simconnect)
(licence LGPL-3.0).

### Boutons rotatifs et curseurs

**Bouton rotatif** (catégorie *Avancé*, ou préréglages MSFS HDG, ALT, VS, SPD,
CRS, BARO, molette de compensateur) :

- sur le Deck, glissez le doigt vers la droite ou vers le haut pour « + », vers
  la gauche ou vers le bas pour « − » ; chaque cran envoie l'action correspondante
  (sensibilité fine, normale ou rapide) ;
- **un appui sans glisser déclenche l'action d'appui** : valider une valeur,
  engager un mode du pilote automatique, caler l'altimètre… ;
- sur PC, la molette de la souris tourne le bouton ;
- le bouton peut afficher en direct une valeur de MSFS (cap sélecté « 275° »,
  altitude « 12 000 ft », calage « 1013 hPa »…).

**Curseur** (préréglages MSFS : manette des gaz, volets, aérofreins, mélange,
pas d'hélice) :

- vertical si la touche est plus haute que large : fusionnez-la en 1×3 pour
  obtenir un vrai levier ; horizontal sinon ;
- mode *Position (MSFS)* : la position est envoyée en continu au simulateur
  (ex. `THROTTLE_SET` de 0 à 16383) et le curseur suit le levier si vous le
  bougez dans le cockpit ;
- mode *Pas à pas* : glisser d'un bout à l'autre envoie un nombre réglable de
  « + » ou de « − » (raccourcis clavier, commandes…), pour n'importe quel logiciel ;
- un appui sans glisser déclenche l'action d'appui si elle est définie, sinon le
  curseur saute à l'endroit touché.

### Touches fusionnées

Dans l'inspecteur, section *Apparence › Taille*, une touche peut occuper
plusieurs emplacements : 2×1, 1×2, 2×2, 4×2, 4×4… selon la disposition choisie.
Elle s'étend vers la droite et vers le bas ; les emplacements couverts doivent
être libres.

### Logiciel cible

Pour les raccourcis et le texte, vous pouvez choisir le logiciel destinataire :

- **Fenêtre active** : les touches partent vers la fenêtre au premier plan ;
- **Application** : nom du processus (`obs64`, `chrome`, `Discord`…) ;
- **Titre** : texte contenu dans le titre de la fenêtre.

L'application est mise au premier plan, puis les touches lui sont envoyées. Le
bouton ⟳ liste les fenêtres ouvertes pour vous aider à choisir.

## Envoi des touches selon le système

| Système | Méthode | Prérequis |
| --- | --- | --- |
| Windows | API `SendInput` via un agent PowerShell persistant | Aucun |
| macOS | AppleScript (`System Events`) | Autoriser le terminal dans *Réglages › Confidentialité › Accessibilité* |
| Linux (X11) | `xdotool` (+ `wmctrl` pour lister les fenêtres) | `sudo apt install xdotool wmctrl` |

L'indicateur en haut de l'interface de gestion signale si l'envoi est opérationnel.

## Sécurité

- Par défaut, **seul l'ordinateur hôte** peut modifier la configuration ou
  tester des actions. Les autres appareils du réseau peuvent uniquement appuyer
  sur les touches déjà configurées.
- L'API refuse les requêtes provenant d'autres sites web (protection CSRF et
  DNS rebinding).
- Les actions « Commande système » s'exécutent avec vos droits d'utilisateur.

## Configuration du serveur

Variables d'environnement (serveur seul, et application PC pour `PORT`) :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3210` | Port HTTP (la découverte réseau utilise toujours l'UDP 3211) |
| `HOST` | `0.0.0.0` | Interface d'écoute (`127.0.0.1` pour interdire l'accès réseau) |
| `DECK_DATA_DIR` | `./data` | Dossier de la configuration (`config.json`) |
| `DECK_REMOTE_ADMIN` | — | `1` : autorise la configuration depuis un autre appareil |
| `DECK_DRY_RUN` | — | `1` : mode simulation, les actions sont journalisées sans être envoyées |

L'application PC range sa configuration dans le dossier utilisateur
(`%APPDATA%\StreamDeck\data` sous Windows).

## Développement

Prérequis : [Node.js](https://nodejs.org) 18+ (22 recommandé). Pour Android : JDK 17 et le SDK Android (ou Android Studio).

```bash
npm start              # serveur seul, sans dépendance → http://localhost:3210/
npm install            # dépendances de l'application PC (Electron)
npm run desktop        # application PC en mode développement
npm run dist:win       # installateur Windows dans dist/
npm test               # tests unitaires

cd android && ./gradlew assembleRelease   # APK dans android/app/build/outputs/apk/release/
```

Le projet `android/` s'ouvre aussi directement dans Android Studio.

### Signature de l'APK

Toutes les versions publiées doivent être signées avec **la même clé**, sinon
Android refuse d'installer une mise à jour par-dessus la précédente. La clé n'est
pas dans le dépôt : la CI la lit dans les secrets GitHub (Settings → Secrets and
variables → Actions) :

| Secret | Contenu |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | le fichier `.jks`, encodé en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du fichier |
| `ANDROID_KEY_ALIAS` | alias de la clé |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé |

Création de la clé (une seule fois, `keytool` est fourni avec Java / Android Studio),
puis encodage en base64 sous Windows (PowerShell) :

```powershell
keytool -genkeypair -keystore streamdeck.jks -alias streamdeck -keyalg RSA -keysize 2048 -validity 36500
[Convert]::ToBase64String([IO.File]::ReadAllBytes("streamdeck.jks")) | Set-Clipboard
```

Conservez `streamdeck.jks` et ses mots de passe en lieu sûr : sans eux, les
prochaines versions ne pourront plus mettre à jour l'application installée.
Sans secrets, la CI compile avec une clé de débogage temporaire, et la
publication d'une version est refusée. En local, définissez `SIGNING_STORE_FILE`,
`SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS` et `SIGNING_KEY_PASSWORD`.

## Structure

```
server/
  app.js              Serveur HTTP : API REST, flux temps réel (SSE), fichiers statiques
  index.js            Lancement du serveur seul (npm start)
  discovery.js        Découverte réseau (UDP 3211) pour l'application Android
  msfs.js             Liaison Microsoft Flight Simulator (SimConnect)
  states.js           États des touches à bascule
  store.js            Configuration (validation, écriture atomique)
  actions.js          Exécution des actions
  executors/          Envoi des touches : windows.js (+ agent .ps1), macos.js, linux.js
shared/keys.js        Définition des touches, commune au serveur et à l'interface
shared/layout.js      Placement des touches (fusion, orientation), bascules
shared/controls.js    Boutons rotatifs et curseurs : conversions, affichage des valeurs
shared/msfs.js        Catalogue MSFS : commandes, variables, préréglages
public/icons/avia/    Icônes aviation (SVG)
public/               Interface de configuration (index.html) et Deck (deck.html)
desktop/              Application PC (Electron) : fenêtre, zone de notification
android/              Application Android (Kotlin) : connexion, découverte, Deck plein écran
scripts/smoke.mjs     Test de fumée utilisé par l'intégration continue
scripts/fake-msfs-server.mjs  Serveur relié à un faux simulateur (développement)
test/fake-simconnect.js       Faux SimConnect (tests et développement)
.github/workflows/    Compilation et publication (APK, installateurs)
test/                 Tests unitaires
## Tests

```bash
npm test
```

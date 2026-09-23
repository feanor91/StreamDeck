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

| Fichier | Pour |
| --- | --- |
| `StreamDeck-Setup-x.y.z.exe` | Windows : installateur de l'application PC |
| `StreamDeck-x.y.z.AppImage` | Linux : application PC |
| `StreamDeck-Android-x.y.z.apk` | Android 8.0 ou plus récent |

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

## Structure

```
server/
  app.js              Serveur HTTP : API REST, flux temps réel (SSE), fichiers statiques
  index.js            Lancement du serveur seul (npm start)
  discovery.js        Découverte réseau (UDP 3211) pour l'application Android
  store.js            Configuration (validation, écriture atomique)
  actions.js          Exécution des actions
  executors/          Envoi des touches : windows.js (+ agent .ps1), macos.js, linux.js
shared/keys.js        Définition des touches, commune au serveur et à l'interface
public/               Interface de configuration (index.html) et Deck (deck.html)
desktop/              Application PC (Electron) : fenêtre, zone de notification
android/              Application Android (Kotlin) : connexion, découverte, Deck plein écran
scripts/smoke.mjs     Test de fumée utilisé par l'intégration continue
.github/workflows/    Compilation et publication (APK, installateurs)
test/                 Tests unitaires
## Tests

```bash
npm test
```

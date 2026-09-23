# StreamDeck

Clone logiciel d'un Stream Deck. Vous configurez des touches dans une interface
de gestion, puis vous les déclenchez depuis une surface de contrôle (tablette,
téléphone ou second écran). Chaque appui envoie l'action au logiciel qui doit la
recevoir : raccourci clavier, texte, commande multimédia, lancement d'application…

Aucune dépendance à installer : il suffit de [Node.js](https://nodejs.org) 18 ou plus récent.

## Démarrage

```bash
npm start
```

Sous Windows, vous pouvez aussi double-cliquer sur `StreamDeck.cmd`.

| Adresse | Rôle |
| --- | --- |
| `http://localhost:3210/` | **Interface de gestion** : affectation des touches |
| `http://localhost:3210/deck` | **Surface Deck** : la « console » sur laquelle on appuie |
| `http://<ip-du-pc>:3210/deck` | Le Deck depuis une tablette ou un téléphone du même réseau |

Au démarrage, la console affiche les adresses réseau utilisables.

## Interface de gestion

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

## Configuration

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3210` | Port HTTP |
| `HOST` | `0.0.0.0` | Interface d'écoute (`127.0.0.1` pour interdire l'accès réseau) |
| `DECK_DATA_DIR` | `./data` | Dossier de la configuration (`config.json`) |
| `DECK_REMOTE_ADMIN` | — | `1` : autorise la gestion depuis un autre appareil |
| `DECK_DRY_RUN` | — | `1` : mode simulation, les actions sont journalisées sans être envoyées |

## Structure

```
server/
  index.js            Serveur HTTP, API REST et flux temps réel (SSE)
  store.js            Configuration (validation, écriture atomique)
  actions.js          Exécution des actions
  executors/          Envoi des touches : windows.js (+ agent .ps1), macos.js, linux.js
shared/keys.js        Définition des touches, commune au serveur et à l'interface
public/               Interface de gestion (index.html) et surface Deck (deck.html)
test/                 Tests unitaires (npm test)
```

## Tests

```bash
npm test
```

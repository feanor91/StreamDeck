// Application PC : héberge le serveur StreamDeck et affiche l'interface de configuration.
// Fermer la fenêtre la réduit dans la zone de notification : le serveur reste actif
// pour que l'application Android puisse continuer à envoyer des touches.
import { app, BrowserWindow, Tray, Menu, shell, dialog, clipboard, nativeImage, Notification } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import updaterPkg from 'electron-updater';
import { startDeckServer, lanAddresses } from '../server/app.js';
import { createReleaseChecker } from '../server/update.js';
import { RELEASES_URL } from '../shared/version.js';

const { autoUpdater } = updaterPkg;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(HERE, 'assets', 'icon.png');
const TRAY_ICON = path.join(HERE, 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png');
const PORT = Number(process.env.PORT) || 3210;

let deck = null; // serveur intégré (null si on s'est rattaché à un serveur déjà lancé)
let mainWindow = null;
let deckWindow = null;
let tray = null;
let quitting = false;
let trayHintShown = false;
let updater = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMain);
  app.whenReady().then(boot);
}

// La liaison MSFS lit le registre Windows via le module « regedit », dont les scripts
// VBS doivent être lus hors de l'archive asar une fois l'application installée.
function prepareRegistryHelper() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    const regedit = createRequire(import.meta.url)('regedit');
    regedit.setExternalVBSLocation(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'regedit', 'vbs'));
  } catch {}
}

async function boot() {
  app.setAppUserModelId('com.streamdeck.clone');
  prepareRegistryHelper();
  updater = createUpdater();
  updater.onChange(onUpdateChange);
  try {
    deck = await startDeckServer({ port: PORT, dataDir: path.join(app.getPath('userData'), 'data'), updater });
  } catch (e) {
    if (e.code !== 'EADDRINUSE' || !(await isDeckServer())) {
      dialog.showErrorBox(
        'StreamDeck',
        e.code === 'EADDRINUSE'
          ? `Le port ${PORT} est déjà utilisé par une autre application.`
          : `Impossible de démarrer le serveur :\n${e.message}`,
      );
      app.exit(1);
      return;
    }
    // Un serveur StreamDeck autonome tourne déjà : on s'y rattache.
  }
  createTray();
  if (!process.argv.includes('--hidden')) showMain();
}

async function isDeckServer() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/status`);
    return (await res.json()).app === 'streamdeck';
  } catch {
    return false;
  }
}

function openExternalOrDeck(url) {
  if (new URL(url).pathname === '/deck') showDeckPreview();
  else if (/^https?:/.test(url)) shell.openExternal(url);
}

function showMain() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 980,
    minHeight: 620,
    title: 'StreamDeck',
    icon: ICON,
    backgroundColor: '#0a0b10',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalOrDeck(url);
    return { action: 'deny' };
  });
  // Le serveur peut mettre un instant à répondre au tout premier lancement.
  mainWindow.webContents.on('did-fail-load', (_e, code) => {
    if (code !== -3) setTimeout(() => mainWindow?.loadURL(`http://localhost:${PORT}/`), 1000);
  });
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!trayHintShown && Notification.isSupported()) {
      trayHintShown = true;
      new Notification({
        title: 'StreamDeck reste actif',
        body: 'Le serveur continue de fonctionner en arrière-plan. Cliquez sur l’icône de la zone de notification pour rouvrir la configuration.',
        icon: ICON,
      }).show();
    }
  });
  mainWindow.on('closed', () => (mainWindow = null));
  mainWindow.loadURL(`http://localhost:${PORT}/`);
}

// Aperçu du Deck sur le PC (utile pour tester sans téléphone).
function showDeckPreview() {
  if (deckWindow) return deckWindow.focus();
  deckWindow = new BrowserWindow({
    width: 900,
    height: 620,
    title: 'StreamDeck — Deck',
    icon: ICON,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  deckWindow.setMenuBarVisibility(false);
  deckWindow.on('closed', () => (deckWindow = null));
  deckWindow.loadURL(`http://localhost:${PORT}/deck`);
}

// --- Mises à jour ----------------------------------------------------------------------------
// Au lancement (puis toutes les 6 heures), StreamDeck lit les versions publiées sur GitHub.
// Si une version plus récente existe, une fenêtre propose de l'installer : le téléchargement
// se fait alors en arrière-plan, puis StreamDeck redémarre sur la nouvelle version.
// Version installée (Windows, AppImage) : electron-updater télécharge et installe.
// En développement, ou si le format ne se met pas à jour tout seul : lien de téléchargement.
function createUpdater() {
  const canSelfUpdate = app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE));
  if (!canSelfUpdate) {
    const checker = createReleaseChecker({ current: app.getVersion(), auto: false });
    setTimeout(checker.check, 3_000);
    setInterval(checker.check, 6 * 3600_000).unref();
    return checker;
  }

  const listeners = new Set();
  let state = { current: app.getVersion(), state: 'idle', latest: null, url: RELEASES_URL, notes: '', error: null, canInstall: false, progress: null };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };
  const releaseUrl = (v) => `${RELEASES_URL}/tag/v${v}`;

  autoUpdater.logger = null;
  autoUpdater.autoDownload = false; // on demande d'abord l'accord de l'utilisateur
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => set({ state: 'current', canInstall: false }));
  autoUpdater.on('update-available', (info) =>
    set({ state: 'available', latest: info.version, url: releaseUrl(info.version), canInstall: true, progress: null }),
  );
  autoUpdater.on('download-progress', (p) => {
    set({ state: 'downloading', progress: Math.round(p.percent) });
    mainWindow?.setProgressBar(p.percent / 100);
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.setProgressBar(-1);
    set({ state: 'ready', latest: info.version, url: releaseUrl(info.version), canInstall: true, progress: 100 });
    // L'utilisateur a déjà accepté la mise à jour : on redémarre dessus.
    quitAndInstall();
  });
  autoUpdater.on('error', (e) => {
    mainWindow?.setProgressBar(-1);
    if (state.state === 'ready') return; // une erreur tardive ne doit pas masquer une mise à jour prête
    const failedDownload = state.state === 'downloading';
    set({ state: 'error', canInstall: false, error: `Mise à jour impossible : ${String(e?.message ?? e).split('\n')[0]}` });
    if (failedDownload) dialog.showMessageBox({ type: 'warning', title: 'StreamDeck', message: state.error, detail: `Vous pouvez télécharger la mise à jour depuis ${RELEASES_URL}.` });
  });

  const quitAndInstall = () => {
    quitting = true;
    // Laisse le temps à une éventuelle réponse HTTP de partir avant de quitter.
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 300);
  };

  const check = async () => {
    if (['downloading', 'ready'].includes(state.state)) return state;
    await autoUpdater.checkForUpdates().catch(() => {}); // l'erreur arrive aussi par l'événement « error »
    return state;
  };
  setTimeout(check, 3_000);
  setInterval(check, 6 * 3600_000).unref();

  return {
    status: () => state,
    check,
    install() {
      if (state.state === 'ready') return quitAndInstall();
      if (state.state === 'downloading') return;
      if (state.state !== 'available') throw Object.assign(new Error('Aucune mise à jour à installer.'), { status: 400 });
      set({ state: 'downloading', progress: 0 });
      autoUpdater.downloadUpdate().catch(() => {}); // l'erreur arrive par l'événement « error »
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

let lastUpdateState = null;
let promptedVersion = null; // version déjà proposée pendant cette session
let promptOpen = false;

function onUpdateChange(u) {
  if (u.state === lastUpdateState && u.state !== 'downloading') return;
  lastUpdateState = u.state;
  if (tray) refreshTrayMenu();
  if (u.state === 'available' && promptedVersion !== u.latest) promptUpdate(u);
}

// Fenêtre « Nouvelle version disponible », affichée d'elle-même dès qu'une mise à jour est trouvée.
async function promptUpdate(u) {
  if (promptOpen) return;
  promptOpen = true;
  promptedVersion = u.latest;
  try {
    const parent = mainWindow?.isVisible() ? mainWindow : undefined;
    const options = {
      type: 'info',
      title: 'Mise à jour de StreamDeck',
      message: `StreamDeck ${u.latest} est disponible.`,
      detail: u.canInstall
        ? `Version installée : ${u.current}.\n\nLa nouvelle version se télécharge en arrière-plan, puis StreamDeck redémarre automatiquement. Vos touches et réglages sont conservés.`
        : `Version installée : ${u.current}.\n\nOuvrir la page de téléchargement ?`,
      buttons: [u.canInstall ? 'Mettre à jour maintenant' : 'Télécharger', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    if (response !== 0) return;
    if (u.canInstall) updater.install();
    else shell.openExternal(u.url);
  } finally {
    promptOpen = false;
  }
}

async function checkUpdatesNow() {
  promptedVersion = null; // recherche demandée : on repropose la version même si elle a été refusée
  const u = await updater.check();
  if (u.state === 'current') dialog.showMessageBox({ type: 'info', title: 'StreamDeck', message: `StreamDeck est à jour (version ${u.current}).` });
  else if (u.state === 'error') dialog.showMessageBox({ type: 'warning', title: 'StreamDeck', message: u.error });
  else if (u.state === 'available' && promptedVersion !== u.latest) promptUpdate(u);
}

function updateMenuItem() {
  const u = updater?.status();
  if (!u) return [];
  switch (u.state) {
    case 'ready':
      return [{ label: `Redémarrer sur la version ${u.latest}`, click: () => updater.install() }];
    case 'downloading':
      return [{ label: `Téléchargement de la version ${u.latest}… ${u.progress ?? 0} %`, enabled: false }];
    case 'available':
      return [{ label: `Installer la version ${u.latest}`, click: () => (u.canInstall ? updater.install() : shell.openExternal(u.url)) }];
    case 'checking':
      return [{ label: 'Recherche de mise à jour…', enabled: false }];
    default:
      return [{ label: 'Rechercher une mise à jour', click: checkUpdatesNow }];
  }
}

function createTray() {
  const image = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }) : image);
  tray.setToolTip(`StreamDeck ${app.getVersion()}`);
  tray.on('click', showMain);
  tray.on('double-click', showMain);
  refreshTrayMenu();
  // Les adresses IP peuvent changer (changement de Wi-Fi…).
  tray.on('right-click', refreshTrayMenu);
  setInterval(refreshTrayMenu, 60_000).unref();
}

function refreshTrayMenu() {
  const addrs = lanAddresses();
  const login = app.getLoginItemSettings();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `StreamDeck ${app.getVersion()}`, enabled: false },
      ...updateMenuItem(),
      { type: 'separator' },
      { label: 'Ouvrir la configuration', click: showMain },
      { label: 'Ouvrir le Deck sur ce PC', click: showDeckPreview },
      { type: 'separator' },
      {
        label: 'Connexion Android',
        submenu: addrs.length
          ? [
              { label: 'Cliquez pour copier l’adresse :', enabled: false },
              ...addrs.map((a) => ({ label: `${a}:${PORT}`, click: () => clipboard.writeText(`${a}:${PORT}`) })),
            ]
          : [{ label: 'Aucun réseau détecté', enabled: false }],
      },
      {
        label: 'Lancer au démarrage de l’ordinateur',
        type: 'checkbox',
        checked: login.openAtLogin,
        visible: process.platform !== 'linux',
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }),
      },
      { type: 'separator' },
      { label: deck ? 'Quitter StreamDeck' : 'Quitter (serveur externe conservé)', click: quit },
    ]),
  );
}

async function quit() {
  quitting = true;
  await deck?.close().catch(() => {});
  app.quit();
}

app.on('before-quit', () => (quitting = true));
// On reste actif dans la zone de notification même sans fenêtre ouverte.
app.on('window-all-closed', () => {});
app.on('activate', showMain);

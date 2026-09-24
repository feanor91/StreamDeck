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
// Version installée (Windows, AppImage) : electron-updater lit les versions publiées sur GitHub,
// télécharge la nouvelle en arrière-plan puis l'installe au redémarrage (ou à la fermeture).
// En développement, ou si le format ne se met pas à jour tout seul : simple signalement.
function createUpdater() {
  const canSelfUpdate = app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE));
  if (!canSelfUpdate) return createReleaseChecker({ current: app.getVersion() });

  const listeners = new Set();
  let state = { current: app.getVersion(), state: 'idle', latest: null, url: RELEASES_URL, notes: '', error: null, canInstall: false, progress: null };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };
  const releaseUrl = (v) => `${RELEASES_URL}/tag/v${v}`;

  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => set({ state: 'current' }));
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', latest: info.version, url: releaseUrl(info.version), progress: 0 }));
  autoUpdater.on('download-progress', (p) => set({ progress: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', latest: info.version, url: releaseUrl(info.version), canInstall: true, progress: 100 }));
  autoUpdater.on('error', (e) => {
    // Une erreur pendant le téléchargement ne doit pas masquer une mise à jour déjà prête.
    if (state.state !== 'ready') set({ state: 'error', error: `Mise à jour impossible : ${String(e?.message ?? e).split('\n')[0]}` });
  });

  const check = async () => {
    if (state.state === 'ready' || state.state === 'downloading') return state;
    await autoUpdater.checkForUpdates().catch(() => {}); // l'erreur arrive aussi par l'événement « error »
    return state;
  };
  setTimeout(check, 10_000);
  setInterval(check, 6 * 3600_000).unref();

  return {
    status: () => state,
    check,
    install() {
      if (state.state !== 'ready') throw Object.assign(new Error('Aucune mise à jour prête à installer.'), { status: 400 });
      quitting = true;
      // Laisse le temps à la réponse HTTP de partir avant de quitter.
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 300);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

let lastUpdateState = null;
function onUpdateChange(u) {
  if (u.state === lastUpdateState && u.state !== 'downloading') return;
  const was = lastUpdateState;
  lastUpdateState = u.state;
  if (tray) refreshTrayMenu();
  if (u.state === 'ready' && was !== 'ready' && Notification.isSupported()) {
    const n = new Notification({
      title: `StreamDeck ${u.latest} est prête`,
      body: 'La mise à jour sera installée à la fermeture de StreamDeck. Cliquez pour redémarrer maintenant.',
      icon: ICON,
    });
    n.on('click', () => updater.install());
    n.show();
  }
}

async function checkUpdatesNow() {
  const u = await updater.check();
  if (u.state === 'current') dialog.showMessageBox({ type: 'info', title: 'StreamDeck', message: `StreamDeck est à jour (version ${u.current}).` });
  else if (u.state === 'error') dialog.showMessageBox({ type: 'warning', title: 'StreamDeck', message: u.error });
  else if (u.state === 'available') {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'StreamDeck',
      message: `La version ${u.latest} est disponible (installée : ${u.current}).`,
      buttons: ['Télécharger', 'Plus tard'],
    });
    if (response === 0) shell.openExternal(u.url);
  }
}

function updateMenuItem() {
  const u = updater?.status();
  if (!u) return [];
  switch (u.state) {
    case 'ready':
      return [{ label: `Redémarrer et installer la version ${u.latest}`, click: () => updater.install() }];
    case 'downloading':
      return [{ label: `Téléchargement de la version ${u.latest}… ${u.progress ?? 0} %`, enabled: false }];
    case 'available':
      return [{ label: `Télécharger la version ${u.latest}`, click: () => shell.openExternal(u.url) }];
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

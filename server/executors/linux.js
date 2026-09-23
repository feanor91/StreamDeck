import { spawn } from 'node:child_process';
import { run, which } from './util.js';

// Keysyms X11 utilisés par xdotool.
const KEYSYM = {
  Enter: 'Return', Escape: 'Escape', Tab: 'Tab', Space: 'space', Backspace: 'BackSpace',
  Delete: 'Delete', Insert: 'Insert', ContextMenu: 'Menu',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'Prior', PageDown: 'Next',
  PrintScreen: 'Print', Pause: 'Pause', CapsLock: 'Caps_Lock', ScrollLock: 'Scroll_Lock', NumLock: 'Num_Lock',
  NumpadAdd: 'KP_Add', NumpadSubtract: 'KP_Subtract', NumpadMultiply: 'KP_Multiply',
  NumpadDivide: 'KP_Divide', NumpadDecimal: 'KP_Decimal', NumpadEnter: 'KP_Enter',
  Minus: 'minus', Equal: 'equal', BracketLeft: 'bracketleft', BracketRight: 'bracketright',
  Backslash: 'backslash', Semicolon: 'semicolon', Quote: 'apostrophe', Backquote: 'grave',
  Comma: 'comma', Period: 'period', Slash: 'slash', IntlBackslash: 'less',
};
for (let i = 0; i < 26; i++) {
  const c = String.fromCharCode(97 + i);
  KEYSYM[c.toUpperCase()] = c;
}
for (let i = 0; i < 10; i++) {
  KEYSYM[String(i)] = String(i);
  KEYSYM[`Numpad${i}`] = `KP_${i}`;
}
for (let i = 1; i <= 24; i++) KEYSYM[`F${i}`] = `F${i}`;

const MOD = { ctrl: 'ctrl', shift: 'shift', alt: 'alt', meta: 'super' };

const MEDIA = {
  'play-pause': 'XF86AudioPlay', next: 'XF86AudioNext', prev: 'XF86AudioPrev', stop: 'XF86AudioStop',
  'vol-up': 'XF86AudioRaiseVolume', 'vol-down': 'XF86AudioLowerVolume', mute: 'XF86AudioMute',
};

export function hotkeyToXdotool(hotkey) {
  const key = KEYSYM[hotkey.key];
  if (!key) throw new Error(`Touche non prise en charge : ${hotkey.key}`);
  const mods = ['ctrl', 'shift', 'alt', 'meta'].filter((m) => hotkey.modifiers?.includes(m)).map((m) => MOD[m]);
  return [...mods, key].join('+');
}

function detached(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...opts });
    child.once('error', (e) => reject(new Error(`Lancement impossible : ${e.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export function splitArgs(str) {
  if (!str) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(str))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function createLinuxExecutor() {
  const xdo = (...args) => run('xdotool', args);
  return {
    name: 'linux',
    label: 'Linux / X11 (xdotool)',
    async check() {
      if (!(await which('xdotool'))) {
        return { ok: false, reason: 'xdotool est introuvable. Installez-le (ex. : sudo apt install xdotool).' };
      }
      if (process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) {
        return { ok: false, reason: 'Session Wayland sans XWayland : xdotool ne peut pas simuler le clavier.' };
      }
      return { ok: true };
    },
    async focus({ by, value }) {
      const flag = by === 'title' ? '--name' : '--class';
      await xdo('search', '--onlyvisible', flag, value, 'windowactivate', '--sync').catch(() => {
        throw new Error(`Application introuvable : ${value}`);
      });
    },
    hotkey: (hotkey) => xdo('key', '--clearmodifiers', hotkeyToXdotool(hotkey)),
    text: (text) => xdo('type', '--clearmodifiers', '--delay', '4', '--', text),
    media: (id) => {
      if (!MEDIA[id]) throw new Error(`Action multimédia inconnue : ${id}`);
      return xdo('key', MEDIA[id]);
    },
    launch: ({ path, args, cwd }) => detached(path, splitArgs(args), { cwd: cwd || undefined }),
    openUrl: (url) => detached('xdg-open', [url]),
    async listWindows() {
      if (!(await which('wmctrl'))) return [];
      const out = await run('wmctrl', ['-lx']);
      return out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/\s+/);
          const cls = parts[2] ?? '';
          return { process: cls.split('.').pop(), title: parts.slice(4).join(' ') };
        });
    },
  };
}

import { spawn } from 'node:child_process';
import { run } from './util.js';
import { splitArgs } from './linux.js';

// Codes de touches macOS (kVK_*) pour les touches sans caractère imprimable.
const KEY_CODE = {
  Enter: 36, Tab: 48, Space: 49, Backspace: 51, Escape: 53, Delete: 117,
  Home: 115, End: 119, PageUp: 116, PageDown: 121,
  ArrowLeft: 123, ArrowRight: 124, ArrowDown: 125, ArrowUp: 126,
  F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97, F7: 98, F8: 100, F9: 101, F10: 109,
  F11: 103, F12: 111, F13: 105, F14: 107, F15: 113, F16: 106, F17: 64, F18: 79, F19: 80, F20: 90,
  Numpad0: 82, Numpad1: 83, Numpad2: 84, Numpad3: 85, Numpad4: 86, Numpad5: 87, Numpad6: 88,
  Numpad7: 89, Numpad8: 91, Numpad9: 92, NumpadDecimal: 65, NumpadMultiply: 67, NumpadAdd: 69,
  NumpadDivide: 75, NumpadSubtract: 78, NumpadEnter: 76,
};

const CHAR = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};
for (let i = 0; i < 26; i++) CHAR[String.fromCharCode(65 + i)] = String.fromCharCode(97 + i);
for (let i = 0; i < 10; i++) CHAR[String(i)] = String(i);

const MOD = { ctrl: 'control down', shift: 'shift down', alt: 'option down', meta: 'command down' };

export const asString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function hotkeyToAppleScript(hotkey) {
  const mods = ['ctrl', 'shift', 'alt', 'meta'].filter((m) => hotkey.modifiers?.includes(m)).map((m) => MOD[m]);
  const using = mods.length ? ` using {${mods.join(', ')}}` : '';
  if (KEY_CODE[hotkey.key] !== undefined) {
    return `tell application "System Events" to key code ${KEY_CODE[hotkey.key]}${using}`;
  }
  if (CHAR[hotkey.key] !== undefined) {
    return `tell application "System Events" to keystroke ${asString(CHAR[hotkey.key])}${using}`;
  }
  throw new Error(`Touche non prise en charge sur macOS : ${hotkey.key}`);
}

const osa = (script) => run('osascript', ['-e', script]);

export function createMacExecutor() {
  return {
    name: 'macos',
    label: 'macOS (AppleScript)',
    async check() {
      try {
        await osa('tell application "System Events" to return name of first process');
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          reason: `AppleScript refusé : autorisez le terminal dans Réglages > Confidentialité > Accessibilité. (${e.message})`,
        };
      }
    },
    async focus({ by, value }) {
      if (by === 'title') {
        await osa(
          `tell application "System Events" to set frontmost of (first process whose name of windows contains ${asString(value)}) to true`,
        );
      } else {
        await osa(`tell application ${asString(value)} to activate`);
      }
    },
    hotkey: (hotkey) => osa(hotkeyToAppleScript(hotkey)),
    text: (text) => osa(`tell application "System Events" to keystroke ${asString(text)}`),
    async media(id) {
      const vol = {
        'vol-up': 'set volume output volume ((output volume of (get volume settings)) + 6)',
        'vol-down': 'set volume output volume ((output volume of (get volume settings)) - 6)',
        mute: 'set volume output muted (not (output muted of (get volume settings)))',
      };
      if (vol[id]) return osa(vol[id]);
      const music = { 'play-pause': 'playpause', next: 'next track', prev: 'previous track', stop: 'stop' };
      if (music[id]) return osa(`tell application "Music" to ${music[id]}`);
      throw new Error(`Action multimédia inconnue : ${id}`);
    },
    launch: ({ path, args }) => {
      const a = splitArgs(args);
      const cmdArgs = /\.app\/?$/.test(path) || !path.includes('/') ? ['-a', path] : [path];
      if (a.length) cmdArgs.push('--args', ...a);
      return new Promise((resolve, reject) => {
        const child = spawn('open', cmdArgs, { detached: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      });
    },
    openUrl: (url) => run('open', [url]),
    async listWindows() {
      const out = await osa(
        'tell application "System Events" to get name of every process whose background only is false',
      );
      return out
        .trim()
        .split(', ')
        .filter(Boolean)
        .map((name) => ({ process: name, title: name }));
    },
  };
}

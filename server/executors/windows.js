import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Dans l'application PC empaquetée, le script est extrait hors de l'archive asar (voir asarUnpack).
const AGENT = path
  .join(path.dirname(fileURLToPath(import.meta.url)), 'windows-agent.ps1')
  .replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

// Codes de touches virtuelles Windows : [vk, touche étendue]
const VK = {
  Enter: [0x0d, false], Escape: [0x1b, false], Tab: [0x09, false], Space: [0x20, false],
  Backspace: [0x08, false], Delete: [0x2e, true], Insert: [0x2d, true], ContextMenu: [0x5d, true],
  ArrowUp: [0x26, true], ArrowDown: [0x28, true], ArrowLeft: [0x25, true], ArrowRight: [0x27, true],
  Home: [0x24, true], End: [0x23, true], PageUp: [0x21, true], PageDown: [0x22, true],
  PrintScreen: [0x2c, true], Pause: [0x13, false], CapsLock: [0x14, false],
  ScrollLock: [0x91, false], NumLock: [0x90, true],
  NumpadAdd: [0x6b, false], NumpadSubtract: [0x6d, false], NumpadMultiply: [0x6a, false],
  NumpadDivide: [0x6f, true], NumpadDecimal: [0x6e, false], NumpadEnter: [0x0d, true],
  Semicolon: [0xba, false], Equal: [0xbb, false], Comma: [0xbc, false], Minus: [0xbd, false],
  Period: [0xbe, false], Slash: [0xbf, false], Backquote: [0xc0, false],
  BracketLeft: [0xdb, false], Backslash: [0xdc, false], BracketRight: [0xdd, false],
  Quote: [0xde, false], IntlBackslash: [0xe2, false],
};
for (let i = 0; i < 26; i++) VK[String.fromCharCode(65 + i)] = [65 + i, false];
for (let i = 0; i < 10; i++) {
  VK[String(i)] = [0x30 + i, false];
  VK[`Numpad${i}`] = [0x60 + i, false];
}
for (let i = 1; i <= 24; i++) VK[`F${i}`] = [0x6f + i, false];

const MOD_VK = { ctrl: [0x11, false], shift: [0x10, false], alt: [0x12, false], meta: [0x5b, true] };

const MEDIA_VK = {
  'play-pause': [0xb3, true], next: [0xb0, true], prev: [0xb1, true], stop: [0xb2, true],
  'vol-up': [0xaf, true], 'vol-down': [0xae, true], mute: [0xad, true],
};

export function hotkeyToSequence(hotkey) {
  const key = VK[hotkey.key];
  if (!key) throw new Error(`Touche non prise en charge : ${hotkey.key}`);
  const mods = ['ctrl', 'shift', 'alt', 'meta'].filter((m) => hotkey.modifiers?.includes(m));
  return [...mods.map((m) => MOD_VK[m]), key];
}

class Agent {
  constructor() {
    this.proc = null;
    this.pending = new Map();
    this.seq = 0;
  }

  start() {
    if (this.proc) return;
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', AGENT],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.proc = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line.replace(/^\uFEFF/, ''));
      } catch {
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      msg.ok ? p.resolve(msg) : p.reject(new Error(msg.error || 'Erreur inconnue'));
    });
    proc.stderr.on('data', (d) => console.error('[agent windows]', d.toString().trim()));
    const fail = (err) => {
      if (this.proc !== proc) return;
      this.proc = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    };
    proc.on('error', (e) => fail(new Error(`Impossible de lancer PowerShell : ${e.message}`)));
    proc.on('exit', (code) => fail(new Error(`L'agent PowerShell s'est arrêté (code ${code})`)));
  }

  call(op, params = {}, timeout = 10000) {
    this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Délai dépassé pour l'opération « ${op} »`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ id, op, ...params }) + '\n');
    });
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
  }
}

export function createWindowsExecutor() {
  const agent = new Agent();
  return {
    name: 'windows',
    label: 'Windows (SendInput)',
    async check() {
      try {
        // Le premier démarrage compile le code C# : on laisse un délai généreux.
        await agent.call('ping', {}, 30000);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },
    focus: (target) => agent.call('focus', { by: target.by, value: target.value }),
    hotkey: (hotkey) => agent.call('chord', { seq: hotkeyToSequence(hotkey) }),
    text: (text) => agent.call('text', { text }, 60000),
    media: (id) => {
      const vk = MEDIA_VK[id];
      if (!vk) throw new Error(`Action multimédia inconnue : ${id}`);
      return agent.call('chord', { seq: [vk] });
    },
    launch: ({ path: p, args, cwd }) => agent.call('launch', { path: p, args, cwd }),
    openUrl: (url) => agent.call('launch', { path: url }),
    async listWindows() {
      const res = await agent.call('windows');
      return res.windows ?? [];
    },
    dispose: () => agent.stop(),
  };
}

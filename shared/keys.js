// Définitions de touches partagées entre le serveur et l'interface.
// Une touche est identifiée par un nom canonique indépendant de l'OS
// ("A", "F5", "ArrowUp", "Numpad1"…). Les exécuteurs traduisent ces noms
// vers leur propre représentation (codes VK Windows, keysyms X11, key codes macOS).

export const MODIFIERS = [
  { id: 'ctrl', label: 'Ctrl', mac: '⌃' },
  { id: 'shift', label: 'Maj', mac: '⇧' },
  { id: 'alt', label: 'Alt', mac: '⌥' },
  { id: 'meta', label: 'Win / Cmd', mac: '⌘' },
];

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const digits = '0123456789'.split('');
const fkeys = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);

export const KEY_GROUPS = [
  { label: 'Lettres', keys: letters.map((k) => ({ id: k, label: k })) },
  { label: 'Chiffres', keys: digits.map((k) => ({ id: k, label: k })) },
  { label: 'Fonctions', keys: fkeys.map((k) => ({ id: k, label: k })) },
  {
    label: 'Édition',
    keys: [
      { id: 'Enter', label: 'Entrée' },
      { id: 'Escape', label: 'Échap' },
      { id: 'Tab', label: 'Tab' },
      { id: 'Space', label: 'Espace' },
      { id: 'Backspace', label: 'Retour arrière' },
      { id: 'Delete', label: 'Suppr' },
      { id: 'Insert', label: 'Inser' },
      { id: 'ContextMenu', label: 'Menu contextuel' },
    ],
  },
  {
    label: 'Navigation',
    keys: [
      { id: 'ArrowUp', label: '↑ Haut' },
      { id: 'ArrowDown', label: '↓ Bas' },
      { id: 'ArrowLeft', label: '← Gauche' },
      { id: 'ArrowRight', label: '→ Droite' },
      { id: 'Home', label: 'Début' },
      { id: 'End', label: 'Fin' },
      { id: 'PageUp', label: 'Page préc.' },
      { id: 'PageDown', label: 'Page suiv.' },
    ],
  },
  {
    label: 'Système',
    keys: [
      { id: 'PrintScreen', label: 'Impr. écran' },
      { id: 'Pause', label: 'Pause' },
      { id: 'CapsLock', label: 'Verr. Maj' },
      { id: 'ScrollLock', label: 'Arrêt défil.' },
      { id: 'NumLock', label: 'Verr. Num' },
    ],
  },
  {
    label: 'Pavé numérique',
    keys: [
      ...digits.map((d) => ({ id: `Numpad${d}`, label: `Num ${d}` })),
      { id: 'NumpadAdd', label: 'Num +' },
      { id: 'NumpadSubtract', label: 'Num -' },
      { id: 'NumpadMultiply', label: 'Num *' },
      { id: 'NumpadDivide', label: 'Num /' },
      { id: 'NumpadDecimal', label: 'Num .' },
      { id: 'NumpadEnter', label: 'Num Entrée' },
    ],
  },
  {
    label: 'Ponctuation',
    keys: [
      { id: 'Minus', label: '-' },
      { id: 'Equal', label: '=' },
      { id: 'BracketLeft', label: '[' },
      { id: 'BracketRight', label: ']' },
      { id: 'Backslash', label: '\\' },
      { id: 'Semicolon', label: ';' },
      { id: 'Quote', label: "'" },
      { id: 'Backquote', label: '`' },
      { id: 'Comma', label: ',' },
      { id: 'Period', label: '.' },
      { id: 'Slash', label: '/' },
      { id: 'IntlBackslash', label: '<' },
    ],
  },
];

export const ALL_KEYS = KEY_GROUPS.flatMap((g) => g.keys);
const KEY_IDS = new Set(ALL_KEYS.map((k) => k.id));

export function isValidKey(id) {
  return KEY_IDS.has(id);
}

export function keyLabel(id) {
  return ALL_KEYS.find((k) => k.id === id)?.label ?? id;
}

export const MEDIA_ACTIONS = [
  { id: 'play-pause', label: 'Lecture / Pause' },
  { id: 'next', label: 'Piste suivante' },
  { id: 'prev', label: 'Piste précédente' },
  { id: 'stop', label: 'Stop' },
  { id: 'vol-up', label: 'Volume +' },
  { id: 'vol-down', label: 'Volume −' },
  { id: 'mute', label: 'Muet' },
];

// Convertit un KeyboardEvent du navigateur en nom canonique.
// Lettres : on utilise `key` pour respecter la disposition (AZERTY : la touche
// « A » envoie bien A). Chiffres et ponctuation : on utilise `code` (position
// physique), car sur AZERTY `key` renverrait « & », « é »…
export function keyFromEvent(ev) {
  const { key, code } = ev;
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) return null;
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
  // Alt/AltGr + lettre produit un caractère spécial (« œ », « æ »…) : on retombe sur la position.
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code) && KEY_IDS.has(code)) return code;
  if (code === 'Space') return 'Space';
  if (/^F\d{1,2}$/.test(key) && KEY_IDS.has(key)) return key;
  if (KEY_IDS.has(key)) return key;
  if (KEY_IDS.has(code)) return code;
  return null;
}

export function formatHotkey(hotkey, { mac = false } = {}) {
  if (!hotkey || !hotkey.key) return '';
  const mods = MODIFIERS.filter((m) => hotkey.modifiers?.includes(m.id)).map((m) =>
    mac ? m.mac : m.id === 'meta' ? 'Win' : m.label,
  );
  const k = keyLabel(hotkey.key);
  return mac ? mods.join('') + k : [...mods, k].join(' + ');
}

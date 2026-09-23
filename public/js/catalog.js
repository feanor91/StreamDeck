import { formatHotkey, MEDIA_ACTIONS } from '/shared/keys.js';
import { h } from './dom.js';

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

// Types d'action disponibles : métadonnées d'affichage + valeurs par défaut.
export const ACTION_TYPES = {
  hotkey: {
    label: 'Raccourci',
    long: 'Raccourci clavier',
    desc: 'Envoie une combinaison de touches',
    icon: '⌨️',
    color: '#8b7bff',
    create: () => ({ type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } }),
    face: { icon: '⌨️', color: '#4f46e5' },
    summary: (a) => formatHotkey(a.hotkey, { mac: isMac }) || 'Aucune touche définie',
  },
  text: {
    label: 'Texte',
    long: 'Saisir du texte',
    desc: 'Tape un texte, une signature…',
    icon: '✍️',
    color: '#f59e0b',
    create: () => ({ type: 'text', text: '', submit: false, target: { by: 'none', value: '' } }),
    face: { icon: '✍️', color: '#b45309' },
    summary: (a) => (a.text ? `« ${a.text.split('\n')[0]} »` : 'Texte vide'),
  },
  media: {
    label: 'Multimédia',
    long: 'Contrôle multimédia',
    desc: 'Lecture, volume, pistes',
    icon: '🎵',
    color: '#ec4899',
    create: () => ({ type: 'media', media: 'play-pause' }),
    face: { icon: '⏯️', color: '#be185d' },
    summary: (a) => MEDIA_ACTIONS.find((m) => m.id === a.media)?.label ?? '—',
  },
  launch: {
    label: 'Application',
    long: 'Lancer une application',
    desc: 'Ouvre un programme ou un fichier',
    icon: '🚀',
    color: '#22c55e',
    create: () => ({ type: 'launch', path: '', args: '', cwd: '' }),
    face: { icon: '🚀', color: '#15803d' },
    summary: (a) => (a.path ? a.path.split(/[\\/]/).pop() : 'Aucun programme'),
  },
  url: {
    label: 'Site web',
    long: 'Ouvrir un site web',
    desc: 'Ouvre une adresse dans le navigateur',
    icon: '🌐',
    color: '#0ea5e9',
    create: () => ({ type: 'url', url: '' }),
    face: { icon: '🌐', color: '#0369a1' },
    summary: (a) => a.url || 'Aucune adresse',
  },
  command: {
    label: 'Commande',
    long: 'Commande système',
    desc: 'Exécute une commande shell',
    icon: '💻',
    color: '#64748b',
    create: () => ({ type: 'command', command: '', cwd: '' }),
    face: { icon: '💻', color: '#334155' },
    summary: (a) => a.command || 'Aucune commande',
  },
  page: {
    label: 'Page',
    long: 'Aller à une page',
    desc: 'Change la page affichée sur le Deck',
    icon: '📁',
    color: '#a855f7',
    create: () => ({ type: 'page', pageId: '' }),
    face: { icon: '📁', color: '#6d28d9' },
    summary: (a, ctx) => {
      if (a.pageId === '@next') return 'Page suivante';
      if (a.pageId === '@prev') return 'Page précédente';
      return ctx?.pages?.find((p) => p.id === a.pageId)?.name ?? 'Aucune page choisie';
    },
  },
  multi: {
    label: 'Multi',
    long: 'Multi-actions',
    desc: 'Enchaîne plusieurs actions',
    icon: '🔗',
    color: '#14b8a6',
    create: () => ({ type: 'multi', steps: [] }),
    face: { icon: '🔗', color: '#0f766e' },
    summary: (a) => `${a.steps?.length ?? 0} étape${(a.steps?.length ?? 0) > 1 ? 's' : ''}`,
  },
};

export const STEP_TYPES = ['hotkey', 'text', 'media', 'launch', 'url', 'command', 'delay'];
export const DELAY_TYPE = { label: 'Pause', long: 'Pause', icon: '⏱️', create: () => ({ type: 'delay', ms: 300 }) };

// Éléments de la bibliothèque (panneau de gauche). Certains sont des préréglages
// d'un même type (ex. les différentes actions multimédia).
export const LIBRARY = [
  {
    group: 'Clavier',
    items: [
      { type: 'hotkey' },
      { type: 'text' },
    ],
  },
  {
    group: 'Multimédia',
    items: MEDIA_ACTIONS.map((m) => ({
      type: 'media',
      label: m.label,
      preset: { media: m.id },
      icon: { 'play-pause': '⏯️', next: '⏭️', prev: '⏮️', stop: '⏹️', 'vol-up': '🔊', 'vol-down': '🔉', mute: '🔇' }[m.id],
      title: { 'play-pause': 'Lecture', next: 'Suivant', prev: 'Précédent', stop: 'Stop', 'vol-up': 'Vol +', 'vol-down': 'Vol −', mute: 'Muet' }[m.id],
    })),
  },
  {
    group: 'Système',
    items: [{ type: 'launch' }, { type: 'url' }, { type: 'command' }],
  },
  {
    group: 'Navigation',
    items: [
      { type: 'page' },
      { type: 'page', label: 'Page suivante', preset: { pageId: '@next' }, icon: '➡️', title: 'Suivante' },
      { type: 'page', label: 'Page précédente', preset: { pageId: '@prev' }, icon: '⬅️', title: 'Précédente' },
    ],
  },
  {
    group: 'Avancé',
    items: [{ type: 'multi' }],
  },
];

export function libraryItemInfo(item) {
  const t = ACTION_TYPES[item.type];
  return {
    label: item.label ?? t.long,
    desc: item.preset ? t.long : t.desc,
    icon: item.icon ?? t.icon,
    color: t.color,
  };
}

export function createFromLibrary(item) {
  const t = ACTION_TYPES[item.type];
  return {
    action: { ...t.create(), ...(item.preset ?? {}) },
    face: { title: item.title ?? t.label, icon: item.icon ?? t.face.icon, color: t.face.color },
  };
}

export const COLORS = [
  '#1c202a', '#334155', '#4f46e5', '#6d28d9', '#7c3aed', '#be185d', '#dc2626',
  '#ea580c', '#b45309', '#ca8a04', '#15803d', '#0f766e', '#0369a1', '#0891b2',
];

export const EMOJIS = (
  '⌨️ 🖱️ 🎮 🎧 🎤 🎙️ 📷 🎥 📹 🎬 🎞️ 📺 🖥️ 💻 📱 🔊 🔉 🔇 🎵 🎶 ⏯️ ⏭️ ⏮️ ⏹️ ⏺️ 🔴 🟢 🟡 🔵 🟣 ⚪ ⚫ ' +
  '▶️ ⏸️ 🔁 🔀 📋 📌 📎 ✂️ 🗑️ 💾 📁 📂 📄 📝 ✍️ 🖊️ 📧 💬 📞 🔔 🔕 🔒 🔓 🔑 ⚙️ 🛠️ 🔧 🔨 🧰 ' +
  '🚀 🌐 🔍 🔗 📊 📈 🗂️ 🗓️ ⏰ ⏱️ ☕ 🍕 💡 🔥 ⭐ ❤️ 👍 👎 👏 🎉 ✅ ❌ ⚠️ ❓ 💯 ➕ ➖ ↩️ ↪️ ⬅️ ➡️ ⬆️ ⬇️ 🏠 🌙 ☀️ 🌈 ⚡ 🐱 🐶 🦊 🤖 👾 😀 😂 😎 🤔 😴'
).split(' ');

// Construit le rendu visuel d'une touche (utilisé par la gestion et le Deck).
export function keyFace(key) {
  if (!key) return h('div', { class: 'keyface empty' });
  const showTitle = key.showTitle !== false && key.title;
  const hasIcon = !!key.icon;
  const el = h('div', {
    class: ['keyface', !showTitle && 'no-title', showTitle && !hasIcon && 'only-title'].filter(Boolean).join(' '),
  });
  el.style.setProperty('--key-color', key.color || '#1c202a');
  if (hasIcon) {
    if (key.icon.startsWith('data:')) el.append(h('img', { class: 'kf-icon', src: key.icon, alt: '', draggable: 'false' }));
    else el.append(h('span', { class: 'kf-icon' }, key.icon));
  }
  if (showTitle) el.append(h('span', { class: 'kf-title' }, key.title));
  return el;
}

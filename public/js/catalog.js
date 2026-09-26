import { formatHotkey, MEDIA_ACTIONS } from '/shared/keys.js';
import { h } from './dom.js';
import { faceFor } from '/shared/layout.js';
import { MSFS_PRESETS, MSFS_EVENT_LABELS, MSFS_DIAL_PRESETS, MSFS_SLIDER_PRESETS, FBW_PRESETS, RAFALE_PRESETS } from '/shared/msfs.js';
import { formatDisplay } from '/shared/controls.js';
import { SIMHUB_PRESETS } from '/shared/simhub.js';

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
  msfs: {
    label: 'MSFS',
    long: 'Commande MSFS',
    desc: 'Envoie une commande à Flight Simulator',
    icon: '🛩️',
    color: '#0ea5e9',
    create: () => ({ type: 'msfs', event: '', value: 0 }),
    face: { icon: '/public/icons/avia/plane.svg', color: '#0c4a6e' },
    summary: (a) => {
      const ops = { set: 'fixer à', toggle: 'basculer', add: 'ajouter' };
      if (a.kind === 'var') return a.var ? `${a.var} : ${ops[a.op ?? 'set']} ${a.op === 'toggle' ? '' : a.value ?? 0}`.trim() : 'Aucune variable choisie';
      if (a.kind === 'input') return a.input ? `${a.input} : ${ops[a.op ?? 'set']} ${a.op === 'toggle' ? '' : a.value ?? 0}`.trim() : 'Aucune commande de cockpit choisie';
      return a.event ? MSFS_EVENT_LABELS[a.event] ?? a.event : 'Aucune commande choisie';
    },
  },
  simhub: {
    label: 'SimHub',
    long: 'Commande SimHub',
    desc: 'Déclenche un « Control » SimHub',
    icon: '🏁',
    color: '#ef4444',
    create: () => ({ type: 'simhub', input: '', mode: 'click' }),
    face: { icon: '🏁', color: '#7f1d1d' },
    summary: (a) =>
      a.input ? `${a.input}${a.mode === 'press' ? ' (appui)' : a.mode === 'release' ? ' (relâchement)' : ''}` : 'Aucune commande choisie',
  },
  display: {
    label: 'Afficheur',
    long: 'Afficheur',
    desc: 'Affiche une valeur en direct (SimHub, MSFS)',
    icon: '🔢',
    color: '#06b6d4',
    create: () => ({ type: 'display', display: { simhub: 'dcp.gd.SpeedKmh', decimals: 0 }, press: null }),
    face: { icon: null, color: '#111827', title: 'Afficheur' },
    summary: (a) => {
      const d = a.display ?? {};
      const src = d.simhub ? `SimHub : ${d.simhub}` : d.input ? `MSFS : ${d.input}` : d.simvar ? `MSFS : ${d.simvar}` : 'Aucune valeur choisie';
      return a.press?.type ? `${src} · appui : ${ACTION_TYPES[a.press.type]?.summary(a.press) ?? ''}` : src;
    },
  },
  dial: {
    label: 'Rotatif',
    long: 'Bouton rotatif',
    desc: 'Tourner pour régler, appuyer pour valider',
    icon: '🎛️',
    color: '#06b6d4',
    create: () => ({
      type: 'dial',
      sensitivity: 'normal',
      inc: { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
      dec: { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
      press: null,
      display: null,
    }),
    face: { icon: '🎛️', color: '#1e2533', title: 'Rotatif' },
    summary: (a, ctx) => {
      const sum = (x) => (x?.type ? ACTION_TYPES[x.type]?.summary(x, ctx) : '—');
      return `+ ${sum(a.inc)} · − ${sum(a.dec)}${a.press?.type ? ` · appui : ${sum(a.press)}` : ''}`;
    },
  },
  slider: {
    label: 'Curseur',
    long: 'Curseur',
    desc: 'Glisser pour régler une position',
    icon: '🎚️',
    color: '#06b6d4',
    create: () => ({
      type: 'slider',
      mode: 'steps',
      notches: 10,
      inc: { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
      dec: { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
      set: { type: 'msfs', event: 'THROTTLE_SET' },
      min: 0,
      max: 16383,
      press: null,
      sync: null,
    }),
    face: { icon: '🎚️', color: '#1e2533', title: 'Curseur' },
    summary: (a) =>
      (a.mode ?? 'value') === 'value'
        ? `Position → ${MSFS_EVENT_LABELS[a.set?.event] ?? a.set?.event ?? '—'}`
        : `${a.notches ?? 10} crans · + / −`,
  },
  toggle: {
    label: 'Bascule',
    long: 'Bascule (2 états)',
    desc: 'Alterne entre deux états à chaque appui',
    icon: '🔀',
    color: '#f97316',
    create: () => ({
      type: 'toggle',
      same: true,
      actions: [
        { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
        { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
      ],
    }),
    face: { icon: '⚪', color: '#334155', title: 'Inactif' },
    alt: { icon: '🟢', color: '#15803d', title: 'Actif' },
    summary: (a, ctx) => {
      const [a0, a1] = a.actions ?? [];
      const sum = (x) => (x?.type && x.type !== 'toggle' ? ACTION_TYPES[x.type]?.summary(x, ctx) : '—');
      return a.same ? `2 états · ${sum(a0)}` : `${sum(a0)} ⇄ ${sum(a1)}`;
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

export const STEP_TYPES = ['hotkey', 'text', 'media', 'launch', 'url', 'command', 'msfs', 'simhub', 'delay'];
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
    items: [{ type: 'multi' }, { type: 'toggle' }, { type: 'dial' }, { type: 'slider' }],
  },
  {
    group: 'MSFS 2024 (SimConnect)',
    items: [{ type: 'msfs' }, ...MSFS_PRESETS, ...MSFS_DIAL_PRESETS, ...MSFS_SLIDER_PRESETS],
  },
  {
    group: 'A320 FlyByWire',
    items: FBW_PRESETS,
  },
  {
    group: 'Rafale (AzurPoly)',
    items: RAFALE_PRESETS,
  },
  {
    group: 'SimHub',
    items: [{ type: 'simhub' }, { type: 'display' }, ...SIMHUB_PRESETS],
  },
  {
    group: 'Simulation (raccourcis clavier)',
    items: [
      {
        type: 'toggle',
        label: 'Train d’atterrissage',
        preset: {
          same: true,
          actions: [
            { type: 'hotkey', hotkey: { modifiers: [], key: 'G' }, target: { by: 'none', value: '' } },
            { type: 'hotkey', hotkey: { modifiers: [], key: 'G' }, target: { by: 'none', value: '' } },
          ],
        },
        icon: '✈️',
        title: 'Train rentré',
        color: '#334155',
        alt: { title: 'Train sorti', icon: '🛬', color: '#15803d' },
      },
      {
        type: 'toggle',
        label: 'Feux d’atterrissage',
        preset: {
          same: true,
          actions: [
            { type: 'hotkey', hotkey: { modifiers: ['ctrl'], key: 'L' }, target: { by: 'none', value: '' } },
            { type: 'hotkey', hotkey: { modifiers: ['ctrl'], key: 'L' }, target: { by: 'none', value: '' } },
          ],
        },
        icon: '💡',
        title: 'Feux éteints',
        color: '#334155',
        alt: { title: 'Feux allumés', icon: '💡', color: '#ca8a04' },
      },
      {
        type: 'toggle',
        label: 'Frein de parc',
        preset: {
          same: true,
          actions: [
            { type: 'hotkey', hotkey: { modifiers: ['ctrl'], key: 'Period' }, target: { by: 'none', value: '' } },
            { type: 'hotkey', hotkey: { modifiers: ['ctrl'], key: 'Period' }, target: { by: 'none', value: '' } },
          ],
        },
        icon: '🅿️',
        title: 'Frein desserré',
        color: '#334155',
        alt: { title: 'Frein serré', icon: '🅿️', color: '#b91c1c' },
      },
    ],
  },
];

export function libraryItemInfo(item) {
  if (item.action) {
    // Préréglage complet (ex. MSFS) : action et apparence fournies.
    return {
      label: item.label,
      desc: item.desc ?? { toggle: 'MSFS · état synchronisé', dial: 'MSFS · bouton rotatif', slider: 'MSFS · curseur' }[item.action.type] ?? 'MSFS · commande',
      icon: item.face.icon ?? ACTION_TYPES[item.action.type]?.icon,
      color: item.desc?.startsWith('SimHub') ? '#ef4444' : '#0ea5e9',
    };
  }
  const t = ACTION_TYPES[item.type];
  return {
    label: item.label ?? t.long,
    desc: item.preset ? t.long : t.desc,
    icon: item.icon ?? t.icon,
    color: t.color,
  };
}

export function createFromLibrary(item) {
  if (item.action) {
    const copy = JSON.parse(JSON.stringify(item));
    return { action: copy.action, face: copy.alt ? { ...copy.face, alt: copy.alt } : copy.face };
  }
  const t = ACTION_TYPES[item.type];
  const face = { title: item.title ?? t.face.title ?? t.label, icon: item.icon ?? t.face.icon, color: item.color ?? t.face.color };
  const alt = item.alt ?? t.alt;
  return {
    action: { ...t.create(), ...(item.preset ?? {}) },
    face: alt ? { ...face, alt: { ...alt } } : face,
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

// Icône fournie par l'application (ex. /public/icons/avia/gear-down.svg).
export const isIconPath = (icon) => typeof icon === 'string' && /^\/public\/icons\/[\w/-]+\.svg$/.test(icon);

function iconNode(icon, cls = 'kf-icon') {
  if (!icon) return null;
  if (icon.startsWith('data:')) return h('img', { class: cls, src: icon, alt: '', draggable: 'false' });
  if (isIconPath(icon)) return h('img', { class: `${cls} kf-svg`, src: icon, alt: '', draggable: 'false' });
  return h('span', { class: cls }, icon);
}

// Bouton rotatif : cadran avec repère orienté (angle), valeur ou icône au centre.
function dialFace(key, live) {
  const el = h('div', { class: 'keyface kf-dial-key' });
  el.style.setProperty('--key-color', key.color || '#1e2533');
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r1 = i % 6 ? 40 : 37;
    return `<line x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 44}" y2="${50 - Math.cos(a) * 44}"/>`;
  }).join('');
  const dial = h('div', {
    class: 'kf-dial',
    html: `<svg viewBox="0 0 100 100"><g class="ticks">${ticks}</g><circle class="knob" cx="50" cy="50" r="33"/><g class="needle"><line x1="50" y1="22" x2="50" y2="30"/></g></svg>`,
  });
  dial.style.setProperty('--angle', `${live.angle ?? 0}deg`);
  const d = key.action?.display;
  const hasValue = !!(d?.simvar || d?.input);
  const center = h(
    'span',
    { class: 'kf-dial-center' },
    hasValue ? h('span', { class: 'kf-value' }, formatDisplay(live.value, d, live.flags)) : iconNode(key.icon, 'kf-dial-icon') ?? h('span', { class: 'kf-value' }, key.title ?? ''),
  );
  dial.append(center);
  el.append(dial);
  if (key.showTitle !== false && key.title) el.append(h('span', { class: 'kf-title' }, key.title));
  return el;
}

// Afficheur : grande valeur en direct, titre en dessous.
function displayFace(key, live) {
  const el = h('div', { class: 'keyface kf-display-key' });
  el.style.setProperty('--key-color', key.color || '#111827');
  const text = formatDisplay(live.value, key.action?.display ?? {}, live.flags);
  const value = h('span', { class: 'kf-display-value' }, text);
  // Taille adaptée à la longueur du texte (« 3 » en très grand, « 1:23.456 » plus petit).
  value.style.setProperty('--len', Math.max(1, text.length));
  const ic = iconNode(key.icon, 'kf-display-icon');
  if (ic) el.append(ic);
  el.append(value);
  if (key.showTitle !== false && key.title) el.append(h('span', { class: 'kf-title' }, key.title));
  return el;
}

// Curseur : piste, remplissage selon la position, poignée ; vertical si la touche est plus haute que large.
function sliderFace(key, live) {
  const vertical = live.vertical !== false;
  const el = h('div', { class: `keyface kf-slider-key ${vertical ? 'vertical' : 'horizontal'}` });
  el.style.setProperty('--key-color', key.color || '#1e2533');
  const level = Math.min(1, Math.max(0, Number(live.level) || 0));
  const track = h('div', { class: 'kf-track' }, h('div', { class: 'kf-fill' }), h('div', { class: 'kf-thumb' }));
  el.style.setProperty('--level', level);
  el.append(
    h('div', { class: 'kf-slider-head' }, iconNode(key.icon, 'kf-slider-icon'), h('span', { class: 'kf-value' }, `${Math.round(level * 100)} %`)),
    track,
  );
  if (key.showTitle !== false && key.title) el.append(h('span', { class: 'kf-title' }, key.title));
  return el;
}

// Construit le rendu visuel d'une touche (utilisé par la gestion et le Deck).
// `state` : état courant d'une touche à bascule (0 ou 1).
// `live`  : valeurs en direct des touches continues ({ value, level, angle, vertical }).
export function keyFace(rawKey, state = 0, live = {}) {
  if (!rawKey) return h('div', { class: 'keyface empty' });
  if (rawKey.action?.type === 'dial') return dialFace(rawKey, live);
  if (rawKey.action?.type === 'slider') return sliderFace(rawKey, live);
  if (rawKey.action?.type === 'display') return displayFace(rawKey, live);
  const key = faceFor(rawKey, state);
  const showTitle = key.showTitle !== false && key.title;
  const hasIcon = !!key.icon;
  const el = h('div', {
    class: ['keyface', !showTitle && 'no-title', showTitle && !hasIcon && 'only-title'].filter(Boolean).join(' '),
  });
  el.style.setProperty('--key-color', key.color || '#1c202a');
  if (hasIcon) {
    if (key.icon.startsWith('data:')) el.append(h('img', { class: 'kf-icon', src: key.icon, alt: '', draggable: 'false' }));
    else if (isIconPath(key.icon)) el.append(h('img', { class: 'kf-icon kf-svg', src: key.icon, alt: '', draggable: 'false' }));
    else el.append(h('span', { class: 'kf-icon' }, key.icon));
  }
  if (showTitle) el.append(h('span', { class: 'kf-title' }, key.title));
  if (rawKey.action?.type === 'toggle') {
    el.append(h('span', { class: 'kf-state', title: `État ${state ? 2 : 1}` }, h('i', { class: state ? '' : 'on' }), h('i', { class: state ? 'on' : '' })));
  }
  return el;
}

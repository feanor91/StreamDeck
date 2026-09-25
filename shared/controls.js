// Touches « continues » : bouton rotatif (dial) et curseur (slider).
// Fonctions partagées par le serveur, l'écran de configuration et le Deck.

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Nombre maximal de crans traités par envoi (évite les rafales démesurées). */
export const MAX_STEPS = 40;

/** Pixels de glissement par cran selon la sensibilité choisie. */
export const DIAL_SENSITIVITY = { fine: 28, normal: 16, fast: 8 };

/**
 * Mise en forme d'une valeur affichée sur une touche (ex. 275 → « 275° »).
 * Options de `display` : decimals, suffix, scale, wrap360 (cap 1 à 360),
 * pad (zéros devant, ex. « 045 »), sign (« +1500 »), machAuto (0,78 si < 1).
 * `flags` (afficheurs type FCU) : dashes → « --- », managed → point « • », std → « STD ».
 * Valeurs texte (ex. rapport « N » de SimHub) : affichées telles quelles.
 * `time` : durée en secondes affichée en « 1:23.456 » (temps au tour).
 */
export function formatDisplay(value, display = {}, flags = null) {
  if (flags?.std) return 'STD';
  if (flags?.dashes) return `---${flags?.managed ? '•' : ''}`;
  if (typeof value === 'string' && value !== '' && Number.isNaN(Number(value))) return `${value}${display.suffix ?? ''}`;
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  if (display.time) return formatDuration(Number(value), display.decimals ?? 3);
  let v = Number(value) * (Number(display.scale) || 1);
  let decimals = clamp(Number(display.decimals) || 0, 0, 3);
  if (display.machAuto && Math.abs(v) > 0 && Math.abs(v) < 1) decimals = 2;
  if (display.wrap360) v = ((Math.round(v) % 360) + 360) % 360 || 360;
  let text = Math.abs(v).toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: !display.pad && Math.abs(v) >= 10000,
  });
  if (display.pad && !decimals) text = text.padStart(Number(display.pad), '0');
  const sign = v < 0 ? '−' : display.sign && v > 0 ? '+' : '';
  return `${sign}${text}${display.suffix ?? ''}${flags?.managed ? '•' : ''}`;
}

/** Secondes → « 1:23.456 » (ou « 1:02:03.4 » au-delà d'une heure). */
export function formatDuration(seconds, decimals = 3) {
  const d = clamp(Number(decimals) || 0, 0, 3);
  const neg = seconds < 0;
  const unit = 10 ** d;
  const total = Math.round(Math.abs(seconds) * unit);
  const whole = Math.floor(total / unit);
  const frac = d ? `.${String(total % unit).padStart(d, '0')}` : '';
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return `${neg ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${s}${frac}`;
}

/** Position 0..1 d'un curseur → valeur envoyée (ex. 0..16383 pour THROTTLE_SET). */
export function levelToValue(level, min = 0, max = 16383) {
  return Math.round(Number(min) + clamp(Number(level) || 0, 0, 1) * (Number(max) - Number(min)));
}

/** Valeur lue dans le simulateur → position 0..1 du curseur. */
export function valueToLevel(value, min = 0, max = 100) {
  const span = Number(max) - Number(min);
  if (!span) return 0;
  return clamp((Number(value) - Number(min)) / span, 0, 1);
}

/** Curseur « pas à pas » : nombre de crans à envoyer pour passer d'une position à l'autre. */
export function notchDelta(fromLevel, toLevel, notches = 10) {
  const n = clamp(Math.round(Number(notches) || 10), 1, 100);
  return Math.round(clamp(toLevel, 0, 1) * n) - Math.round(clamp(fromLevel, 0, 1) * n);
}

// Touches « continues » : bouton rotatif (dial) et curseur (slider).
// Fonctions partagées par le serveur, l'écran de configuration et le Deck.

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Nombre maximal de crans traités par envoi (évite les rafales démesurées). */
export const MAX_STEPS = 40;

/** Pixels de glissement par cran selon la sensibilité choisie. */
export const DIAL_SENSITIVITY = { fine: 28, normal: 16, fast: 8 };

/** Mise en forme d'une valeur affichée sur une touche (ex. 275 → « 275° »). */
export function formatDisplay(value, display = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const decimals = clamp(Number(display.decimals) || 0, 0, 3);
  let v = Number(value) * (Number(display.scale) || 1);
  if (display.wrap360) v = ((Math.round(v) % 360) + 360) % 360 || 360;
  const text = v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: Math.abs(v) >= 10000 });
  return `${text}${display.suffix ?? ''}`;
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

// Placement des touches dans la grille, y compris les touches fusionnées
// (une touche peut couvrir plusieurs emplacements : span = { w, h }).
// Partagé par l'interface de configuration et le Deck.

export function keySpan(key, row = 0, col = 0, rows = Infinity, cols = Infinity) {
  const w = Math.max(1, Math.min(Number(key?.span?.w) || 1, cols - col));
  const h = Math.max(1, Math.min(Number(key?.span?.h) || 1, rows - row));
  return { w, h };
}

/**
 * Calcule les cellules à afficher.
 * Retourne `cells` (une entrée par touche ou emplacement vide, avec position et taille)
 * et `coveredBy` (emplacement couvert → index de la touche qui le recouvre).
 * Une touche dont l'origine est déjà recouverte (conflit après un changement
 * de disposition) est masquée, pas supprimée.
 */
export function computeCells(keys, rows, cols) {
  const coveredBy = new Map();
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    if (coveredBy.has(i)) continue;
    const row = Math.floor(i / cols);
    const col = i % cols;
    const key = keys[i] ?? null;
    let { w, h } = key ? keySpan(key, row, col, rows, cols) : { w: 1, h: 1 };
    // Réduit la touche si elle chevauche une touche placée avant elle.
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (coveredBy.has(i + dy * cols + dx)) {
          if (dy === 0) w = dx;
          else h = dy;
        }
      }
    }
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (dx || dy) coveredBy.set(i + dy * cols + dx, i);
      }
    }
    cells.push({ index: i, row, col, w, h, key });
  }
  return { cells, coveredBy };
}

/**
 * Vérifie qu'une touche de taille w×h peut être placée à `index`
 * sans sortir de la grille ni recouvrir une autre touche.
 * `ignore` : index des touches à ne pas considérer (ex. la touche elle-même).
 * Retourne null si c'est possible, sinon un message d'erreur.
 */
export function placementError(keys, index, w, h, rows, cols, ignore = []) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  if (col + w > cols || row + h > rows) return 'La touche dépasse de la grille à cet endroit.';
  const skip = new Set(ignore.map(Number));
  const target = new Set();
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) target.add(index + dy * cols + dx);
  for (const [k, key] of Object.entries(keys)) {
    const j = Number(k);
    if (skip.has(j) || !key || j >= rows * cols) continue;
    const r = Math.floor(j / cols);
    const c = j % cols;
    const s = keySpan(key, r, c, rows, cols);
    for (let dy = 0; dy < s.h; dy++) {
      for (let dx = 0; dx < s.w; dx++) {
        if (target.has(j + dy * cols + dx)) return 'Des touches occupent déjà ces emplacements : libérez-les d’abord.';
      }
    }
  }
  return null;
}

/** Premier emplacement libre pouvant accueillir une touche w×h, ou null. */
export function findFreeSlot(keys, rows, cols, w = 1, h = 1) {
  for (let i = 0; i < rows * cols; i++) {
    if (!placementError(keys, i, w, h, rows, cols)) return i;
  }
  return null;
}

/** Apparence d'une touche selon l'état d'une bascule (0 = état 1, 1 = état 2). */
export function faceFor(key, state = 0) {
  if (!key || key.action?.type !== 'toggle' || !state) return key;
  return { ...key, ...(key.alt ?? {}) };
}

/** Identifiant stable de l'état d'une touche à bascule. */
export const stateKey = (profileId, pageId, index) => `${profileId}/${pageId}/${index}`;

/**
 * Choisit l'orientation d'affichage de la grille pour remplir un écran W×H :
 * la grille configurée (ex. 3 lignes × 5 colonnes) ou sa transposée (5 × 3),
 * selon celle qui donne les touches les plus proches du carré.
 * Retourne { rows, cols, transposed }.
 */
export function fitGrid(rows, cols, width, height) {
  if (rows === cols || !width || !height) return { rows, cols, transposed: false };
  const distortion = (r, c) => Math.abs(Math.log(width / c / (height / r)));
  // Petite marge pour ne pas basculer d'une disposition à l'autre sur un écran presque carré.
  const transposed = distortion(cols, rows) + 0.1 < distortion(rows, cols);
  return transposed ? { rows: cols, cols: rows, transposed } : { rows, cols, transposed };
}

/**
 * Place une cellule calculée par computeCells dans la grille affichée.
 * En disposition transposée, la ligne devient la colonne (et une touche fusionnée
 * 2×1 devient 1×2) : les groupes de touches voisines sont conservés.
 */
export function orientCell(cell, transposed) {
  if (!transposed) return cell;
  return { ...cell, row: cell.col, col: cell.row, w: cell.h, h: cell.w };
}

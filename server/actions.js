import { exec } from 'node:child_process';
import { isValidKey } from '../shared/keys.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Types d'action exécutés côté serveur. Les actions de navigation ("page")
// sont gérées par la surface Deck elle-même.
export const SERVER_ACTIONS = ['hotkey', 'text', 'media', 'launch', 'url', 'command', 'multi', 'delay', 'toggle', 'msfs', 'dial', 'slider'];

/**
 * Touche à bascule : action envoyée selon l'état courant (0 = état 1, 1 = état 2).
 * Avec `same`, l'état 2 envoie la même action que l'état 1 (ex. une seule touche « G » pour le train).
 */
export function toggleAction(action, state) {
  const list = action?.actions ?? [];
  return state && !action?.same ? list[1] : list[0];
}

function runShell(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: cwd || undefined, timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim()));
      else resolve(stdout.toString());
    });
  });
}

async function focusTarget(executor, target) {
  if (!target || !target.value || target.by === 'none') return;
  await executor.focus(target);
  // Laisse le temps au gestionnaire de fenêtres de donner le focus.
  await sleep(Number(target.delay ?? 120));
}

/**
 * Opération sur une valeur du simulateur (variable ou Input Event) :
 *  - « set »    : fixe la valeur ;
 *  - « toggle » : alterne entre `value` (1 par défaut) et `off` (0 par défaut) ;
 *  - « add »    : ajoute `value` (pas, négatif possible), borné par min / max,
 *                 ou bouclé si `wrap` (ex. un cap de 0 à 360).
 */
export async function applyOperation(action, read, write) {
  const op = action.op ?? 'set';
  const value = Number(action.value ?? (op === 'set' ? 0 : 1));
  if (op === 'set') return write(value);
  const current = Number(await read()) || 0;
  if (op === 'toggle') {
    const off = Number(action.off ?? 0);
    const on = Number(action.value ?? 1);
    return write(Math.abs(current - on) < 1e-6 ? off : on);
  }
  if (op === 'add') {
    let next = current + value;
    const min = action.min === undefined || action.min === '' ? null : Number(action.min);
    const max = action.max === undefined || action.max === '' ? null : Number(action.max);
    if (action.wrap && min !== null && max !== null && max > min) {
      const span = max - min;
      next = ((((next - min) % span) + span) % span) + min;
    } else {
      if (min !== null) next = Math.max(min, next);
      if (max !== null) next = Math.min(max, next);
    }
    return write(next);
  }
  throw new Error(`Opération inconnue : ${op}`);
}

// `ctx.msfs` : liaison SimConnect (actions « msfs »).
export async function runAction(executor, action, depth = 0, ctx = {}) {
  if (!action || !action.type) throw new Error('Aucune action configurée sur cette touche.');
  if (depth > 5) throw new Error('Multi-action trop imbriquée.');

  switch (action.type) {
    case 'hotkey': {
      const hk = action.hotkey;
      if (!hk?.key || !isValidKey(hk.key)) throw new Error('Raccourci clavier incomplet.');
      await focusTarget(executor, action.target);
      const repeat = Math.min(Math.max(Number(action.repeat) || 1, 1), 50);
      for (let i = 0; i < repeat; i++) {
        await executor.hotkey(hk);
        if (i < repeat - 1) await sleep(40);
      }
      return;
    }
    case 'text': {
      if (!action.text) throw new Error('Aucun texte à saisir.');
      await focusTarget(executor, action.target);
      await executor.text(action.text);
      if (action.submit) await executor.hotkey({ key: 'Enter', modifiers: [] });
      return;
    }
    case 'media':
      return executor.media(action.media);
    case 'launch':
      if (!action.path) throw new Error('Aucun programme à lancer.');
      return executor.launch({ path: action.path, args: action.args, cwd: action.cwd });
    case 'url': {
      let url = String(action.url || '').trim();
      if (!url) throw new Error('Aucune adresse à ouvrir.');
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
      return executor.openUrl(url);
    }
    case 'command':
      if (!action.command) throw new Error('Aucune commande à exécuter.');
      return runShell(action.command, action.cwd);
    case 'delay':
      return sleep(Math.min(Number(action.ms) || 0, 60000));
    case 'multi':
      for (const step of action.steps ?? []) {
        await runAction(executor, step, depth + 1, ctx);
        await sleep(30);
      }
      return;
    case 'toggle': {
      // Hors appui réel (bouton « Tester »), on exécute l'action de l'état demandé.
      const inner = toggleAction(action, action.testState ?? 0);
      if (!inner?.type) throw new Error('Aucune action définie pour cet état de la bascule.');
      if (inner.type === 'toggle') throw new Error('Une bascule ne peut pas en contenir une autre.');
      return runAction(executor, inner, depth + 1, ctx);
    }
    case 'dial':
      // Bouton « Tester » : on simule un appui (ou un cran « + » s'il n'y a pas d'action d'appui).
      if (action.press?.type) return runAction(executor, action.press, depth + 1, ctx);
      if (action.inc?.type) return runAction(executor, action.inc, depth + 1, ctx);
      throw new Error('Aucune action définie pour ce bouton rotatif.');
    case 'slider':
      if (action.press?.type) return runAction(executor, action.press, depth + 1, ctx);
      throw new Error('Un curseur se teste depuis le Deck (glisser le curseur).');
    case 'msfs': {
      if (!ctx.msfs) throw new Error('Liaison MSFS indisponible.');
      const kind = action.kind ?? 'event';
      if (kind === 'var') {
        if (!action.var) throw new Error('Aucune variable MSFS choisie.');
        const unit = action.unit || 'number';
        return applyOperation(action, () => ctx.msfs.readVar(action.var, unit), (v) => ctx.msfs.setVar(action.var, unit, v));
      }
      if (kind === 'input') {
        if (!action.input) throw new Error('Aucune commande de cockpit (Input Event) choisie.');
        return applyOperation(action, () => ctx.msfs.readInput(action.input), (v) => ctx.msfs.setInput(action.input, v));
      }
      if (!action.event) throw new Error('Aucun événement MSFS choisi.');
      return ctx.msfs.send(action.event, action.value);
    }
    case 'page':
      return; // navigation gérée par le client
    default:
      throw new Error(`Type d'action inconnu : ${action.type}`);
  }
}

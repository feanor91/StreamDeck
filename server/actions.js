import { exec } from 'node:child_process';
import { isValidKey } from '../shared/keys.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Types d'action exécutés côté serveur. Les actions de navigation ("page")
// sont gérées par la surface Deck elle-même.
export const SERVER_ACTIONS = ['hotkey', 'text', 'media', 'launch', 'url', 'command', 'multi', 'delay', 'toggle'];

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

export async function runAction(executor, action, depth = 0) {
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
        await runAction(executor, step, depth + 1);
        await sleep(30);
      }
      return;
    case 'toggle': {
      // Hors appui réel (bouton « Tester »), on exécute l'action de l'état demandé.
      const inner = toggleAction(action, action.testState ?? 0);
      if (!inner?.type) throw new Error('Aucune action définie pour cet état de la bascule.');
      if (inner.type === 'toggle') throw new Error('Une bascule ne peut pas en contenir une autre.');
      return runAction(executor, inner, depth + 1);
    }
    case 'page':
      return; // navigation gérée par le client
    default:
      throw new Error(`Type d'action inconnu : ${action.type}`);
  }
}

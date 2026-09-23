import { createWindowsExecutor } from './windows.js';
import { createLinuxExecutor } from './linux.js';
import { createMacExecutor } from './macos.js';

// Exécuteur de simulation : journalise au lieu d'agir. Utilisé si
// DECK_DRY_RUN=1 ou sur une plateforme non prise en charge.
function createDryRunExecutor(log) {
  const say = (what) => async (...args) => log(`[simulation] ${what} ${JSON.stringify(args)}`);
  return {
    name: 'dry-run',
    label: 'Simulation (aucune touche envoyée)',
    check: async () => ({ ok: true, simulated: true }),
    focus: say('focus'),
    hotkey: say('hotkey'),
    text: say('text'),
    media: say('media'),
    launch: say('launch'),
    openUrl: say('openUrl'),
    listWindows: async () => [],
  };
}

export function createExecutor({ dryRun = false, log = console.log } = {}) {
  if (dryRun) return createDryRunExecutor(log);
  switch (process.platform) {
    case 'win32':
      return createWindowsExecutor();
    case 'darwin':
      return createMacExecutor();
    case 'linux':
      return createLinuxExecutor();
    default:
      return createDryRunExecutor(log);
  }
}

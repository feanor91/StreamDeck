import { execFile } from 'node:child_process';

export function run(cmd, args, { timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || '').toString().trim();
        reject(new Error(detail || err.message));
      } else {
        resolve(stdout.toString());
      }
    });
  });
}

export async function which(bin) {
  try {
    await run(process.platform === 'win32' ? 'where' : 'which', [bin]);
    return true;
  } catch {
    return false;
  }
}

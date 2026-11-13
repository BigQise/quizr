// Claude Code Stop hook.
// Refuses to let a turn end while the project has type errors: exit 2 sends
// the compiler output back to Claude, which then keeps working.

import { spawnSync } from 'node:child_process';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

let input = {};
try {
  input = JSON.parse(await readStdin());
} catch {
  // No input is fine; fall through and run the check.
}

// Already continuing because of this hook: do not loop.
if (input.stop_hook_active) process.exit(0);

// Skip when no TypeScript has changed since the last commit.
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
const touchedTypeScript = (status.stdout ?? '')
  .split('\n')
  .some((line) => /\.(ts|tsx)$/.test(line.trim()) || /\/$/.test(line.trim()));
if (status.status === 0 && !touchedTypeScript) process.exit(0);

const result = spawnSync('bun', ['run', 'typecheck'], { encoding: 'utf8', shell: true });
if (result.status === 0) process.exit(0);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
console.error(`Type errors must be fixed before finishing:\n${output.slice(0, 6000)}`);
process.exit(2);

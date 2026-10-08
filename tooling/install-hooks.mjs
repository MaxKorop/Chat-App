// Installs the git hooks (lefthook). Runs as the root `prepare` script on every `pnpm install`.
// Outside a git checkout (a Docker build, a source archive) there is nothing to install hooks into.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('.git')) {
  process.stdout.write('No .git folder here: skipping git hooks.\n');
} else {
  const result = spawnSync('pnpm', ['exec', 'lefthook', 'install'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

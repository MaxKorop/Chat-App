// Repository-level tests: they describe what Steps 1-3 of docs/IMPROVEMENT_PLAN.md must produce.
// Run with `pnpm test:repo`. Uses only Node built-ins, so it works before any dependency is installed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));
// tsconfig files are JSONC: drop whole-line // comments before parsing
const readJsonc = (...p) => JSON.parse(read(...p).replace(/^\s*\/\/.*$/gm, ''));

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
function findFiles(dir, name, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findFiles(full, name, found);
    else if (entry === name) found.push(full);
  }
  return found;
}

const lint = (message) =>
  spawnSync('pnpm', ['exec', 'commitlint'], { cwd: root, input: message, encoding: 'utf8' });
const web = (...p) => path('apps', 'web', ...p);

function allDependencies(pkg) {
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
}

describe('Step 1: pnpm monorepo', () => {
  it('keeps the improvement plan and its companion docs (the plan must never be deleted)', () => {
    for (const file of ['IMPROVEMENT_PLAN.md', 'development.md', 'implementation-log.md']) {
      assert.ok(existsSync(path('docs', file)), `docs/${file} is missing`);
    }
  });

  it('declares workspaces for apps/* and packages/*', () => {
    assert.ok(existsSync(path('pnpm-workspace.yaml')), 'pnpm-workspace.yaml is missing');
    const workspace = read('pnpm-workspace.yaml');
    assert.match(workspace, /-\s*apps\/\*/);
    assert.match(workspace, /-\s*packages\/\*/);
  });

  it('has a private root package pinned to pnpm and a Node version', () => {
    const pkg = readJson('package.json');
    assert.equal(pkg.name, 'chat-app');
    assert.equal(pkg.private, true);
    assert.match(pkg.packageManager, /^pnpm@\d+/);
    assert.ok(pkg.engines?.node, 'engines.node is missing');
    assert.ok(existsSync(path('.nvmrc')), '.nvmrc is missing');
  });

  it('moved client/server into apps/web and apps/api with scoped names', () => {
    assert.ok(!existsSync(path('client')), 'client/ should be moved to apps/web');
    assert.ok(!existsSync(path('server')), 'server/ should be moved to apps/api');
    assert.equal(readJson('apps', 'web', 'package.json').name, '@chat/web');
    assert.equal(readJson('apps', 'api', 'package.json').name, '@chat/api');
  });

  it('keeps the sequence diagram in docs/', () => {
    assert.ok(existsSync(path('docs', 'sequence-diagram.puml')));
    assert.ok(!existsSync(path('sequence-diagram.puml')));
  });

  it('uses pnpm only: no npm/yarn lockfiles anywhere', () => {
    assert.deepEqual(findFiles(root, 'package-lock.json'), []);
    assert.deepEqual(findFiles(root, 'yarn.lock'), []);
    assert.ok(existsSync(path('pnpm-lock.yaml')), 'pnpm-lock.yaml is missing');
  });

  it('has a single root .gitignore that ignores deps, builds and env files', () => {
    assert.deepEqual(
      findFiles(root, '.gitignore').map((f) => f.replace(root, '')),
      ['/.gitignore'],
    );
    const ignore = read('.gitignore');
    for (const pattern of ['node_modules', 'dist', '.env', 'coverage']) {
      assert.ok(ignore.includes(pattern), `.gitignore should mention ${pattern}`);
    }
  });
});

describe('Step 2: shared tooling', () => {
  it('has oxlint and oxfmt configs at the root', () => {
    assert.ok(existsSync(path('.oxlintrc.json')), '.oxlintrc.json is missing');
    assert.ok(existsSync(path('.oxfmtrc.json')), '.oxfmtrc.json is missing');
    const deps = allDependencies(readJson('package.json'));
    assert.ok(deps.includes('oxlint'));
    assert.ok(deps.includes('oxfmt'));
  });

  it('exposes lint/format/typecheck/test scripts from the root', () => {
    const { scripts } = readJson('package.json');
    for (const name of [
      'lint',
      'lint:fix',
      'format',
      'format:check',
      'typecheck',
      'test',
      'test:repo',
      'build',
    ]) {
      assert.ok(scripts?.[name], `root script "${name}" is missing`);
    }
  });

  it('no longer uses eslint or prettier in any package', () => {
    const packages = findFiles(root, 'package.json');
    assert.ok(packages.length >= 3, 'expected root + web + api package.json');
    for (const file of packages) {
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      const offenders = allDependencies(pkg).filter((d) => /eslint|prettier/.test(d));
      assert.deepEqual(offenders, [], `${file} still depends on ${offenders}`);
      assert.equal(pkg.eslintConfig, undefined, `${file} still has an eslintConfig`);
    }
    for (const name of ['.eslintrc.js', '.prettierrc', '.eslintrc.json']) {
      assert.deepEqual(findFiles(root, name), []);
    }
  });

  it('shares one tsconfig.base.json (strict) that every app extends', () => {
    const base = readJson('tsconfig.base.json');
    assert.equal(base.compilerOptions.strict, true);
    for (const app of ['web', 'api']) {
      assert.equal(readJsonc('apps', app, 'tsconfig.json').extends, '../../tsconfig.base.json');
    }
  });

  it('enforces conventional commits with commitlint', () => {
    assert.equal(lint('feat(web): add typing indicator\n').status, 0);
    assert.equal(lint('fix(api): reject empty messages\n').status, 0);
    assert.notEqual(lint('Fix bugs\n').status, 0, 'a non-conventional message must be rejected');
    assert.notEqual(lint('feat: \n').status, 0, 'an empty subject must be rejected');
  });

  it('runs formatter and commit checks through git hooks (lefthook)', () => {
    assert.ok(existsSync(path('lefthook.yml')), 'lefthook.yml is missing');
    const hooks = read('lefthook.yml');
    assert.match(hooks, /pre-commit:/);
    assert.match(hooks, /commit-msg:/);
    assert.match(hooks, /commitlint/);
    assert.equal(readJson('package.json').scripts.prepare, 'lefthook install');
  });
});

describe('Step 3: frontend on Vite + Vitest', () => {
  it('has index.html at the app root loading the module entry', () => {
    assert.ok(existsSync(web('index.html')), 'apps/web/index.html is missing');
    assert.ok(!existsSync(web('public', 'index.html')), 'public/index.html should have moved');
    assert.match(
      readFileSync(web('index.html'), 'utf8'),
      /<script type="module" src="\/src\/main\.tsx">/,
    );
    assert.ok(existsSync(web('src', 'main.tsx')), 'src/main.tsx is missing');
  });

  it('is configured with vite (dev proxy for /api and /socket.io) and vitest', () => {
    assert.ok(existsSync(web('vite.config.ts')), 'vite.config.ts is missing');
    const config = readFileSync(web('vite.config.ts'), 'utf8');
    assert.match(config, /'\/api'/);
    assert.match(config, /'\/socket\.io'/);
    assert.match(
      config,
      /process\.env\.API_URL/,
      'the proxy target must be overridable (port 3000 may be taken)',
    );
    assert.match(config, /environment: 'jsdom'/);
    assert.ok(existsSync(web('src', 'test', 'setup.ts')), 'src/test/setup.ts is missing');
  });

  it('dropped CRA, Babel and Jest', () => {
    const pkg = readJson('apps', 'web', 'package.json');
    const deps = allDependencies(pkg);
    for (const banned of [
      'react-scripts',
      'web-vitals',
      'jest',
      'babel-jest',
      'jest-environment-jsdom',
    ]) {
      assert.ok(!deps.includes(banned), `${banned} should be removed`);
    }
    assert.ok(!deps.some((d) => d.startsWith('@babel/')), 'no @babel/* presets should remain');
    for (const file of ['babel.config.js', 'jest.config.js', 'jest.setup.ts']) {
      assert.ok(!existsSync(web(file)), `${file} should be deleted`);
    }
    for (const needed of ['vite', '@vitejs/plugin-react', 'vitest', 'jsdom']) {
      assert.ok(deps.includes(needed), `${needed} should be installed`);
    }
    assert.match(pkg.dependencies.react, /^\^?19/);
  });

  it('has vite scripts and no CRA environment variables in the source', () => {
    const { scripts } = readJson('apps', 'web', 'package.json');
    assert.equal(scripts.dev, 'vite');
    assert.match(scripts.build, /vite build/);
    assert.match(scripts.test, /vitest/);
    assert.ok(scripts.typecheck);
    const offenders = findFiles(web('src'), 'index.ts')
      .concat(findFiles(web('src'), 'App.tsx'))
      .filter((f) => /REACT_APP_|ws:\/\/localhost:5000/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(offenders, []);
  });
});

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
function findFiles(dir, name, found = [], pattern = null) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findFiles(full, name, found, pattern);
    else if (pattern ? pattern.test(entry) : entry === name) found.push(full);
  }
  return found;
}

const lint = (message) =>
  spawnSync('pnpm', ['exec', 'commitlint'], { cwd: root, input: message, encoding: 'utf8' });
const web = (...p) => path('apps', 'web', ...p);
const api = (...p) => path('apps', 'api', ...p);
const shared = (...p) => path('packages', 'shared', ...p);
const compose = (...args) =>
  spawnSync('docker', ['compose', ...args], { cwd: root, encoding: 'utf8' });
const ignored = (file) =>
  spawnSync('git', ['check-ignore', '-q', file], { cwd: root }).status === 0;

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

describe('Step 4: packages/shared', () => {
  it('is a dual ESM/CJS package named @chat/shared', () => {
    const pkg = readJson('packages', 'shared', 'package.json');
    assert.equal(pkg.name, '@chat/shared');
    const entry = pkg.exports['.'];
    assert.equal(entry.import.default, './dist/index.mjs');
    assert.equal(entry.import.types, './dist/index.d.mts');
    assert.equal(entry.require.default, './dist/index.cjs');
    assert.equal(entry.require.types, './dist/index.d.cts');
    assert.ok(existsSync(shared('tsdown.config.ts')), 'tsdown.config.ts is missing');
  });

  it('is used by both apps through the workspace protocol', () => {
    for (const app of ['web', 'api']) {
      const pkg = readJson('apps', app, 'package.json');
      assert.equal(
        pkg.dependencies?.['@chat/shared'],
        'workspace:*',
        `${app} must depend on @chat/shared`,
      );
    }
  });

  it('is built before anything that consumes it (dev, typecheck, test)', () => {
    const { scripts } = readJson('package.json');
    for (const name of ['dev', 'typecheck', 'test']) {
      assert.match(
        scripts[name],
        /@chat\/shared build/,
        `root "${name}" must build @chat/shared first`,
      );
    }
  });

  it('builds ESM, CJS and both type declarations', () => {
    for (const file of ['index.mjs', 'index.cjs', 'index.d.mts', 'index.d.cts']) {
      assert.ok(
        existsSync(shared('dist', file)),
        `dist/${file} is missing (run: pnpm --filter @chat/shared build)`,
      );
    }
  });

  it('can be imported from the CommonJS api and the ESM web app', () => {
    const check = `s => { if (!s.LIMITS || !s.signUpSchema || !s.directKey) throw new Error('incomplete exports') }`;
    const cjs = spawnSync('node', ['-e', `(${check})(require('@chat/shared'))`], {
      cwd: path('apps', 'api'),
      encoding: 'utf8',
    });
    assert.equal(cjs.status, 0, `require() from apps/api failed:\n${cjs.stderr}`);
    const esm = spawnSync(
      'node',
      ['--input-type=module', '-e', `import('@chat/shared').then(${check})`],
      { cwd: path('apps', 'web'), encoding: 'utf8' },
    );
    assert.equal(esm.status, 0, `import() from apps/web failed:\n${esm.stderr}`);
  });
});

describe('Step 5: local infrastructure', () => {
  it('has a valid docker-compose.yml, with and without the "full" profile', () => {
    assert.ok(existsSync(path('docker-compose.yml')), 'docker-compose.yml is missing');
    for (const args of [
      ['config', '-q'],
      ['--profile', 'full', 'config', '-q'],
    ]) {
      const result = compose(...args);
      assert.equal(result.status, 0, `docker compose ${args.join(' ')} failed:\n${result.stderr}`);
    }
  });

  it('runs postgres and an S3-compatible store by default, the apps only in the "full" profile', () => {
    const services = JSON.parse(
      compose('--profile', 'full', 'config', '--format', 'json').stdout,
    ).services;
    assert.deepEqual(Object.keys(services).toSorted(), ['api', 'postgres', 's3', 'web']);
    assert.match(services.postgres.image, /^postgres:17/);
    assert.ok(services.postgres.healthcheck, 'postgres needs a healthcheck');
    assert.match(
      services.s3.image,
      /seaweedfs:\d/,
      'pin the seaweedfs version instead of using :latest',
    );
    assert.deepEqual(services.api.profiles, ['full']);
    assert.deepEqual(services.web.profiles, ['full']);
    assert.equal(services.postgres.profiles, undefined);
    assert.equal(services.s3.profiles, undefined);
  });

  it('keeps data in named volumes and lets host ports be overridden (5432/3000 are often taken)', () => {
    const text = read('docker-compose.yml');
    assert.match(text, /pgdata:/);
    assert.match(text, /s3data:/);
    for (const variable of ['POSTGRES_PORT', 'S3_PORT', 'WEB_PORT']) {
      assert.match(
        text,
        new RegExp(`\\$\\{${variable}:-\\d+\\}`),
        `${variable} must have a default`,
      );
    }
    assert.ok(existsSync(path('.env.example')), 'root .env.example (compose ports) is missing');
  });

  it('documents every api environment variable in apps/api/.env.example, without real secrets', () => {
    const text = read('apps', 'api', '.env.example');
    const keys = text
      .split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => line.split('=')[0]);
    for (const key of [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'JWT_SECRET',
      'JWT_EXPIRES_IN',
      'MESSAGE_KEYS',
      'MESSAGE_KEY_ID',
      'S3_BUCKET',
      'S3_REGION',
      'S3_ENDPOINT',
      'S3_PUBLIC_ENDPOINT',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]) {
      assert.ok(keys.includes(key), `${key} is missing from apps/api/.env.example`);
    }
    assert.match(
      text,
      /^MESSAGE_KEYS=$/m,
      'the encryption key must be generated by the developer, not committed',
    );
  });

  it('makes the local S3 enforce credentials like AWS does, using the dev keys from .env.example', () => {
    const s3 = JSON.parse(compose('config', '--format', 'json').stdout).services.s3;
    assert.match(String(s3.command), /-s3\.config=\/etc\/seaweedfs\/s3\.json/);
    assert.ok(
      s3.volumes.some((v) => v.target === '/etc/seaweedfs/s3.json' && v.read_only),
      'the identity file must be mounted read-only',
    );
    const { identities } = readJson('docker', 's3.json');
    const env = read('apps', 'api', '.env.example');
    const accessKey = env.match(/^S3_ACCESS_KEY_ID=(.+)$/m)?.[1];
    const secretKey = env.match(/^S3_SECRET_ACCESS_KEY=(.+)$/m)?.[1];
    assert.ok(
      identities.some((i) =>
        i.credentials.some((c) => c.accessKey === accessKey && c.secretKey === secretKey),
      ),
      'docker/s3.json must define the credentials that apps/api/.env.example uses',
    );
  });

  it('commits the .env.example files but ignores real .env files', () => {
    assert.equal(ignored('apps/api/.env'), true);
    assert.equal(ignored('.env'), true);
    assert.equal(ignored('apps/api/.env.example'), false);
    assert.equal(ignored('.env.example'), false);
  });

  it('exposes infra scripts at the root', () => {
    const { scripts } = readJson('package.json');
    assert.match(scripts['infra:up'], /docker compose up -d postgres s3/);
    assert.match(scripts['infra:down'], /docker compose down/);
  });
});

describe('Step 6: database schema', () => {
  it('keeps the Prisma schema with a committed migration history', () => {
    assert.ok(existsSync(api('prisma', 'schema.prisma')));
    assert.ok(existsSync(api('prisma.config.ts')));
    const migrations = readdirSync(api('prisma', 'migrations'));
    assert.ok(
      migrations.some((m) => m.endsWith('_init')),
      'the init migration is missing',
    );
    assert.ok(migrations.includes('migration_lock.toml'));
  });

  it('does not commit the generated Prisma client', () => {
    assert.equal(ignored('apps/api/src/generated/prisma/client.ts'), true);
  });

  it('documents every table in docs/database.md as a Mermaid ER diagram', () => {
    const doc = read('docs', 'database.md');
    assert.match(doc, /```mermaid\s+erDiagram/);
    const schema = readFileSync(api('prisma', 'schema.prisma'), 'utf8');
    const tables = [...schema.matchAll(/@@map\("(\w+)"\)/g)].map((m) => m[1]);
    assert.equal(tables.length, 6);
    for (const table of tables) {
      assert.match(doc, new RegExp(`\\b${table}\\b`), `docs/database.md does not mention ${table}`);
    }
  });
});

describe('Step 7: legacy Mongo api is gone', () => {
  it('no longer depends on Mongo, Passport, class-validator, bcrypt or uuid', () => {
    const deps = allDependencies(readJson('apps', 'api', 'package.json'));
    const banned =
      /^(mongoose|mongodb|@nestjs\/(mongoose|passport|config|mapped-types)|passport.*|class-validator|class-transformer|bcrypt|jsonwebtoken|uuid)$/;
    assert.deepEqual(
      deps.filter((d) => banned.test(d)),
      [],
    );
    for (const needed of [
      '@prisma/client',
      'bcryptjs',
      'helmet',
      '@nestjs/throttler',
      '@nestjs/event-emitter',
    ]) {
      assert.ok(deps.includes(needed), `${needed} should be installed`);
    }
  });

  it('documents in .env.example every variable that env.ts validates', () => {
    const schema = read('apps', 'api', 'src', 'config', 'env.ts');
    const validated = [...schema.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
    assert.ok(validated.length >= 10, 'could not find the variables in env.ts');
    const documented = read('apps', 'api', '.env.example')
      .split('\n')
      .map((line) => line.match(/^([A-Z][A-Z0-9_]+)=/)?.[1]);
    for (const name of validated) {
      assert.ok(
        documented.includes(name),
        `${name} is validated in env.ts but missing from apps/api/.env.example`,
      );
    }
  });

  it('exposes the integration tests and the seed from the root', () => {
    const { scripts } = readJson('package.json');
    assert.match(scripts['test:int'], /@chat\/api test:int/);
    assert.match(scripts['db:seed'], /@chat\/api db:seed/);
    assert.match(scripts['db:migrate'], /@chat\/api db:migrate/);
  });

  it('deleted the old source folders', () => {
    for (const dir of ['chat', 'image', 'user', 'pipes', 'guards', 'strategies']) {
      assert.ok(
        !existsSync(api('src', dir)),
        `apps/api/src/${dir} is legacy and should be deleted`,
      );
    }
  });

  it('compiles under the strict base config without the legacy relaxations', () => {
    const tsconfig = read('apps', 'api', 'tsconfig.json');
    for (const flag of [
      'strictNullChecks',
      'noImplicitAny',
      'strictBindCallApply',
      'noImplicitOverride',
    ]) {
      assert.ok(!tsconfig.includes(flag), `${flag} relaxation should be removed`);
    }
    assert.equal(readJsonc('apps', 'api', 'tsconfig.json').extends, '../../tsconfig.base.json');
  });

  it('has no lint overrides left for api code', () => {
    const overrides = JSON.stringify(readJsonc('.oxlintrc.json').overrides ?? []);
    assert.ok(!overrides.includes('apps/api'), 'delete the api paths from the legacy override');
  });
});

describe('API documentation', () => {
  /** every "METHOD /api/path" declared by a controller, found by reading the source */
  function routesInControllers() {
    const routes = [];
    for (const file of findFiles(api('src'), null, [], /\.controller\.ts$/)) {
      const source = readFileSync(file, 'utf8');
      const prefix = source.match(/@Controller\('([^']*)'\)/)?.[1] ?? '';
      for (const [, verb, subpath] of source.matchAll(
        /@(Get|Post|Patch|Put|Delete)\((?:'([^']*)')?\)/g,
      )) {
        const path = ['/api', prefix, subpath].filter(Boolean).join('/');
        routes.push(`${verb.toUpperCase()} ${path}`);
      }
    }
    return routes;
  }

  it('lists every REST route of the api in docs/api.md', () => {
    const routes = routesInControllers();
    assert.ok(routes.length >= 15, `expected to find the api routes, found ${routes.length}`);
    const doc = read('docs', 'api.md');
    for (const route of routes) {
      assert.ok(doc.includes(`\`${route}\``), `docs/api.md does not document \`${route}\``);
    }
  });
});

// Tests for Steps 16-19 of docs/IMPROVEMENT_PLAN.md: images, CI, CD and the README.
// Same rules as repo.test.mjs: Node built-ins only. YAML is checked as text, so no parser is needed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));
const workflows = () => readdirSync(path('.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f));
/** the text of one job of a workflow: from `  name:` up to the next job */
function job(file, name) {
  const text = read('.github', 'workflows', file);
  const match = text.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:\\n|(?![\\s\\S]))`, 'm'),
  );
  assert.ok(match, `${file} has no job "${name}"`);
  return match[1];
}
const rootScripts = () => Object.keys(readJson('package.json').scripts);

describe('Step 16: Dockerfiles', () => {
  it('keeps secrets, dependencies and build output out of the build context', () => {
    const lines = read('.dockerignore')
      .split('\n')
      .map((l) => l.trim());
    for (const entry of ['**/node_modules', '**/dist', '**/.env', '.git', 'apps/api/src/generated'])
      assert.ok(lines.includes(entry), `.dockerignore should list ${entry}`);
  });

  describe('api image', () => {
    const dockerfile = () => read('apps', 'api', 'Dockerfile');

    it('is a multi-stage build on Node 24 that ships only production dependencies', () => {
      const text = dockerfile();
      assert.equal(text.match(/^FROM /gm)?.length, 2, 'expected a build stage and a runtime stage');
      assert.match(text, /^FROM node:24-alpine AS build/m);
      assert.match(text, /pnpm install --frozen-lockfile/);
      assert.match(text, /pnpm --filter @chat\/api deploy --prod/);
      assert.match(text, /COPY --from=build/);
    });

    it('applies migrations on start and runs as a non-root user', () => {
      const text = dockerfile();
      assert.match(text, /prisma migrate deploy && node dist\/main\.js/);
      assert.match(text, /^USER node$/m);
      assert.match(text, /^EXPOSE 3000$/m);
      assert.match(text, /^ENV NODE_ENV=production$/m);
    });

    it('contains no secret: the only build-time variable is a dummy database url', () => {
      const text = dockerfile();
      assert.doesNotMatch(text, /JWT_SECRET|MESSAGE_KEYS|S3_SECRET_ACCESS_KEY|POSTGRES_PASSWORD/);
      assert.doesNotMatch(text, /COPY[^\n]*\.env/);
      assert.match(text, /ENV DATABASE_URL=postgresql:\/\/build:build@localhost/);
    });

    it('lets `pnpm deploy` copy the build, the migrations and the prisma config', () => {
      const { files } = readJson('apps', 'api', 'package.json');
      for (const entry of ['dist', 'prisma', 'prisma.config.ts'])
        assert.ok(files?.includes(entry), `apps/api/package.json "files" should include ${entry}`);
    });
  });

  describe('web image', () => {
    it('builds the app and serves it with Caddy', () => {
      const text = read('apps', 'web', 'Dockerfile');
      assert.match(text, /^FROM node:24-alpine AS build/m);
      // only the web app's own dependencies: installing the api too would run its Prisma postinstall
      assert.match(text, /pnpm install --frozen-lockfile --filter "@chat\/web\.\.\."/);
      assert.match(text, /pnpm --filter "@chat\/web\.\.\." build/);
      assert.match(text, /^FROM caddy:2-alpine/m);
      assert.match(text, /COPY apps\/web\/Caddyfile \/etc\/caddy\/Caddyfile/);
      assert.match(text, /COPY --from=build \/repo\/apps\/web\/dist \/srv/);
    });

    it('has a Caddyfile that proxies the api and the websocket, falls back to the SPA, and sets security headers', () => {
      const text = read('apps', 'web', 'Caddyfile');
      assert.match(text, /\{\$SITE_ADDRESS::80\}/);
      assert.match(text, /handle \/api\/\*\s*\{\s*reverse_proxy api:3000/);
      assert.match(text, /handle \/socket\.io\/\*\s*\{\s*reverse_proxy api:3000/);
      assert.match(text, /try_files \{path\} \/index\.html/);
      for (const header of [
        'Strict-Transport-Security',
        'X-Content-Type-Options nosniff',
        'X-Frame-Options DENY',
        'Referrer-Policy',
        'Content-Security-Policy',
      ])
        assert.ok(text.includes(header), `Caddyfile should set ${header}`);
      assert.match(text, /frame-ancestors 'none'/);
      assert.match(text, /default-src 'self'/);
    });
  });
});

describe('Step 16: the whole stack in compose', () => {
  it('starts the api only once S3 accepts connections (the api refuses to start without its bucket)', () => {
    const result = spawnSync(
      'docker',
      ['compose', '--profile', 'full', 'config', '--format', 'json'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const { services } = JSON.parse(result.stdout);
    assert.ok(services.s3.healthcheck, 's3 needs a healthcheck');
    assert.equal(services.api.depends_on.s3.condition, 'service_healthy');
    assert.equal(services.api.depends_on.postgres.condition, 'service_healthy');
  });
});

describe('Step 17: CI', () => {
  it('has the CI and PR-source workflows', () => {
    assert.ok(workflows().includes('ci.yml'));
    assert.ok(workflows().includes('pr-source.yml'));
  });

  it('runs on pull requests and on pushes to develop, and cancels superseded runs', () => {
    const text = read('.github', 'workflows', 'ci.yml');
    assert.match(text, /pull_request:\s*\n\s+branches: \[develop, main\]/);
    assert.match(text, /push:\s*\n\s+branches: \[develop\]/);
    assert.match(text, /cancel-in-progress: true/);
  });

  it('checks formatting, lint, build, types and tests with a frozen lockfile', () => {
    const checks = job('ci.yml', 'checks');
    for (const command of [
      'pnpm install --frozen-lockfile',
      'pnpm format:check',
      'pnpm lint',
      'pnpm build',
      'pnpm typecheck',
      'pnpm test',
    ])
      assert.ok(checks.includes(`- run: ${command}`), `checks should run ${command}`);
    assert.match(checks, /node-version-file: \.nvmrc/);
    assert.match(checks, /cache: pnpm/);
  });

  it('runs the api integration tests with coverage against Postgres and S3 from docker compose', () => {
    const integration = job('ci.yml', 'api-integration');
    assert.match(integration, /docker compose up -d --wait postgres s3/);
    assert.match(integration, /- run: pnpm test:cov/);
    assert.match(integration, /DATABASE_URL: postgresql:\/\/chat:chat@localhost:5432\/chat/);
  });

  it('lints every commit of a pull request, over the whole range', () => {
    const commits = job('ci.yml', 'commits');
    assert.match(commits, /if: github\.event_name == 'pull_request'/);
    assert.match(commits, /fetch-depth: 0/);
    assert.match(commits, /pnpm commitlint/);
    assert.match(commits, /--from \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
    assert.match(commits, /--to \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  });

  it('builds both images, but only after the checks pass', () => {
    const docker = job('ci.yml', 'docker');
    assert.match(docker, /needs: \[checks, api-integration\]/);
    assert.match(docker, /docker build -f apps\/api\/Dockerfile/);
    assert.match(docker, /docker build -f apps\/web\/Dockerfile/);
  });

  it('only lets develop be merged into main', () => {
    const text = read('.github', 'workflows', 'pr-source.yml');
    assert.match(text, /pull_request:\s*\n\s+branches: \[main\]/);
    assert.match(text, /from-develop:/);
    assert.match(text, /github\.head_ref != 'develop'/);
    assert.match(text, /exit 1/);
  });

  it('follows basic workflow hygiene: pinned actions, least privilege, no pull_request_target', () => {
    for (const file of workflows()) {
      const text = read('.github', 'workflows', file);
      assert.match(text, /^permissions:/m, `${file} should declare its permissions`);
      assert.doesNotMatch(text, /pull_request_target/, `${file} must not use pull_request_target`);
      for (const [, action] of text.matchAll(/uses:\s*(\S+)/g))
        assert.match(action, /@v\d+$/, `${file}: "${action}" should be pinned to a major version`);
    }
  });
});

describe('Step 18: CD to AWS', () => {
  const secretNames = ['JWT_SECRET', 'MESSAGE_KEYS', 'POSTGRES_PASSWORD', 'DATABASE_URL'];

  describe('production compose', () => {
    const text = () => read('deploy', 'docker-compose.prod.yml');

    it('is valid compose', () => {
      const dir = mkdtempSync(join(tmpdir(), 'chat-prod-'));
      cpSync(path('deploy', 'docker-compose.prod.yml'), join(dir, 'docker-compose.prod.yml'));
      cpSync(path('deploy', 'env.example'), join(dir, '.env'));
      writeFileSync(join(dir, '.env.secrets'), secretNames.map((n) => `${n}=x`).join('\n'));
      const result = spawnSync(
        'docker',
        [
          'compose',
          '--env-file',
          '.env',
          '--env-file',
          '.env.secrets',
          '-f',
          'docker-compose.prod.yml',
          'config',
          '--format',
          'json',
        ],
        { cwd: dir, encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
      const { services } = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(services).toSorted(), ['api', 'postgres', 'web']);
      assert.deepEqual(
        services.web.ports.map((p) => Number(p.published)).toSorted((a, b) => a - b),
        [80, 443],
      );
      assert.equal(services.api.ports, undefined, 'only Caddy faces the internet');
      assert.equal(services.postgres.ports, undefined, 'the database is not published');
    });

    it('pulls the images from ECR and restarts them automatically', () => {
      assert.match(text(), /image: \$\{ECR_REGISTRY\}\/chat-app-api:\$\{IMAGE_TAG:-latest\}/);
      assert.match(text(), /image: \$\{ECR_REGISTRY\}\/chat-app-web:\$\{IMAGE_TAG:-latest\}/);
      assert.equal(text().match(/restart: unless-stopped/g)?.length, 3);
    });

    it('holds no secret value itself', () => {
      assert.match(text(), /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD\}/);
      assert.doesNotMatch(text(), /JWT_SECRET|MESSAGE_KEYS/);
    });
  });

  it('documents every non-secret setting, and the api actually reads each of them', () => {
    const keys = read('deploy', 'env.example')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => l.split('=')[0]);
    const apiEnv = read('apps', 'api', 'src', 'config', 'env.ts');
    const deployOnly = ['ECR_REGISTRY', 'SITE_ADDRESS'];
    for (const key of [
      'ECR_REGISTRY',
      'SITE_ADDRESS',
      'NODE_ENV',
      'MESSAGE_KEY_ID',
      'S3_BUCKET',
      'S3_REGION',
    ])
      assert.ok(keys.includes(key), `deploy/env.example should define ${key}`);
    for (const key of keys.filter((k) => !deployOnly.includes(k)))
      assert.ok(apiEnv.includes(key), `${key} is not read by apps/api/src/config/env.ts`);
    assert.ok(
      !keys.some((k) => /ACCESS_KEY|SECRET|PASSWORD|S3_ENDPOINT/.test(k)),
      'no keys and no custom S3 endpoint in production: the instance role and AWS are used',
    );
  });

  it('has a deploy script that takes secrets from SSM and never stores them in an image', () => {
    const text = read('deploy', 'deploy.sh');
    assert.match(text, /^set -eu$/m);
    assert.match(text, /umask 077/);
    assert.match(
      text,
      /aws ssm get-parameters-by-path --path \/chat-app\/prod\/ --with-decryption/,
    );
    assert.match(text, /> \.env\.secrets/);
    assert.match(text, /aws ecr get-login-password/);
    assert.match(text, /\$COMPOSE pull/);
    assert.match(text, /\$COMPOSE up -d/);
    assert.equal(
      spawnSync('sh', ['-n', path('deploy', 'deploy.sh')]).status,
      0,
      'deploy.sh has a syntax error',
    );
  });

  describe('running deploy.sh with a fake aws and a fake docker', () => {
    /** a sandbox: an app dir, and `aws` and `docker` commands that record their arguments */
    function sandbox({ ssm }) {
      const dir = mkdtempSync(join(tmpdir(), 'chat-deploy-'));
      const bin = join(dir, 'bin');
      const app = join(dir, 'app');
      mkdirSync(bin);
      mkdirSync(app);
      writeFileSync(
        join(app, '.env'),
        'ECR_REGISTRY=123.dkr.ecr.eu-west-1.amazonaws.com\nS3_REGION=eu-west-1\n',
      );
      writeFileSync(
        join(bin, 'aws'),
        `#!/bin/sh
echo "aws $*" >> "${dir}/calls"
case "$1 $2" in
  "ssm get-parameters-by-path") printf '%b' '${ssm}' ;;
  "ecr get-login-password") echo fake-password ;;
esac
`,
      );
      writeFileSync(join(bin, 'docker'), `#!/bin/sh\necho "docker $*" >> "${dir}/calls"\n`);
      chmodSync(join(bin, 'aws'), 0o755);
      chmodSync(join(bin, 'docker'), 0o755);
      const run = () =>
        spawnSync('sh', [path('deploy', 'deploy.sh'), 'abc123'], {
          encoding: 'utf8',
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, APP_DIR: app },
        });
      const calls = () => (existsSync(join(dir, 'calls')) ? read_(join(dir, 'calls')) : '');
      return { app, run, calls };
    }
    const read_ = (file) => readFileSync(file, 'utf8');
    const param = (name, value) => `/chat-app/prod/${name}\\t${value}\\n`;
    const all = [
      param('JWT_SECRET', 'jwt+secret/with=base64'),
      param('MESSAGE_KEYS', '1:a2V5'),
      param('POSTGRES_PASSWORD', 'pw'),
      param('DATABASE_URL', 'postgresql://chat:pw@postgres:5432/chat'),
    ].join('');

    it('turns the SSM parameters into a private .env.secrets, then pulls and starts the new tag', () => {
      const { app, run, calls } = sandbox({ ssm: all });
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      const secrets = read_(join(app, '.env.secrets'));
      assert.match(secrets, /^JWT_SECRET=jwt\+secret\/with=base64$/m);
      assert.match(secrets, /^DATABASE_URL=postgresql:\/\/chat:pw@postgres:5432\/chat$/m);
      assert.equal(
        statSync(join(app, '.env.secrets')).mode & 0o077,
        0,
        'readable by its owner only',
      );
      assert.match(
        calls(),
        /aws ssm get-parameters-by-path --path \/chat-app\/prod\/ --with-decryption --region eu-west-1/,
      );
      assert.match(
        calls(),
        /docker login --username AWS --password-stdin 123\.dkr\.ecr\.eu-west-1\.amazonaws\.com/,
      );
      assert.match(
        calls(),
        /docker compose --env-file \.env --env-file \.env\.secrets -f docker-compose\.prod\.yml pull/,
      );
      assert.match(calls(), /docker compose [^\n]*up -d/);
    });

    it('stops before touching the running containers when a secret is missing', () => {
      const { run, calls } = sandbox({ ssm: all.replace(param('MESSAGE_KEYS', '1:a2V5'), '') });
      const result = run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /missing secret MESSAGE_KEYS/);
      assert.doesNotMatch(calls(), /up -d/);
    });
  });

  describe('CD workflow', () => {
    const text = () => read('.github', 'workflows', 'cd.yml');

    it('deploys main, and can be run by hand for a rollback', () => {
      assert.match(text(), /push:\s*\n\s+branches: \[main\]/);
      assert.match(text(), /workflow_dispatch:/);
      assert.match(text(), /concurrency: deploy-production/);
      assert.match(text(), /environment: production/);
    });

    it('authenticates to AWS with OIDC, never with stored keys', () => {
      assert.match(text(), /id-token: write/);
      assert.match(text(), /role-to-assume: \$\{\{ secrets\.AWS_DEPLOY_ROLE_ARN \}\}/);
      assert.doesNotMatch(text(), /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
    });

    it('pushes both images tagged with the commit and deploys over SSM, with no SSH', () => {
      assert.match(text(), /amazon-ecr-login/);
      assert.match(text(), /TAG: \$\{\{ github\.sha \}\}/);
      assert.match(text(), /for app in api web/);
      assert.match(text(), /aws ssm send-command/);
      assert.match(text(), /sh \/opt\/chat-app\/deploy\.sh \$\{\{ github\.sha \}\}/);
      assert.match(text(), /aws ssm wait command-executed/);
      assert.doesNotMatch(text(), /\bssh\b/);
    });
  });

  it('explains the one-time AWS setup in docs/deployment.md', () => {
    assert.ok(existsSync(path('docs', 'deployment.md')), 'docs/deployment.md is missing');
    const doc = read('docs', 'deployment.md');
    for (const topic of [
      'ECR',
      'S3',
      'IAM',
      'EC2',
      'Parameter Store',
      'OIDC',
      'hop limit',
      'MESSAGE_KEYS',
      'rollback',
    ])
      assert.ok(doc.includes(topic), `docs/deployment.md does not mention ${topic}`);
    for (const name of secretNames)
      assert.ok(doc.includes(name), `docs/deployment.md does not mention the secret ${name}`);
  });
});

describe('Step 19: README and diagrams', () => {
  const readme = () => read('README.md');
  const mermaidBlocks = () => [...readme().matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);

  it('has every section the plan asks for', () => {
    const headings = [...readme().matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    for (const wanted of [
      'About',
      'Features',
      'Tech stack',
      'Architecture',
      'How it works',
      'Repository structure',
      'Getting started',
      'Scripts',
      'Testing, linting and formatting',
      'Security',
      'Realtime',
      'Contributing',
      'Deployment',
    ])
      assert.ok(headings.includes(wanted), `README has no "## ${wanted}" section`);
  });

  it('shows its diagrams as Mermaid, which GitHub renders: architecture, user flow, sending, reading and uploading, CI/CD', () => {
    const blocks = mermaidBlocks();
    assert.ok(blocks.length >= 5, `expected at least 5 diagrams, found ${blocks.length}`);
    for (const block of blocks)
      assert.match(
        block.trim(),
        /^(flowchart|graph|sequenceDiagram|stateDiagram-v2|erDiagram|journey)\b/,
        'every diagram must start with a diagram type',
      );
    for (const word of [
      'Caddy',
      'PostgreSQL',
      'S3',
      'chat:read',
      'message:send',
      'ECR',
      'Pull request',
    ])
      assert.ok(
        blocks.some((b) => b.includes(word)),
        `no diagram mentions ${word}`,
      );
  });

  it('keeps the full sequence diagram as Mermaid in docs/sequence-diagram.md', () => {
    const text = read('docs', 'sequence-diagram.md');
    const diagram = text.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? '';
    assert.match(diagram.trim(), /^sequenceDiagram/);
    for (const word of ['Web', 'API', 'PostgreSQL', 'S3', 'Socket.IO', 'message:send', 'chat:read'])
      assert.ok(diagram.includes(word), `the sequence diagram does not mention ${word}`);
    assert.doesNotMatch(text, /Mongo/i, 'the old Mongo-based diagram must be replaced');
    assert.ok(!existsSync(path('docs', 'sequence-diagram.puml')), 'the .puml is replaced');
  });

  it('documents every root script, and every command it shows exists', () => {
    for (const script of rootScripts().filter((s) => s !== 'prepare'))
      assert.ok(readme().includes(`pnpm ${script}`), `README does not list \`pnpm ${script}\``);
    for (const [, script] of readme().matchAll(
      /^\s*pnpm ((?:test|dev|build|lint|format|infra|db|typecheck)[\w:-]*)/gm,
    ))
      assert.ok(
        rootScripts().includes(script),
        `README shows \`pnpm ${script}\`, which is not a root script`,
      );
  });

  it('links only to files that exist', () => {
    for (const [, target] of readme().matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g))
      assert.ok(existsSync(path(target)), `README links to ${target}, which does not exist`);
  });

  it('tells the truth about the limits of the encryption', () => {
    assert.match(readme(), /server can read/i);
    assert.match(readme(), /end-to-end/i);
  });
});

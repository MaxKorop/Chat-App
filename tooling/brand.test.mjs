// Step 20 of docs/MODERNIZATION_PLAN.md: the app's identity (icon, manifest) and its theme plumbing.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = (...p) => join(root, 'apps', 'web', ...p);
const publicFile = (name) => web('public', name);
const html = () => readFileSync(web('index.html'), 'utf8');

/** the HSL hue (0-360) of "#rrggbb" */
function hueOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return Math.round((hue * 60 + 360) % 360);
}

/** width and height from a PNG's IHDR chunk */
function pngSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${file} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('Step 20: favicon and app icons', () => {
  it('has a vector favicon', () => {
    const svg = readFileSync(publicFile('favicon.svg'), 'utf8');
    assert.match(svg, /<svg[^>]+viewBox=/);
    assert.doesNotMatch(svg, /<script|onload=/i, 'an icon must not contain script');
  });

  it('is teal, in the same calm range as the app: not blue, purple, red or magenta', () => {
    const svg = readFileSync(publicFile('favicon.svg'), 'utf8');
    const stops = [...svg.matchAll(/stop-color="(#[0-9a-f]{6})"/gi)].map((m) => m[1]);
    assert.equal(stops.length, 2, 'expected a two-colour gradient');
    for (const colour of [
      ...stops,
      ...[...svg.matchAll(/<g fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1]),
    ]) {
      const hue = hueOf(colour);
      assert.ok(hue >= 165 && hue <= 215, `${colour} has hue ${hue}, which is not teal`);
    }
  });

  it('has the PNG icons at the sizes browsers and phones ask for', () => {
    assert.deepEqual(pngSize(publicFile('apple-touch-icon.png')), [180, 180]);
    assert.deepEqual(pngSize(publicFile('icon-192.png')), [192, 192]);
    assert.deepEqual(pngSize(publicFile('icon-512.png')), [512, 512]);
  });

  it('has a favicon.ico for old browsers and tools that request /favicon.ico', () => {
    const ico = readFileSync(publicFile('favicon.ico'));
    assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], 'not an ICO file');
    assert.ok(ico.readUInt16LE(4) >= 1, 'the ICO holds no image');
  });

  it('has a manifest whose icons exist, so "Add to home screen" shows the app icon', () => {
    const manifest = JSON.parse(readFileSync(publicFile('manifest.webmanifest'), 'utf8'));
    assert.ok(manifest.name && manifest.short_name);
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    for (const key of ['theme_color', 'background_color'])
      assert.match(manifest[key], /^#[0-9a-f]{6}$/i);
    const sizes = manifest.icons.map((icon) => icon.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
    for (const icon of manifest.icons) {
      assert.ok(existsSync(publicFile(icon.src.replace(/^\//, ''))), `${icon.src} is missing`);
      assert.equal(icon.type, icon.src.endsWith('.png') ? 'image/png' : 'image/svg+xml');
    }
  });

  it('is announced in index.html', () => {
    const text = html();
    assert.match(text, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
    assert.match(text, /<link rel="icon" href="\/favicon\.ico" sizes="32x32"/);
    assert.match(text, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
    assert.match(text, /<link rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(text, /<meta name="theme-color" content="#[0-9a-f]{6}"/i);
  });
});

describe('Step 20: light and dark theme', () => {
  it('no longer forces the dark theme in the markup', () => {
    assert.doesNotMatch(html(), /<html[^>]*class="dark"/);
  });

  it('sets the theme before the app starts, with a file the Content-Security-Policy allows', () => {
    const text = html();
    const init = text.indexOf('<script src="/theme-init.js"></script>');
    assert.ok(
      init > -1,
      'index.html must load /theme-init.js synchronously (no defer, async or module)',
    );
    assert.ok(
      init < text.indexOf('type="module"'),
      'the theme script must run before the app script',
    );
    assert.doesNotMatch(text, /<script(?![^>]*\ssrc=)/, 'no inline scripts: the CSP forbids them');
  });

  it('does not depend on next-themes any more (it injects an inline script)', () => {
    const pkg = JSON.parse(readFileSync(web('package.json'), 'utf8'));
    assert.ok(!('next-themes' in { ...pkg.dependencies, ...pkg.devDependencies }));
  });

  it('keeps the production CSP free of inline script permission', () => {
    const caddyfile = readFileSync(web('Caddyfile'), 'utf8');
    assert.doesNotMatch(caddyfile, /script-src[^;"]*unsafe-inline/);
    assert.match(caddyfile, /default-src 'self'/);
  });
});

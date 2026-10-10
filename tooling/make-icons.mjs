// Renders apps/web/public/favicon.svg into the PNG and ICO icons, with headless Chrome.
// Run it after changing the logo, and commit the results:  node tooling/make-icons.mjs
// (CHROME_PATH overrides the browser; it defaults to Google Chrome on macOS.)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');
const chromePath =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--remote-debugging-port=9334',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'icons-'))}`,
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  let targets;
  for (let i = 0; i < 40 && !targets?.length; i++) {
    targets = await fetch('http://127.0.0.1:9334/json').then(
      (r) => r.json(),
      () => undefined,
    );
    await wait(250);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (message) => {
    const data = JSON.parse(message.data);
    waiting.get(data.id)?.(data);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      waiting.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  /** a square PNG with a transparent background */
  async function render(size) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: size,
      height: size,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 },
    });
    const page = `<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body>`;
    await send('Page.navigate', {
      url: `data:text/html;base64,${Buffer.from(page).toString('base64')}`,
    });
    await wait(300);
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    return Buffer.from(shot.result.data, 'base64');
  }

  for (const [file, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ]) {
    writeFileSync(join(publicDir, file), await render(size));
  }

  // An ICO can hold a PNG as it is: a 6-byte header, one 16-byte entry, then the image.
  const png32 = await render(32);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header[6] = 32; // width
  header[7] = 32; // height
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png32.length, 14);
  header.writeUInt32LE(22, 18); // where the image starts
  writeFileSync(join(publicDir, 'favicon.ico'), Buffer.concat([header, png32]));
  ws.close();
  process.stdout.write('icons written to apps/web/public\n');
} finally {
  chrome.kill();
}

// Leonida Legend — screenshot and verification harness.
//
// Serves app/ over a local HTTP port, drives the VM's Chromium over CDP
// (built-in WebSocket, no dependencies), and:
//   --verify   loads the app fresh, reports console errors, counts the trophy
//              cards and clicks a counter button to prove it works;
//   (default)  captures the four screenshots described by shots.json into
//              screenshots/, re-shooting at lower JPEG quality whenever a
//              capture would pass the 256 KiB gate cap.
//
// Usage: node capture-screenshots.mjs [--verify]

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const appDir = join(repoRoot, 'app');
const shotsDir = join(repoRoot, 'screenshots');
const PORT = 8931;
const DEBUG_PORT = 9231;
const MAX_SHOT_BYTES = 262_144;
const STORAGE_KEY = 'leonida-legend-progress-v1';

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

function serveApp() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = join(appDir, rel);
    if (!file.startsWith(appDir) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function chromePath() {
  const candidates = ['/opt/meta-chromium/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error('no Chromium binary found');
}

async function launchChrome() {
  const proc = spawn(chromePath(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
    '--hide-scrollbars', '--window-size=1280,800',
    // This VM's Chromium refuses to start without its WebGL domain policy, and
    // its local-network checks would otherwise block the app's own origin.
    '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt',
    '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6',
    '--disable-features=LocalNetworkAccessChecks',
    `--ip-address-space-overrides=127.0.0.1:${PORT}=public`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--user-data-dir=/tmp/leonida-legend-shots-profile',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return { proc, wsUrl: page.webSocketDebuggerUrl };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error('Chromium debugging port never came up');
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('exception: ' + (msg.params.exceptionDetails.text || 'unknown'));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push('console: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push('log: ' + msg.params.entry.text);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  async function send(method, params = {}) {
    await ready;
    const id = ++nextId;
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }
  return { send, consoleErrors, close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error('page evaluation failed: ' + result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(cdp, expression, label, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, expression)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('timed out waiting for ' + label);
}

async function openSeeded(cdp, seed, hash) {
  const base = `http://127.0.0.1:${PORT}/`;
  await cdp.send('Page.navigate', { url: base });
  await waitFor(cdp, 'document.querySelectorAll(".card").length === 55', 'first render of 55 cards');
  await evaluate(cdp, `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(seed))})`);
  // A query change forces a full reload (a bare hash change would not re-run the
  // app's boot), so the seeded localStorage is what the fresh page reads.
  await cdp.send('Page.navigate', { url: `${base}?seeded=${Date.now()}${hash || ''}` });
  await waitFor(cdp, 'document.querySelectorAll(".card").length === 55 || document.querySelectorAll(".phase").length === 6', 'seeded render');
  await new Promise((r) => setTimeout(r, 600));
}

async function verify(cdp) {
  const base = `http://127.0.0.1:${PORT}/`;
  await cdp.send('Page.navigate', { url: base });
  await waitFor(cdp, 'document.querySelectorAll(".card").length > 0', 'cards');
  const cardCount = await evaluate(cdp, 'document.querySelectorAll(".card").length');
  const before = await evaluate(cdp, 'document.querySelector(\'[data-counter="17"] output\').textContent');
  await evaluate(cdp, 'document.querySelector(\'[data-counter="17"] [data-step="1"]\').click()');
  await new Promise((r) => setTimeout(r, 300));
  const after = await evaluate(cdp, 'document.querySelector(\'[data-counter="17"] output\').textContent');
  const stored = await evaluate(cdp, `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).counts["17"]`);
  console.log(`verify: cards=${cardCount} counter "${before.trim()}" -> "${after.trim()}" storedCount=${stored}`);
  console.log(`verify: console errors: ${cdp.consoleErrors.length ? cdp.consoleErrors.join(' | ') : 'none'}`);
  if (cardCount !== 55) throw new Error('expected 55 cards');
  if (stored !== 1) throw new Error('counter click did not persist a count of 1');
  if (cdp.consoleErrors.length) throw new Error('console errors present');
}

async function shoot(cdp, shot) {
  await openSeeded(cdp, shot.seed, shot.path.replace(/^\//, ''));
  if (shot.focus) {
    await evaluate(cdp, `document.getElementById(${JSON.stringify(shot.focus)})?.scrollIntoView({ block: 'center' })`);
    await new Promise((r) => setTimeout(r, 400));
  }
  let quality = 84;
  for (;;) {
    const shot1 = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
    const bytes = Buffer.from(shot1.data, 'base64');
    if (bytes.length <= MAX_SHOT_BYTES || quality <= 50) {
      writeFileSync(join(shotsDir, shot.file), bytes);
      console.log(`shot ${shot.file}: ${bytes.length} bytes at quality ${quality}`);
      return;
    }
    quality -= 10;
  }
}

async function main() {
  const server = await serveApp();
  const { proc, wsUrl } = await launchChrome();
  const cdp = connectCdp(wsUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    if (process.argv.includes('--verify')) {
      await verify(cdp);
    } else {
      const shots = JSON.parse(readFileSync(join(repoRoot, 'shots.json'), 'utf8'));
      for (const shot of shots) await shoot(cdp, shot);
      for (const shot of shots) {
        const size = statSync(join(shotsDir, shot.file)).size;
        if (size > MAX_SHOT_BYTES) throw new Error(`${shot.file} is ${size} bytes, over the cap`);
      }
      console.log('screenshots done');
    }
  } finally {
    cdp.close();
    proc.kill();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

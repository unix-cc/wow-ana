/**
 * SSR smoke test (automated replacement for the manual Phase P checklist).
 *
 * Boots the built web backend (`apps/web/dist/index.js`) from the repo root
 * against a THROWAWAY SQLite database and a free port, then asserts the six
 * behaviors that regression-bit us before:
 *
 *  1. GET / serves HTML that references the hashed Vite bundle (i.e. the
 *     front end really is `web-ui/dist`, not the legacy public/ fallback);
 *  2. GET /api/sessions answers 200 JSON with a sessions array;
 *  3. SPA fallback: a client-side route without a file extension replays
 *     index.html with 200;
 *  4. the hashed asset itself is served with the correct JS MIME type;
 *  5. POST /api/chat with an unconfigured LLM returns 400 with the guidance
 *     message (no empty reply — the Phase Q pipeline fix);
 *  6. POST /api/chat with an invalid JSON body returns 400, not a hang.
 *
 * Usage:
 *   node scripts/ssr-smoke.mjs            # build web-ui + web first (default)
 *   node scripts/ssr-smoke.mjs --no-build # reuse existing dist artifacts
 *
 * Exits non-zero when any check fails. The real wcl-cache.db is never
 * touched: DATABASE_URL points at a temp directory.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const NO_BUILD = process.argv.includes('--no-build');

/** @param {string} label @param {() => Promise<void>} check */
async function runCheck(label, check) {
  try {
    await check();
    console.log(`PASS  ${label}`);
    return true;
  } catch (error) {
    console.log(`FAIL  ${label}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {string} port @param {string} path @param {RequestInit} [init] */
async function fetchOk(port, path, init) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  return res;
}

/** Find a free TCP port by binding to 0 and releasing it. */
async function findFreePort() {
  const net = await import('node:net');
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

function run(command, args) {
  return new Promise((res, rej) => {
    const proc = spawn(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    proc.once('exit', (code) => (code === 0 ? res() : rej(new Error(`${command} ${args.join(' ')} exited ${code}`))));
    proc.once('error', rej);
  });
}

async function waitForServer(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server did not become ready on port ${port} within ${timeoutMs}ms`);
}

async function main() {
  if (!NO_BUILD) {
    console.log('building web-ui + web dist ...');
    await run('pnpm', ['--filter', '@wcl/web-ui', 'build']);
    await run('pnpm', ['--filter', '@wcl/web', 'build']);
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'wcl-ssr-smoke-'));
  const port = await findFreePort();
  const child = spawn(
    process.execPath,
    [join('apps', 'web', 'dist', 'index.js')],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        // Absolute temp path keeps the real repo cache untouched.
        DATABASE_URL: join(tempDir, 'smoke.db'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let serverLog = '';
  child.stdout.on('data', (d) => (serverLog += d.toString()));
  child.stderr.on('data', (d) => (serverLog += d.toString()));

  let failed = 0;
  try {
    try {
      await waitForServer(port);
    } catch (error) {
      console.log('FAIL  server startup:', error instanceof Error ? error.message : error);
      console.log('--- server log ---\n' + serverLog);
      process.exitCode = 1;
      return;
    }

    let indexHtml;
    const results = [];

    results.push(
      await runCheck('GET / serves the built SPA (hashed bundle referenced)', async () => {
        const res = await fetchOk(port, '/');
        assert(res.status === 200, `status ${res.status}`);
        const contentType = res.headers.get('content-type') ?? '';
        assert(contentType.includes('text/html'), `content-type ${contentType}`);
        indexHtml = await res.text();
        assert(
          /assets\/[\w.-]+\.js/.test(indexHtml),
          'index.html does not reference a hashed Vite bundle (legacy public/ fallback?)',
        );
      }),
    );

    results.push(
      await runCheck('GET /api/sessions answers 200 JSON with sessions array', async () => {
        const res = await fetchOk(port, '/api/sessions');
        assert(res.status === 200, `status ${res.status}`);
        const body = await res.json();
        assert(Array.isArray(body.sessions), 'body.sessions is not an array');
      }),
    );

    results.push(
      await runCheck('SPA fallback replays index.html for client-side routes', async () => {
        const res = await fetchOk(port, '/reports/fXdMjWKJbpna6yHv/fight/13');
        assert(res.status === 200, `status ${res.status}`);
        const html = await res.text();
        assert(html === indexHtml, 'fallback body differs from index.html');
      }),
    );

    results.push(
      await runCheck('hashed asset served with the JS MIME type', async () => {
        const match = /(?:src|href)="(\/assets\/[\w.-]+\.js)"/.exec(indexHtml ?? '');
        assert(match, 'no hashed JS asset path found in index.html');
        const res = await fetchOk(port, match[1]);
        assert(res.status === 200, `status ${res.status}`);
        const contentType = res.headers.get('content-type') ?? '';
        assert(contentType.includes('javascript'), `content-type ${contentType}`);
      }),
    );

    results.push(
      await runCheck('POST /api/chat with unconfigured LLM returns 400 guidance', async () => {
        const res = await fetchOk(port, '/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'smoke',
            message: 'hello',
            llm: { baseUrl: '', apiKey: '', model: '' },
          }),
        });
        assert(res.status === 400, `status ${res.status}`);
        const body = await res.json();
        assert(
          (body.error ?? '').includes('LLM Base URL'),
          `unexpected error body: ${JSON.stringify(body)}`,
        );
      }),
    );

    results.push(
      await runCheck('POST /api/chat with invalid JSON returns 400, not a hang', async () => {
        const res = await fetchOk(port, '/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not-json{{',
        });
        assert(res.status === 400, `status ${res.status}`);
        const body = await res.json();
        assert('error' in body, `no error field: ${JSON.stringify(body)}`);
      }),
    );

    failed = results.filter((ok) => !ok).length;
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(failed === 0 ? '\nSSR smoke: all checks passed.' : `\nSSR smoke: ${failed} check(s) failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('SSR smoke crashed:', error);
  process.exitCode = 1;
});

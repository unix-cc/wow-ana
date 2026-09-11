/**
 * Render the **real** assistant message (activity + artifact + comparison card)
 * to a standalone HTML file, using the real components, the real stylesheet and
 * the real analysed payload.
 *
 * Why this exists: the local Chromium/CDP channel is unreliable on this machine
 * (daemon drops to `about:blank` mid-session), so a live screenshot of the app
 * cannot be trusted. This renders the actual React components with
 * `renderToStaticMarkup` + `design.css` and the payload fetched from the
 * running server's session API — a faithful substitute for a screenshot, not a
 * mockup. It is a debugging aid, not a product surface.
 *
 * Usage: node scripts/preview-conversation.mjs <sessionId> [outFile]
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('usage: node scripts/preview-conversation.mjs <sessionId> [outFile]');
  process.exit(1);
}
const outFile = process.argv[3] ?? resolve(root, '.workbuddy/preview/conversation.html');

const bundleDir = resolve(root, '.workbuddy/preview');
await mkdir(bundleDir, { recursive: true });

// 1. Bundle the real components (+ React) for Node. esbuild ships with Vite.
//    The entry has to live *inside* apps/web-ui so esbuild resolves `react`
//    from that package's node_modules, and imports stay relative.
const webUiDir = resolve(root, 'apps/web-ui');
const entry = resolve(webUiDir, '.preview-entry.tsx');
await writeFile(
  entry,
  `
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ActivityPanel } from './src/components/ActivityPanel';
import { ArtifactView } from './src/components/ArtifactView';
import { CompareCard } from './src/components/CompareCard';

export function renderMessage(message) {
  const children = [];
  if (message.activity?.length) {
    children.push(h(ActivityPanel, { key: 'a', steps: message.activity }));
  }
  if (message.artifact) {
    children.push(h(ArtifactView, { key: 'b', artifact: message.artifact, onOpenFinding: () => {}, onCompare: () => {} }));
  }
  if (message.comparison) {
    children.push(h(CompareCard, { key: 'c', comparison: message.comparison }));
  }
  if (message.content) {
    children.push(h('div', { key: 'd', className: 'msg-body' }, message.content));
  }
  return renderToStaticMarkup(h('div', { className: 'message assistant' }, children));
}
`,
  'utf8',
);

const esbuild = resolve(
  root,
  'node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild',
);
// Bundled *into* apps/web-ui so Node resolves the externalised React packages
// from that package's node_modules. React itself stays external: bundling the
// CJS build into an ESM output trips over `require('util')`.
const bundle = resolve(webUiDir, '.preview-bundle.mjs');
const { spawnSync } = await import('node:child_process');
const build = spawnSync(
  process.execPath,
  [
    esbuild,
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--jsx=automatic',
    '--external:react',
    '--external:react-dom',
    '--external:react-dom/server',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
if (build.status !== 0) {
  console.error('esbuild failed');
  process.exit(1);
}

// 2. Pull the real conversation from the running server.
const response = await fetch(`${BASE}/api/sessions/${encodeURIComponent(sessionId)}`);
if (!response.ok) {
  console.error(`session fetch failed: HTTP ${response.status}`);
  process.exit(1);
}
const { messages } = await response.json();
const withCards = messages.filter((m) => m.comparison ?? m.artifact);
if (withCards.length === 0) {
  console.error('session has no artifact/comparison message to render');
  process.exit(1);
}

const { renderMessage } = await import(pathToFileURL(bundle).href);

// 3. Compose the page: real CSS + the real rendered message markup.
const css = await readFile(resolve(root, 'apps/web-ui/src/design.css'), 'utf8');
const cards = withCards.map((m, i) => renderMessage(m)).join('\n');
const userTurns = messages
  .filter((m) => m.role === 'user')
  .map((m) => `<div class="message user">${escapeHtml(m.content)}</div>`)
  .join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>会话渲染预览 · ${escapeHtml(sessionId)}</title>
<style>
${css}
body { margin: 0; padding: 24px; background: var(--bg); color: var(--text); font-family: var(--font-sans, system-ui, sans-serif); }
.preview-note { max-width: 760px; margin: 0 auto 18px; padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel-2); color: var(--muted); font-size: 12.5px; line-height: 1.7; }
.preview-note b { color: var(--text-strong); }
.preview-chat { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
</style>
</head>
<body>
<div class="preview-note">
  <b>这是真实组件 + 真实样式表 + 真实数据</b>的静态渲染（<code>CompareCard</code> / <code>ArtifactView</code> /
  <code>ActivityPanel</code>，来自 <code>apps/web-ui/src</code>；数据来自会话
  <code>${escapeHtml(sessionId)}</code> 的 <code>/api/sessions</code> 响应）。
  本机 Chromium 的 CDP 通道不稳定（会掉回 <code>about:blank</code>），所以没能给出真机截图——
  这份预览用于确认布局与文案，交互（点击/折叠）需要在实际应用里验证。
</div>
<div class="preview-chat">
${userTurns}
${cards}
</div>
</body>
</html>
`;

await writeFile(outFile, html, 'utf8');
await rm(entry, { force: true });
await rm(bundle, { force: true });
console.log(`wrote ${outFile}`);
console.log(`messages=${messages.length} rendered=${withCards.length}`);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

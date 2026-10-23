#!/usr/bin/env node
/**
 * 约束门禁（L1）。规则见 CONSTRAINTS.md §3「WCL 访问契约」与 §5「门禁」。
 *
 *   node scripts/check-constraints.mjs             # 提交时跑（默认）
 *   node scripts/check-constraints.mjs --need-wcl  # 取数前跑：凭据不可用即失败
 *
 * 检查项：
 *   C1 直接访问 warcraftlogs.com 网络端点的文件必须在 scripts/wcl-allowlist.json 白名单里
 *   C2 禁止的通道痕迹（网页抓取 / 无头浏览器 / v1 端点）
 *   C3 白名单里已不存在的文件（防止基线腐烂）
 *   C4 .env 凭据形状（截断即告警；--need-wcl 下为错误）
 *
 * 设计取向：新文件默认不通过。要放行必须显式改 JSON，让「多开一条通道」变成
 * 一次看得见的提交，而不是一次悄悄的重构。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts', 'wcl-allowlist.json');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.ssr-build',
  'coverage',
  '.workbuddy',
  '.playwright-cli',
]);
const CODE_EXT = /\.(ts|tsx|mjs|cjs|js)$/;

// 「访问 WCL」的判定必须是**端点字面量**，不能是「提到域名 + 文件里有 fetch」：
// 前端只是渲染一个示例链接（apps/web/public/app.js）、测试里 @vitest-environment jsdom
// 都会造成误报。真正发起请求的代码一定带 /api/v2 | /oauth | /v1 路径。
const WCL_ENDPOINT = /warcraftlogs\.com\/(?:api\/v2|oauth|v1)\b/;
const IS_TEST = /(^|\/)(tests?)\/|\.test\.[tj]sx?$|\.spec\.[tj]sx?$/;

// 抓取/浏览器/旧版接口的痕迹。只对**非测试文件**生效（测试会合法地提到这些词）。
const FORBIDDEN = [
  { re: /\b(puppeteer|playwright|cheerio|selenium|webdriver)\b/i, why: '无头浏览器 / HTML 解析' },
  { re: /warcraftlogs\.com\/(?:v1|api\/v1)\b/, why: 'WCL v1 API（本项目只允许 v2）' },
  { re: /scrape|scraping|爬虫|抓取页面/i, why: '页面抓取' },
];

// 本文件自然包含上述关键词（它就是在检测它们），跳过自身。
const SELF = 'scripts/check-constraints.mjs';

const errors = [];
const warnings = [];

function toRel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (CODE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

// ---- allowlist
let allowlist = { files: {} };
if (fs.existsSync(ALLOWLIST_PATH)) {
  try {
    allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch (error) {
    errors.push(`${toRel(ALLOWLIST_PATH)} 不是合法 JSON：${error.message}`);
  }
}
const allowed = new Set(Object.keys(allowlist.files ?? {}));

// ---- C1 + C2
const files = walk(ROOT);
const callers = [];
for (const file of files) {
  const rel = toRel(file);
  if (rel === SELF) continue;
  const source = fs.readFileSync(file, 'utf8');
  const touchesEndpoint = WCL_ENDPOINT.test(source);
  const isTest = IS_TEST.test(rel);

  if (touchesEndpoint && !isTest) {
    for (const rule of FORBIDDEN) {
      if (rule.re.test(source)) {
        errors.push(`${rel}：命中禁止通道 —— ${rule.why}（CONSTRAINTS.md §3.2）`);
      }
    }
  }

  if (touchesEndpoint) {
    callers.push(rel);
    if (!allowed.has(rel)) {
      errors.push(
        `${rel}：直接访问 warcraftlogs.com 端点但不在白名单。\n` +
          `    正确做法：数据访问进 packages/wcl-client；确需例外则显式加进 scripts/wcl-allowlist.json 并写理由。`,
      );
    }
  }
}

// ---- C3 白名单腐烂
for (const rel of allowed) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    warnings.push(`${rel}：在白名单里但文件已不存在，删掉这条。`);
  }
}

// ---- C4 凭据形状
const needWcl = process.argv.includes('--need-wcl');
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) {
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const idLen = (env.WCL_CLIENT_ID ?? '').length;
  const secretLen = (env.WCL_CLIENT_SECRET ?? '').length;
  if (idLen < 20 || secretLen < 20) {
    const msg =
      `WCL 凭据疑似被截断（client id ${idLen} 字符 / secret ${secretLen} 字符，正常约 40）。\n` +
      `    按 CONSTRAINTS.md §3.5 升级给用户，不要换通道、不要猜数据。\n` +
      `    诊断：node scripts/wcl-credentials.mjs --check`;
    if (needWcl) errors.push(msg);
    else warnings.push(msg);
  }
} else if (needWcl) {
  errors.push('缺少 .env，无法访问 WCL。');
}

// ---- 输出
const log = (tag, lines, text) => {
  if (lines.length === 0) return;
  console.log(`${tag} (${lines.length})`);
  for (const line of lines) console.log(`  - ${text(line)}`);
};

log('✗ 违规', errors, (l) => l);
log('⚠ 提示', warnings, (l) => l);

if (errors.length > 0) {
  console.log('\n约束门禁未通过。规则见 CONSTRAINTS.md。');
  process.exit(1);
}

console.log(
  `约束门禁通过（WCL 直接访问文件 ${callers.length} 个，全部在白名单内）` +
    (warnings.length > 0 ? `，${warnings.length} 条提示` : ''),
);

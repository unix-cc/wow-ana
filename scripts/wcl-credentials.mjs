#!/usr/bin/env node
/**
 * WCL 凭据写入 + 验证。
 *
 * 用法：
 *   node scripts/wcl-credentials.mjs --check
 *       只诊断当前 .env（不写文件），指出是 id 被截断还是网络/权限问题。
 *
 *   node scripts/wcl-credentials.mjs
 *       交互式：从 stdin 读 Client ID 与 Secret（粘贴后回车），
 *       逐个站点验证 OAuth，成功后写回 .env（保留其它键）。
 *
 *   node scripts/wcl-credentials.mjs --id <id> --secret <secret> [--host cn|www]
 *       非交互式写入并验证。
 *
 * 不会把 secret 明文打印到终端。
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const HOSTS = {
  www: {
    api: 'https://www.warcraftlogs.com/api/v2/client',
    token: 'https://www.warcraftlogs.com/oauth/token',
  },
  cn: {
    api: 'https://cn.warcraftlogs.com/api/v2/client',
    token: 'https://cn.warcraftlogs.com/oauth/token',
  },
};

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function mask(v) {
  if (!v) return '(empty)';
  return v.length <= 6 ? `${v}  ← 只有 ${v.length} 字符` : `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`;
}

async function tryToken(tokenUrl, id, secret) {
  let res;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
  } catch (error) {
    return { ok: false, reason: `网络不可达: ${error.message}` };
  }
  const text = await res.text();
  if (res.ok) {
    try {
      const json = JSON.parse(text);
      if (json.access_token) return { ok: true, token: json.access_token, scope: json.scope };
    } catch {
      /* fallthrough */
    }
    return { ok: false, reason: `响应不是预期的 JSON: ${text.slice(0, 120)}` };
  }
  if (res.status === 401) {
    return { ok: false, reason: `401 invalid_client — id/secret 不匹配（或 id 被截断）` };
  }
  if (res.status === 403) {
    return { ok: false, reason: `403 — 该站点拒绝此客户端（CN 与全球站点账号体系分开）` };
  }
  return { ok: false, reason: `${res.status} ${text.slice(0, 120)}` };
}

async function probeReport(host, token, code) {
  const res = await fetch(HOSTS[host].api, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query($c:String!){reportData{report(code:$c){title zone{name} startTime}}}',
      variables: { c: code },
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, reason: `${res.status}` };
  if (json?.errors) return { ok: false, reason: JSON.stringify(json.errors).slice(0, 200) };
  const report = json?.data?.reportData?.report;
  if (!report) return { ok: false, reason: '报告不存在或无权访问' };
  return { ok: true, title: report.title, zone: report.zone?.name };
}

// ---- args
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const checkOnly = argv.includes('--check');

if (!fs.existsSync(ENV_PATH)) {
  console.error(`找不到 ${ENV_PATH}`);
  process.exit(1);
}

const current = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));

if (checkOnly) {
  console.log('== 当前 .env 诊断 ==');
  console.log(`  WCL_CLIENT_ID     ${mask(current.WCL_CLIENT_ID)}`);
  console.log(`  WCL_CLIENT_SECRET ${mask(current.WCL_CLIENT_SECRET)}`);
  console.log(`  WCL_API_URL       ${current.WCL_API_URL ?? '(missing)'}`);

  const idLen = (current.WCL_CLIENT_ID ?? '').length;
  const secretLen = (current.WCL_CLIENT_SECRET ?? '').length;
  const looksTruncated = idLen < 20 || secretLen < 20;
  console.log(
    looksTruncated
      ? '\n  ⚠ 凭据长度明显短于 WCL 正常值（Client ID / Secret 均为 40 位左右），判定为被截断。\n    这不是网络问题，无法自动修复 —— 需要重新生成。'
      : '\n  长度正常，开始验证 OAuth…',
  );

  for (const [host, cfg] of Object.entries(HOSTS)) {
    const r = await tryToken(cfg.token, current.WCL_CLIENT_ID ?? '', current.WCL_CLIENT_SECRET ?? '');
    console.log(`  [${host}] ${r.ok ? 'OK 取得 access token' : 'FAIL ' + r.reason}`);
    if (r.ok) {
      const p = await probeReport(host, r.token, 'mnNQW16gjB9azRYx');
      console.log(`     probe report mnNQW16gjB9azRYx → ${p.ok ? `OK "${p.title}" (${p.zone})` : 'FAIL ' + p.reason}`);
    }
  }
  process.exit(0);
}

// ---- gather credentials
let id = flag('--id');
let secret = flag('--secret');
const preferHost = flag('--host');

if (!id || !secret) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('从 https://www.warcraftlogs.com/api/clients/ 复制 Client ID 与 Secret（Secret 只显示一次）。');
  if (!id) id = (await rl.question('Client ID: ')).trim();
  if (!secret) secret = (await rl.question('Client Secret: ')).trim();
  rl.close();
}

id = id.trim().replace(/^["']|["']$/g, '');
secret = secret.trim().replace(/^["']|["']$/g, '');

if (id.length < 20 || secret.length < 20) {
  console.error(
    `长度不对（id=${id.length}, secret=${secret.length}）。像是复制不全，请整段重新复制（不要带引号或空格）。`,
  );
  process.exit(1);
}

const order = preferHost && HOSTS[preferHost] ? [preferHost, ...Object.keys(HOSTS).filter((h) => h !== preferHost)] : ['www', 'cn'];
let winner;
for (const host of order) {
  const r = await tryToken(HOSTS[host].token, id, secret);
  console.log(`[${host}] ${r.ok ? 'OK' : 'FAIL ' + r.reason}`);
  if (r.ok) {
    winner = { host, token: r.token };
    break;
  }
}
if (!winner) {
  console.error('\n两个站点都验证失败 —— 这对凭据不可用，请重新创建客户端。');
  process.exit(1);
}

const p = await probeReport(winner.host, winner.token, 'mnNQW16gjB9azRYx');
console.log(`probe report → ${p.ok ? `OK "${p.title}" (${p.zone})` : 'FAIL ' + p.reason}`);

// ---- write back, preserving unknown keys
const next = {
  ...current,
  WCL_CLIENT_ID: id,
  WCL_CLIENT_SECRET: secret,
  WCL_API_URL: HOSTS[winner.host].api,
};
const body =
  [
    '# WCL API 凭据（勿提交到 git）',
    `WCL_CLIENT_ID=${next.WCL_CLIENT_ID}`,
    `WCL_CLIENT_SECRET=${next.WCL_CLIENT_SECRET}`,
    `WCL_API_URL=${next.WCL_API_URL}`,
    `DATABASE_URL=${next.DATABASE_URL ?? 'wcl-cache.db'}`,
    `LOG_LEVEL=${next.LOG_LEVEL ?? 'info'}`,
  ].join('\n') + '\n';
fs.writeFileSync(ENV_PATH, body, 'utf8');
console.log(`\n已写入 ${ENV_PATH}（host=${winner.host}，id=${mask(id)}）`);

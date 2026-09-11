/**
 * Resolve every ability id referenced in the repo to its official in-game
 * (zh-CN) name via WCL's own game-data API.
 *
 * Why this exists: WCL event payloads carry **only** numeric abilityGameID —
 * no names at all (verified 2026-09-10 on the live API, with and without an
 * Accept-Language header). So every ability name the analysis prints is ours,
 * and the authoritative zh-CN source is `gameData.ability(id)` on the
 * cn.warcraftlogs.com host (the API itself is localized there:
 * 30451 → 奥术冲击, 34026 → 杀戮命令, 845 → 顺劈斩).
 *
 * No third-party mapping table is required.
 *
 * Usage:
 *   node scripts/sync-ability-names.mjs            # print the table
 *   node scripts/sync-ability-names.mjs --json     # machine-readable
 *   node scripts/sync-ability-names.mjs --diff     # knowledge name vs official
 *   node scripts/sync-ability-names.mjs --check    # exit 1 on any unresolved id
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AuthManager } from '../packages/wcl-client/dist/index.js';

const API_URL = process.env.WCL_API_URL ?? 'https://cn.warcraftlogs.com/api/v2/client';
const BATCH = 40;

const roots = [
  'packages/spec-knowledge/src/data',
  'packages/analysis-engine/src/specs',
];

/** Collect `abilityId: <n>` from every .ts file under the given roots. */
async function collectIds(dir) {
  const found = new Map();
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [id, hits] of await collectIds(full)) {
        found.set(id, [...(found.get(id) ?? []), ...hits]);
      }
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const text = await readFile(full, 'utf8');
    for (const match of text.matchAll(/abilityId:\s*(\d+)/g)) {
      const id = Number(match[1]);
      const hits = found.get(id) ?? [];
      hits.push(full.replace(/\\/g, '/'));
      found.set(id, hits);
    }
  }
  return found;
}

async function resolveNames(ids) {
  const auth = new AuthManager();
  const token = await auth.getAccessToken();
  const names = new Map();

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const fields = chunk
      .map((id, index) => `a${index}: ability(id: ${id}) { id name }`)
      .join('\n');
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: `{ gameData { ${fields} } }` }),
    });
    const json = await res.json();
    if (json.errors) {
      console.error('GraphQL errors:', JSON.stringify(json.errors).slice(0, 400));
    }
    for (const key of Object.keys(json.data?.gameData ?? {})) {
      const ability = json.data.gameData[key];
      if (ability && typeof ability.id === 'number') {
        names.set(ability.id, ability.name);
      }
    }
  }
  return names;
}

const ids = new Map();
for (const root of roots) {
  for (const [id, hits] of await collectIds(root)) {
    ids.set(id, [...(ids.get(id) ?? []), ...hits]);
  }
}
const idList = [...ids.keys()].sort((a, b) => a - b);
const names = await resolveNames(idList);

// Knowledge entries: `key` → nearest `abilityId` → nearest `name`.
const knowledgeFile = 'packages/spec-knowledge/src/data';
const knowledgeEntries = [];
{
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const lines = (await readFile(full, 'utf8')).split('\n');
      let key;
      let abilityId;
      for (const line of lines) {
        const k = line.match(/key:\s*'([^']+)'/);
        if (k) key = k[1];
        const a = line.match(/abilityId:\s*(\d+)/);
        if (a) abilityId = Number(a[1]);
        const n = line.match(/^\s*name:\s*'([^']+)'/);
        if (n && key !== undefined && abilityId !== undefined) {
          knowledgeEntries.push({ file: full.replace(/\\/g, '/'), key, abilityId, name: n[1] });
          key = undefined;
          abilityId = undefined;
        }
      }
    }
  };
  await walk(knowledgeFile);
}

// Does our curated name already carry the official CN form (or the English)?
const mismatches = [];
for (const entry of knowledgeEntries) {
  const official = names.get(entry.abilityId);
  if (!official) continue;
  if (!entry.name.includes(official)) {
    mismatches.push({ ...entry, official });
  }
}

if (process.argv.includes('--diff')) {
  console.log(`\nknowledge entries checked: ${knowledgeEntries.length}`);
  console.log(`name differs from WCL official zh-CN: ${mismatches.length}\n`);
  for (const m of mismatches) {
    console.log(`  ${String(m.abilityId).padStart(8)}  ours="${m.name}"`);
    console.log(`            WCL zh="${m.official}"   (${m.key}, ${m.file.split('/').pop()})`);
  }
}

const rows = idList.map((id) => ({
  id,
  name: names.get(id) ?? null,
  files: [...new Set(ids.get(id) ?? [])].length,
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else if (!process.argv.includes('--diff')) {
  console.log(`ability ids found: ${rows.length}\n`);
  for (const row of rows) {
    const mark = row.name === null ? ' ?? ' : ' ok ';
    console.log(`[${mark}] ${String(row.id).padStart(8)}  ${(row.name ?? '(unresolved)').padEnd(22)} files=${row.files}`);
  }
}

const unresolved = rows.filter((row) => row.name === null);
if (unresolved.length > 0) {
  console.log(`\nunresolved: ${unresolved.map((r) => r.id).join(', ')}`);
  if (process.argv.includes('--check')) process.exit(1);
}

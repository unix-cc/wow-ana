# WCL AI Analyzer — 架构审计（Phase 1，只读）

> 审计日期：2026-09-08
> 范围：`C:\code\wcl-ana` 全仓库（6 packages + 2 apps，约 9,300 行 TS）
> 本轮**未修改任何代码**，仅执行 `npx vitest run` 验证现状（29 文件 / 156 用例全绿，5s）

---

## 1. 当前项目结构

```text
apps/
  mcp-server/        # MCP Adapter（10 个 tool）
  web/               # HTTP + SSE 聊天版（原生 HTML/JS，无框架，用户自带 LLM）
packages/
  shared/            # config / logger / errors / utils（含 .env 加载）
  domain/            # 纯类型：report / player / event / analysis / common
  wcl-client/        # auth / graphql / rate-limit / url-parser / client / event-normalizer / queries
  storage/           # SQLite(Drizzle) 单表 KV 缓存 + WclCache
  analysis-engine/   # core(rule-engine/timeline/scoring) + combat(10 个通用 analyzer) + specs(4 专精 18 规则)
  application/       # AppService 编排 + client-builder + database-service
tests/fixtures/wcl/  # 只有 README.md，内容为空
```

代码规模：`wcl-client/client.ts` 561 行、`application/app-service.ts` 457 行、`web/server.ts` 369 行、
`web/pipeline.ts` 299 行、`analysis-engine/specs/helpers.ts` 271 行 —— 复杂度集中在"编排 + 规则工厂"两处。

---

## 2. 当前技术栈

| 维度 | 现状 |
| --- | --- |
| 语言/构建 | TypeScript strict（`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`），tsc 逐包编译 |
| 包管理 | pnpm workspace（**注意：当前 shell 里 corepack pnpm 路径损坏，需用 `npx vitest` 或 PowerShell 跑**） |
| WCL 传输 | 手写 `fetch` GraphQL，**无 graphql/urql 客户端**，无 retry（429 直接抛错） |
| 校验 | Zod —— **只用于 MCP 入参和 web 请求体**，WCL 响应用 `as` 断言 + 手写 type guard |
| 存储 | better-sqlite3 + Drizzle，**仅一张 `cache_entries(key,value,createdAt,expiresAt)`** |
| 测试 | Vitest，各包内 `tests/`，无跨包 integration |
| 前端 | `apps/web/public` 原生 HTML/CSS/JS + SSE 流式，无 React/Vue |

---

## 3. 当前数据流

```text
用户输入 WCL URL
   ↓  apps/web/src/pipeline.ts（会话状态机：ask-fight → ask-player → ready）
      apps/mcp-server/src/tools/*（10 个 tool）
   ↓  AppService.analyzePlayer
   ↓  WclClient：getReport / getFights / getPlayers / loadPlayerEvents(7 个 dataType 并发)
   ↓  GraphqlClient → WCL GraphQL → raw JSON
   ↓  event-normalizer.ts（字段映射，raw → domain CombatEvent）
   ↓  AnalysisContext { report, fight, player, events: CombatEvent[] }
   ↓  10 个通用 Analyzer（只产 metrics，findings 恒为 []）
      + SpecRegistry 命中 1 个 SpecAnalyzer（18 条硬编码规则，产 Finding）
   ↓  { metrics: Record<string, unknown>, findings, score }
   ↓  + RankingReference（同副本 top100 排行榜基线）
   ↓  JSON.stringify 整体塞进 user message
   ↓  用户在浏览器填的 LLM（OpenAI 兼容）→ Markdown 流式返回
```

**关键观察**：`CombatEvent[]`（归一化事件）直接就是分析引擎的输入，中间**没有 Combat Facts 层**。

---

## 4. WCL API 调用链

```text
AuthManager (auth.ts, token 缓存)  ─┐
RateLimitManager (rate-limit.ts)    ├→ GraphqlClient (graphql.ts)
queries/{metadata,events,rankings}.ts┘      │
                                            ↓
                              WclClient (client.ts)
                              ├ 领域映射 raw → Report/Fight/Player（在 Connector 内）
                              ├ 分页 getEvents/fetchAllEvents（nextPageTimestamp，上限 1000 页）
                              ├ 缓存 cache-aside（report/fights/actors/events）
                              ├ getPlayerCasts|Buffs|Damage|Deaths（薄封装，固定 dataType）
                              └ getEncounterRankings（worldData.encounter.characterRankings）
```

- ✅ **遵守**：GraphQL 调用确实 100% 集中在 `wcl-client`；MCP/Web 都不直连 GraphQL。
- ⚠️ **越界**：`client.ts` 里做了领域对象映射（`encounterID → boss`、`gameZone.id → zoneId`、`owner.name → owner`），
  即"Connector 内出现领域翻译"，缺少独立的 Combat Normalizer 包。
- ⚠️ **缺失**：无 retry / backoff；`graphql.ts` 只把 429 转成异常。
- ⚠️ **缺失**：无"分析需求 → 数据需求 → 查询"的映射，`loadPlayerEvents` 固定并发拉 7 类数据，无论分析是否需要。

---

## 5. 当前分析流程

**通用 analyzer（`combat/*`，10 个）**：casts / gcd / cooldowns / buffs / damage / deaths / resources /
targets / interrupts / dispels —— **全部只写 `metrics`，`findings` 一律返回 `[]`**。

**专精规则（`specs/{class}/{spec}/rules/*`，18 条）**：唯一产出 Finding 的地方，形态是
"阈值检查 → 直接判错"，例如：

```ts
// kill-command.ts
const expected = Math.floor(durationMs / 6_000) + 1;
if (actual / expected < 0.8) → severity: 'high', title: 'Kill Command 使用不足'
```

**判定链缺失**：没有 `Target State / Resource State / Cooldown State / Movement / Boss Phase /
Target Death / Encounter Mechanic` 检查，**也没有 Correct / Acceptable / Suboptimal / Mistake / Unknown 五档结论**，
`severity` 就是唯一输出。

**其他**：
- `SpecRegistry` 硬编码 4 个专精（BM 253 / 奥法 62 / 元素 262 / 血DK 250）。
- `CooldownAnalyzer` 需要调用方传入 `cooldowns` 才运行；MCP/Web 默认不传 → **通用 CD 分析实际上没跑**。
- 编排逻辑分裂：会话状态机只在 `apps/web`，MCP 侧没有等价流程（编排未上收到 `application`）。

---

## 6. 当前 AI 流程

| 项 | 现状 |
| --- | --- |
| Prompt 位置 | `apps/web/src/prompt.ts` (SYSTEM_PROMPT) + `docs/ai-prompt.md` |
| 输入 | `findings + metrics + reference` 整个 `JSON.stringify(structured, null, 2)` |
| 输出 | **自由 Markdown**，无 JSON schema、无结构化契约 |
| 大小控制 | **无**（`metrics.gcd.idleWindows`、findings 的 evidence 数组可任意长） |
| 版本/置信度 | 未传给模型（`score` 已在 prompt 里声明为启发式信号，这点是对的 ✅） |

✅ 已做到：AI 不直连 WCL、不自己统计（prompt 有明确禁令）、不暴露 token。
❌ 未做到：没有 `ai-reasoning` 模块；无结构化输出；无输入裁剪与上限；AI 无法拿到 `confidence / verdict / knowledgeVersion`。

---

## 7. 当前 MCP

10 个 tool：`parse_wcl_url` / `get_report` / `get_fights` / `get_players` / `get_player_summary` /
`get_player_casts` / `get_player_buffs` / `get_player_damage` / `get_player_deaths` / `analyze_player`。

- ✅ 分层正确：`MCP → AppService → Engine/WclClient`，没有直连 GraphQL。
- ❌ `get_player_casts|buffs|damage` **直接把原始事件数组回吐给宿主 AI**，且 `getEvents` 默认 `maxEvents = 100_000` ——
  这是"原始 Combat Events 进入 LLM"的**真实通道**，与 ARCHITECTURE §34 直接冲突。
- ❌ 缺 `get_combat_facts` / `get_spec_knowledge` / `get_patch` / `analyze_fight`。

---

## 8. 当前测试

- 29 文件 / 156 用例，**全部通过**（`npx vitest run`，5s）。
- 覆盖：auth、client（缓存/分页）、url-parser、rate-limit、event-normalizer、storage cache、
  10 个通用 analyzer、4 个专精规则、rule-engine、scoring、web pipeline / llm / session。
- **结构性缺陷**：
  1. `tests/fixtures/` 是空壳（只有 README），所有 fixture 是 `tests/helpers.ts` 里**手写构造的 CombatEvent 数组**。
  2. 测试断言锚定在当前输入契约（事件数组）上 → 引入 Combat Facts 层后，**4 个专精测试文件 + 10 个 analyzer 测试必须重写**。
  3. 无 integration 测试、无 patch/knowledge 测试、无 Evidence 完整性断言（现有断言只查 `evidence.length > 0`）。

---

## 9. 与 ARCHITECTURE.md 的差异（Current / Target / Gap）

| 目标模块 | Current | Gap | 严重度 |
| --- | --- | --- | --- |
| combat-model | `domain/event.ts` CombatEvent | 只有事件模型，无 Fact / Verdict / Spec 模型 | 中 |
| combat-normalizer | `wcl-client/event-normalizer.ts` | 只做字段映射，无语义富化（叠层/资源状态/阶段），且位置在 Connector 内 | 中 |
| **combat-facts** | **不存在** | `metrics: Record<string, unknown>`，analyzer 边遍历事件边塞指标 | **P0** |
| **spec-knowledge** | **不存在** | 知识 = 硬编码 `constants.ts`（abilityId + cooldownMs），无 priority / patch / source / confidence | **P0** |
| analysis-engine | `packages/analysis-engine` | 存在，但吃 `CombatEvent[]` 而非 Facts；与 WCL 归一化结构强耦合 | 高 |
| analyzers/* | `combat/` + `specs/` | 同包混放，职责未物理隔离；Cooldown/Rotation/Movement/Mechanic 缺失或空转 | 中 |
| **ai-reasoning** | **不存在** | prompt 散在 apps/web + docs，无结构化输出 | 高 |
| knowledge/ 目录 | 不存在 | 无 specs / encounters / patches 任何内容 | **P0** |
| Finding 模型 | `domain/analysis.ts` | 缺 `confidence` / `expected` / `actual` / `verdict` / `analyzerVersion` / `knowledgeVersion` | **P0** |
| Evidence 模型 | 同上 | 缺 `fightId` / `eventId`；大量 finding 的 evidence 是**聚合值**（`{value, unit:'次'}`）而非时间点 | **P0** |
| Condition→Action 优先级 | 不存在 | 全部是阈值检查，无 `target_count / resource / buff / phase` 条件求值 | **P0** |
| Patch Resolver | 不存在 | `Report.startTime` 有，但无人用它选版本 → 历史日志会被当前机制误判 | 高 |
| 版本化 | `ANALYSIS_VERSION = 1`（storage） | 单一数字；**`setAnalysis/getAnalysis` 从未被调用**（分析结果根本没进缓存）；无 knowledgeVersion | 高 |
| Encounter / Phase / Movement | 不存在 | 未拉取 position 事件，无 phase 概念，Boss 无敌/转阶段会误判为"玩家发呆" | 高 |
| apps/api | 不存在 | web 自带 HTTP，可接受（等价设计） | 低 |

---

## 10. 已发现的具体缺陷（读码验证，非推测）

1. **死亡分析实际空转**：`getPlayerDeaths` 用 `dataType:'Deaths' + sourceId=playerId` 拉数据，
   而 `DeathAnalyzer` 筛 `event.targetId === player.id`；WCL 死亡事件的死者通常是 **target**。
   同时死亡前伤害窗口筛 `targetId === player.id`，但 pipeline 只拉了 `DamageDone`（sourceId=player），
   **从未拉 `DamageTaken`** → `metrics.death.deaths` 恒为空数组。
   【Phase K 已修复：Deaths 改按 targetId 拉取；新增 dataType:'DamageTaken' 喂死亡前窗口】
   【Phase O 真实验证后修正：WCL DamageTaken 的 **sourceID 过滤参数 = 受害者**（targetID
   返回 0/畸形），且事件时间戳为 report-absolute——loadPlayerEvents 与死亡复盘均改为
   sourceId=玩家 全 fight 拉取后本地切窗；真实 10 层日志 4 次死亡归因全部打通】
2. **Debuffs 数据源未拉取**：`loadPlayerEvents` 只拉 `Buffs`，没有 `Debuffs`；
   `flame-shock-uptime` 等 debuff 规则依赖 `applydebuff` 出现在 Buffs 结果里，需实连验证。
   【Phase K 已修复：显式拉 `dataType:'Debuffs'` 并作为 debuff 唯一权威源（Buffs 结果只保留
   buff 系列，防双计）；真实日志下 WCL Buffs/Debuffs 返回集合是否互斥仍需实连验证】
   【⚠️ Phase M 实测证伪 K2 关键假设：WCL `Debuffs` dataType + sourceID=玩家 返回的是
   「加在玩家身上」的 debuff（实测定 117 条 targetID 全=玩家，Flame Shock=0），并非玩家施加
   给敌人的 debuff。flame-shock-uptime 单靠该数据源恒 0%。修复：规则改消费 Flame Shock
   周期伤害事件链（boss 战），大秘境场景整体跳过（多目标 spread 下覆盖率语义不成立）——
   详见 AGENTS.md Phase M】
3. **分析结果从不缓存**：`WclCache.setAnalysis/getAnalysis` 已实现但零调用 → 同一场重复分析 = 重复请求 WCL。
   【Phase I 已修复：双版本缓存键 + AppService 读穿缓存，web/mcp 已传 database.cache】
4. **metrics 键冲突**：`metrics.spec = specResult.spec`（字符串）后紧跟 `Object.assign(metrics, specResult.metrics)`，
   且多个 analyzer 共用一个扁平 record，存在覆盖风险。
   【Phase K 已修复：裸 Object.assign 换成 mergeMetrics 碰撞守卫——同键异值抛确定性错误，
   不再静默覆盖；同值/undefined 幂等跳过】
5. **`as CastEvent[]` 强转**：`getPlayerCasts` 等直接 `return events as CastEvent[]`，类型安全是假的。
   【仍列 backlog：wcl-client helper 内对归一化结果的窄化强转，宜改为 Zod/type guard】
6. **过时技能知识残留（§13 风险 D 实现）**：奥法知识 abilities/cooldowns 与 legacy 规则
   仍挂 Arcane Power（12042 / 120s），但该技能已于 Dragonflight 10.0（2022-10）重做为
   Arcane Surge（365350）、10.1.5（2023-07）完全移除 → 每场现版本分析恒伪造
   「奥术强化 0 次使用、理论 N 次」high 假警报。
   【Phase N 已修复：spec-knowledge 删 12042、surge 立为爆发 CD（90s，conf 0.7），
   knowledgeVersion 1.3.0；legacy constants / 规则文件全量切到 365350（CD 从 knowledge
   读取）；奥法 analyzer 仿元素萨对大秘境「基本未使用」降 low + 免责；ANALYZER_VERSION
   0.3.0。engine 120 用例全绿（含 12042 忽略回归测试）】

---

## 11. 重构优先级

```text
P0  Combat Facts 层                    ← 数据流主线，其他一切都依赖它
P0  Finding / Evidence 模型升级         ← 所有 Analyzer 的出口契约
P0  Spec Knowledge 包 + Condition→Action ← 系统差异化的核心，工作量最大
P1  Analysis Engine 依赖倒置（吃 Facts）
P1  Verdict 五档判定（不再直接判错）
P2  AI Reasoning 包 + 结构化输出
P2  MCP 工具对齐 + 原始事件出口限流
P3  Patch Resolver / 双版本号 / Encounter
```

---

## 12. 分阶段迁移计划（每阶段可运行 / 可测试 / 可回滚）

| # | 阶段 | 主要动作 | 破坏性 | 验收 |
| --- | --- | --- | --- | --- |
| A | 领域模型 | `domain` 增 `CombatFact` / `FactSet` / `Verdict` / `SpecKnowledgeRef` / `AnalysisVersion`，Finding 加 `confidence/expected/actual/verdict` | 纯新增 | 156 用例仍全绿 |
| B | 抽 Normalizer | `wcl-client/event-normalizer.ts` → `packages/combat-normalizer`，wcl-client re-export 保持兼容 | 零 | 现有 import 不改也能跑 |
| C | Combat Facts | 新建 `packages/combat-facts`：先落 Cast / Cooldown / Buff / Resource 四类 Fact；通用 analyzer 改为「先产 Fact 再算 metric」**双轨并行** | 低 | Fact 单测 + 旧 metric 断言不变 |
| D | Spec Knowledge | 新建 `packages/spec-knowledge` + `knowledge/specs/{hunter-bm,mage-arcane,...}`；把 4 个 `constants.ts` 迁成带 `patch / source / confidence` 的知识对象；旧 constants 保留为兼容导出 | 低 | 知识加载测试 + 旧专精测试不变 |
| E | 优先级求值器 | 实现 `Condition → Action` 求值 + 五档 Verdict；先只服务新 rotation 判断，旧阈值规则并存 | 中 | 优先级求值单测（含"不该判错"的用例） |
| F | Finding/Evidence 升级 | 规则层补 `expected/actual/confidence/verdict`，evidence 补 `fightId/eventId/expected vs actual 时间点` | 中 | Evidence 可追溯性断言 |
| G | AI Reasoning | 新建 `packages/ai-reasoning`：输入裁剪 + 结构化输出 Zod schema；web/MCP 接入 | 中 | 结构化输出解析测试 |
| H | MCP 对齐 | 增 `get_combat_facts` / `get_spec_knowledge` / `analyze_fight`；原始事件 tool 加 `limit` 硬上限（如 500） | 中 | MCP tool 契约测试 |
| I | 版本化 | `analyzerVersion` / `knowledgeVersion` 进入 `AnalysisResult` 与 cache key；启用 `setAnalysis` | 低 | 版本变更导致缓存失效的测试 |
| J | 测试重构 | `tests/fixtures/{hunter-bm,mage-arcane}/*.json` + `tests/{analyzers,knowledge,integration}` | 低 | 新目录全绿，旧目录逐步迁移 |

---

## 13. 每阶段风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| A | Finding 加字段后 MCP 输出变长 | AI context 膨胀 | 字段可选，MCP 侧裁剪 |
| C | Facts 与 metrics 双轨期指标口径不一致 | 同一指标两处真值 | 双轨期让 metric **由 Fact 派生**，禁止第二条计算路径 |
| D | 职业知识迁移出错（技能 ID / CD 时长） | 整批 finding 误判 | 先迁 1 个专精（BM）跑真实日志对比，再批量 |
| E | Condition 求值器过拟合，误判率上升 | 用户信任受损 | 低置信度知识只能产出 `Potential/Suggestion`，禁止 `Mistake` |
| F | 补 evidence 需要回溯事件，改动面大 | 18 条规则逐个改 | 先做 helper（从 Fact 反查事件），逐条替换 |
| G | 结构化输出被模型不遵守 | 前端渲染失败 | Zod 解析失败降级为 Markdown + 明确报错 |
| H | 给原始事件 tool 加上限后宿主 AI 分析变浅 | MCP 体验回退 | 同步提供 `get_combat_facts` 作为替代路径 |
| I | 版本号进了 cache key，改知识就全量失效 | WCL 请求量上升 | 事件级缓存仍在，只重算分析 |
| J | 156 个旧用例与新契约冲突 | 测试大面积红 | 旧测试冻结不动，新测试在新目录并行，最后再迁移 |

---

## 14. 结论（Phase 1 审计时）

当前项目**不是"WCL → LLM"的野路子**：GraphQL 收敛、AI 不直连 WCL、Evidence 概念、确定性优先、
排行榜基线对比，这些都做对了，且 156 个测试全绿，说明工程底子扎实。

真正缺的是目标架构的**中间三层**：

```text
CombatEvent[]  ──►  Combat Facts   （不存在：metrics 是裸 Record<string, unknown>）
                    Spec Knowledge（不存在：知识 = 硬编码常量，无 priority/patch/source/confidence）
                    Verdict        （不存在：severity 直接当结论，不区分 Suboptimal / Acceptable / Unknown）
```

建议从 **阶段 A（领域模型）+ 阶段 C（Combat Facts，先做 BM 一个专精打通）** 起步，
在旧链路并行运行的前提下先把"事实层"立住，再动 Spec Knowledge 与优先级求值器。

---

## 15. Phase A–P 全量复审（2026-09-09）

> 距 §1–14（Phase 1 审计）已完成 A–P 十六个阶段重构。本次为三路并行复审
> （数据层 / 分析层 / 应用层）+ 关键发现逐条人工复核（全部 file:line 已 grep 实证）。
> 基线：全仓 typecheck / test（14 工程 400+ 用例）/ lint 全绿。

### 15.1 总体结论

- **Phase 1 审计的全部 P0 差距已落地**：Combat Facts 层、Spec Knowledge 包、五档 Verdict、
  AI Reasoning brief、双版本持久缓存、Patch Resolver（Registry 按战斗日期选版）均存在且有测试。
- **无 P0**。P1 集中在三类：storage 缓存路径分裂（数据完整性）、知识纪律未收口到
  shaman/DK/部分 BM 规则（已知 backlog 的精确化）、一处悬空知识引用（分析正确性）。
- 分层纪律主体成立：GraphQL 只在 wcl-client；raw 字段只在 combat-normalizer（DTO 边界的
  `hardModeLevel` 例外）；MCP/Web 纯 Adapter；密钥不进 MCP/LLM/日志；原始事件不进 LLM
  （MCP 裸事件 tool 有 500 上限的渐进披露，已标注 audit risk）。

### 15.2 P1（应修）

| # | 发现 | 证据 |
|---|---|---|
| 1 | **DATABASE_URL 相对路径按进程 CWD 解析 → 缓存分裂**。从不同目录启动服务会写不同的 SQLite 文件，缓存命中失效、数据重复。实证：根目录 `wcl-cache.db`（17MB）与 `apps/web/wcl-cache.db`（4.7MB）并存，各有活跃 WAL | `application/src/database-service.ts:41`（直接 `process.env.DATABASE_URL`，相对路径交给 better-sqlite3 按 CWD 解析）；`.env:4` 是相对路径 |
| 2 | **`arcane.barrage_orb_aoe` 的 `cooldownReady:['arcane_orb']` 悬空**：`arcane_orb` 在 abilities 无 `cooldownMs`、cooldowns 数组也无此 key → `cooldownMsByKey` 查无 → evaluator 恒 `unknown`，该 AOE 优先级规则永远无法作判定锚点。且「条件引用完整性」测试只校验 key 存在、不校验其有 CD 时长，漏检 | `spec-knowledge/data/mage-arcane.ts`（abilities 的 arcane_orb 无 cooldownMs；cooldowns 仅 arcane_surge）+ `analysis-engine/src/priority/evaluator.ts:183-187` + `tests/knowledge.test.ts:86-124` |
| 3 | **spec 规则知识纪律未收口（已知 backlog 精确化 + 新发现）**：元素萨/血DK 全部规则硬编码 CD（stormkeeper 60s / fireElemental 120s / blood 各规则）且不设 confidence/verdict；**新发现**：BM `cooldown-delay.ts:19` 硬编码 `90_000`，与同文件注释「from knowledge」矛盾（knowledge 里只有 confidence 被读取）。后果：`canEscalateToMistake` 门控只在 `priority/evaluator.ts` 生效，spec 规则产出的 high finding 无 confidence/verdict，**五档门控在 spec 产出路径被绕过** | `shaman/elemental/rules/*-delay.ts`、`death-knight/blood/rules/*`、`hunter/beast-mastery/rules/cooldown-delay.ts:19` |

### 15.3 P2（建议，按主题归并）

**知识层**
- `arcane_charge` buff 无 `abilityId` → 事件重放栈计数恒 0 → `arcane.orb_low_charges` 的
  `buffStacks max:2` 条件**恒满足**（不是「休眠」而是「恒真」），与"undefined 即休眠"的
  设计意图偏差（`mage-arcane.ts` + `priority/state.ts:168-175`）。
- Registry 同日多版本排序无二级 tiebreaker（非确定性）；`getBySpecName/getBySpecId`
  取插入序首个而非 fight-date live 版本（`registry.ts:43-45,62-68`）。
- `ANALYZER_VERSION`（`analysis-engine/src/types.ts:10`，当前 0.4.0）与 package.json 同步
  全靠注释，无测试强制（当前一致，失配会静默破坏缓存失效）。

**Facts 层收口**
- combat-facts 只有 Cast/GCD/Cooldown/Buff/Resource 五类计算机；`damage/dispels/interrupts/
  targets` 四个 analyzer 仍直接遍历 `context.events`（纪律条文只列了五类，字母上合规、
  精神上未收口）。
- `runAnalyzers`/`mergeMetrics` 位于 application 包（app-service.ts:902/1000）——编排归
  application 合理，但 `mergeMetrics` 是确定性守卫，宜下沉 analysis-engine。

**存储/缓存**
- `eventQueryHash` 不含 `startTime/endTime` 而 `EventQuery` 支持时间窗
  （`wcl-client/client.ts:288-296` vs `storage/repositories/cache-repository.ts:125-140`）。
  当前所有调用方均为整场窗口（死亡复盘刻意全量拉取本地切窗），无实际碰撞；属潜伏缺陷。
- `wcl-client` §10.5 `as` 强转实为 **4 处**（Cast/Buff 等 Event[] 系列，`client.ts:381-408`）
  + `cached as CombatEvent[]`（:303）；且 `client.ts:20` 内部 import 了 `@deprecated` 的
  event-normalizer re-export 而非直接依赖 `@wcl/combat-normalizer`。
- `hardModeLevel` 原始字段名经 `RankingEntry` → application（`app-service.ts:784`）→
  `RankingReference`（`analysis-engine/src/types.ts:54`）跨层保留（DTO 边界内可接受，宜内部化）。
- env 读取双轨：`shared/config.ts` 与 `application/database-service.ts:41` 各读各的。

**AI/适配层**
- `ai-reasoning checkProvenance` 未强制「同一 sourceId 只出现一次」（SYSTEM_PROMPT 有此要求，
  `schema.ts:119-136`）。
- web pipeline 漏转移：`ask-fight` 态粘贴新报告 URL 会被 `matchFight` 忽略而反复要求选战斗；
  `ask-player` 态的死亡复盘意图被 `matchPlayer` 吞掉（`pipeline.ts:149-167`）。
  另 `death-review` 分支缺 fight context 时发送空 followup 且不写 assistant 历史
  （`server.ts:286-289`，UI 上表现为用户消息后无回复）。
- `adjustForDungeon` 在元素萨/奥法 analyzer 逐字复制（analyzer.ts:27-43 两处），应提共享 helper。

### 15.4 重点确认的 OK 项

- GraphQL 查询字符串只在 wcl-client；raw 字段只在 combat-normalizer（防御式收窄正确）。
- 全仓**零 `any`、零 `@ts-ignore`**（lint no-explicit-any=error 全绿）；依赖方向干净，
  无 `@wcl/*/src` 深层导入。
- 事件拉取通道语义与真实日志验证一致（Deaths 按 targetId；DamageTaken 的 sourceID=受害者；
  Debuffs 双计防护）。
- 双版本缓存键 + 读穿一致；`analysis-views` 有界且显式上报 capping。
- 五档求值器门控严密：`canEscalateToMistake` 同时门控 explain / unexplained 两路；
  `cooldownReady` 无知识 → unknown；scenario 裁剪是「整条删除」而非 blocked。
- SYSTEM_PROMPT 无硬编码技能 ID/CD；buildBrief 无原始事件；`web-ui` markdown 渲染
  全量转义后注入，`dangerouslySetInnerHTML` 安全前提成立；SSE 事件覆盖后端全部 kind。
- MCP tools 纯转发 + limit clamp [1,500] + 中文错误降级。

### 15.5 建议修复顺序

1. **storage DB 路径分裂**（数据完整性；修法：把 DATABASE_URL 解析为相对仓库根的绝对路径，
   或 config 校验 + 启动时打印实际库路径）。
2. **arcane_orb 悬空引用**（补 `cooldownMs` 或移除该条件；同时给「条件引用完整性」测试加
   「cooldownReady 的 key 必须有 CD 时长」断言）。
3. **元素萨 / 血DK knowledge 落地 + spec 规则 verdict/confidence 收口**（含 BM cooldown-delay
   的 CD 改从 knowledge 读取）——即 backlog 中的「元素萨知识锚点」的完整范围。
4. 其余 P2 择机：combat facts 补 damage/death/target/dispel/interrupt、web pipeline 漏转移、
   checkProvenance 唯一性、§10.5 强转改 type guard。

### 15.6 修复状态（2026-09-09，Phase Q）

按 §15.5 顺序全部落地，全仓 build / typecheck / test（15 工程）/ lint 全绿：

**P1（全部修复）**
- P1-1 ✅ DB 路径分裂：`database-service.ts` 改用 `@wcl/shared` 的 `config` + 新增
  `envRootDir`，相对 `DATABASE_URL` 锚定仓库根解析，路径变化时打印日志；env 读取双轨同步收口。
- P1-2 ✅ arcane_orb 悬空：knowledge 1.4.0 给 ability + cooldowns 补 `cooldownMs: 20_000`
  （Wowpedia/wowhead 实证，conf 0.7）；「条件引用完整性」测试加「cooldownReady 的 key 必须有
  CD 时长」回归断言。连带修复 `arcane_charge` 恒真：evaluator 对无 `abilityId` buff 的
  `buffStacks` 断言降级 `unknown`（诚实不可观测而非恒满足）；golden 场景随之改锚
  `arcane.blast_builder`，fixture 生成器 + 3 处测试同步。
- P1-3 ✅ 元素萨/血DK knowledge 落地（`shaman-elemental.ts` / `death-knight-blood.ts`，
  v1.0.0，带 source+confidence）；元素萨 4 条 + 血DK 2 条 + BM cooldown-delay 的 CD/confidence
  改从 knowledge 读取；`downgradeForDungeon` 提为 `specs/helpers.ts` 共享 helper；
  ANALYZER_VERSION → 0.5.0（含 package.json 同步 + 回归测试）。

**P2（本批修复）**
- ✅ Registry 排序加 `knowledgeVersion` 降序 tiebreaker；`getBySpecName/getBySpecId`
  改取最新（同 `versionsFor` 排序），不再依赖注册序。
- ✅ `eventQueryHash` 加入 `startTime/endTime`（WclClientCache 接口同步）；窗口查询
  不再与整场查询共享缓存槽。
- ✅ `checkProvenance` 强制同一 sourceId 只引用一次（+测试）。
- ✅ web pipeline 漏转移：`ask-fight` 态识别新报告 URL 重启流程；`ask-player` 态放行
  死亡复盘意图（整场复盘无需先选玩家）；`death-review` 缺 fight context 时返回明确
  guidance 并写入 assistant 历史（不再空回复）。
- ✅ wcl-client：内部 import 改走 `@wcl/combat-normalizer`（不再引用 @deprecated
  re-export）；`cached as CombatEvent[]` 加 `Array.isArray` 守卫；4 处 `as XEvent[]`
  强转改为 type guard 过滤（isCastEvent/isBuffEvent/isDamageEvent/isDeathEvent）。
- ✅ ANALYZER_VERSION 与 package.json 同步测试（`analyzer-version.test.ts`）。

**保留 backlog（未修，优先级下调）**
- combat-facts 补 damage/death/target/dispel/interrupt 计算机（四个 analyzer 仍直接遍历
  events，纪律精神未收口——改动面大，待新规则需要时顺势收口）。
- `mergeMetrics` 下沉 analysis-engine；`hardModeLevel` 原始字段内部化。
- web-ui markdown `Entry` 对象化历史 bug 已修（表格/代码块曾渲染为 `[object Object]`），
  `loadSettings` 契约回归（`LlmConfig` 三必填字段默认合并）已修。

> **2026-09-09 Phase R 更新**：上节前三条 backlog 已全部落地——五类事实计算机 +
> 五 analyzer 改消费 Facts（metrics 形状不变，旧测试原样通过）；mergeMetrics 已下沉
> analysis-engine（application re-export 兼容）；web-ui 组件级测试已接
> （jsdom + @testing-library/react 16 用例）。facts view（MCP get_combat_facts）同步
> 增五分节。ANALYZER_VERSION → 0.6.0。详见 AGENTS.md Phase R。
>
> **2026-09-09 Phase S/T 更新**：hardModeLevel 已内部化（RankingReference.top[].keyLevel，
> raw 字段止步 wcl-client DTO）；MCP 新增 `analyze_death_review`；getActors 偶发
> masterData null 已加 3 次退避重试；死亡复盘补治疗缺口（Healing 通道实证后接入，
> EventDataType 清除两个不存在的伪枚举值）。至此 §15 可行动 backlog 全部清零，
> 仅剩 M+ 榜单层数过滤（characterRankings 接口限制，以 pool 标签 + gapVsP50Pct
> 措辞缓解，无进一步解法）。详见 AGENTS.md Phase S/T。

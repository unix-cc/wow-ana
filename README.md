# WCL AI Analyzer

面向《魔兽世界》Warcraft Logs（WCL）的 AI 战斗日志分析系统。

用户只需提供一个 WCL 战斗日志链接，系统即可解析 Report / Fight / Player，通过
确定性 Combat Analysis Engine 计算指标与 Findings，并经 MCP 暴露给 AI，
生成自然语言的战斗分析。

## 架构

```text
WCL GraphQL API
  ↓
WCL Client (packages/wcl-client)
  ↓
Raw Data
  ↓
Analysis Engine (packages/analysis-engine)
  ↓
Structured Analysis Result
  ↓
Application Service (packages/application)
  ├── MCP Adapter (apps/mcp-server)  →  Codex / Claude 等
  └── Web 对话版 (apps/web)          →  大众用户（自带 LLM 配置）
         ↓
        LLM / AI
         ↓
        自然语言解释
```

关键原则：

- **WCL Client ≠ Adapter**：GraphQL 调用集中在 `wcl-client`。
- **Analysis Engine ≠ LLM**：计数、时间、GCD、CD、资源等确定性问题由程序计算。
- **Adapter ≠ Business Logic**：MCP / Web 都只是 Adapter，业务编排在 `packages/application`。
- **Raw Events ≠ AI Context**：不把原始 Combat Events 塞给 LLM，只给结构化 metrics / findings。

## 环境要求

- Node.js >= 18
- pnpm 12+（通过 corepack 使用：`corepack enable`）
- WCL API Client Credentials

## 安装

```bash
corepack enable
pnpm install
pnpm build
pnpm test
```

## 配置 WCL OAuth

复制 `.env.example` 为 `.env` 并填写：

```env
WCL_CLIENT_ID=你的客户端ID
WCL_CLIENT_SECRET=你的客户端密钥
WCL_API_URL=https://www.warcraftlogs.com/api/v2/client
DATABASE_URL=wcl-cache.db
LOG_LEVEL=info
```

说明：

- Token 获取与刷新由 `wcl-client/src/auth.ts` 统一处理并缓存，不会暴露给 Web / MCP / LLM / 日志。
- `WCL_API_URL` 决定请求哪个站点：www 用 `https://www.warcraftlogs.com/api/v2/client`，
  **cn 用 `https://cn.warcraftlogs.com/api/v2/client`**。Token 端点会自动推导为对应
  origin 下的 `/oauth/token`。一个实例只能指向一个站点，切站点需改这里并重启。
- `DATABASE_URL`：SQLite 缓存文件路径，**建议填写**；留空则无持久缓存。
- `.env` 从仓库根目录自动加载（无论从哪个包目录启动），凭据已通过
  `node scripts/check-connection.mjs` 实连验证。

## 启动 MCP

```bash
pnpm --filter @wcl/mcp-server start
```

验证 MCP 是否正常：

```bash
pnpm --filter @wcl/mcp-server verify
```

## 启动 Web 对话版（面向大众）

不需要任何客户端配置。启动后浏览器访问 http://127.0.0.1:8787 即可：

```bash
# 生产：先构建 React 前端（输出 apps/web-ui/dist），再启动后端
pnpm --filter @wcl/web-ui build
pnpm --filter @wcl/web start

# 前端开发模式（热更新，5173 端口，/api 自动代理到 8787）
pnpm --filter @wcl/web start      # 终端 1：后端
pnpm --filter @wcl/web-ui dev     # 终端 2：Vite dev server
```

界面是 React SPA（`apps/web-ui`）：**Chat-first** 单栏对话流（战斗分析 / 团灭复盘 /
报告总览 / 自由对话）+ 历史会话列表；**助手消息是结构化 part 列表**而不是一大段
Markdown —— 折叠的活动步骤（Codex 式）+ 内嵌分析卡片（问题清单 / 基线对比 / 循环判定，
Linear 式信息密度）+ 模型散文，点问题卡片从右侧抽屉展开证据与「期望 vs 实际」。
视觉设计令牌取自 ui-ux-pro-max 设计数据（AI 平台紫 + 青暗色系）。设计契约见
**`docs/ui-architecture.md`**。后端不存在 dist 时自动回退旧版静态页面。

用户只需在页面右上角「设置」里填写自己的 LLM 配置（OpenAI 兼容的 Base URL / API
Key / 模型），配置保存在浏览器 localStorage。后端持有我方 WCL 凭据，自动执行：
解析 URL → 选 fight → 选玩家 → 确定性分析 → 交给用户配置的 LLM 流式生成分析。

- WCL 密钥只存在于服务端 `.env`，不会发给浏览器。
- 原始战斗事件不会发给 LLM，只有结构化 metrics / findings。
- **会话记忆**：按浏览器持久化的 `sessionId` 保存对话历史（前端 `localStorage`
  存 id，服务端历史持久化到同一个 SQLite）。刷新页面会自动恢复聊天记录；分析完
  一场后可直接追问（基于对话上下文），或再输入同场另一名角色名继续分析。
- 玩家列表只显示该场战斗的参战者，并自动识别职业专精（如「兽王猎」），命中
  专精专项规则（当前：兽王猎 / 奥法 / 元素萨 / 血DK / 惩戒骑 / 武器战）时分析
  会自动带上专项 findings 与循环判定流。
- 可选环境变量：`HOST`（默认 127.0.0.1）、`PORT`（默认 8787）。对外提供服务时把
  `HOST` 设为 `0.0.0.0` 并在前面加反向代理（详见 `docs/deployment.md`）。

> 常见问题：若返回 `HTTP 402 balance_depleted`，是**你自己的 LLM 账户余额耗尽**，
> 去对应平台充值或更换 API Key 即可；系统本身已正确把错误透传给页面。
> 若提示 `WCL client credentials are not configured`，确认根目录 `.env` 已填写
> 凭据并重新 `pnpm build`。

## MCP 配置示例

在 Codex / MCP 客户端配置文件中：

```json
{
  "mcpServers": {
    "wcl-analyzer": {
      "command": "node",
      "args": ["/path/to/wcl-ai-analyzer/apps/mcp-server/dist/index.js"],
      "env": {
        "WCL_CLIENT_ID": "...",
        "WCL_CLIENT_SECRET": "..."
      }
    }
  }
}
```

> 不要把真实 Secret 写进任何提交的配置文件。

## MCP Tool 列表

| Tool                   | 说明                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `parse_wcl_url`        | 解析 WCL Report URL，提取 reportCode / fightId / dataType    |
| `get_report`           | 获取 Report 元数据（标题、Owner、时间、Zone）                |
| `get_fights`           | 列出 Report 内的所有 Fight                                   |
| `get_players`          | 列出某 Fight 参与的玩家                                      |
| `get_player_summary`   | 获取单个玩家摘要（id、名字、专精、类型）                     |
| `get_player_casts`     | 返回玩家的 cast 事件（用于深查循环细节，limit 上限 500）     |
| `get_player_buffs`     | 返回玩家的 buff/debuff 事件（limit 上限 500）                |
| `get_player_damage`    | 返回玩家的伤害事件（limit 上限 500）                         |
| `get_player_deaths`    | 返回玩家的死亡事件（limit 上限 500）                         |
| `analyze_player`       | 对单个玩家运行确定性分析，返回 metrics + findings + evidence |
| `get_combat_facts`     | 有界事实视图：施法/GCD/buff/资源/伤害/目标/死亡/驱散/打断    |
| `get_spec_knowledge`   | 按战斗日期解析当时生效的职业知识（含版本与来源）             |
| `analyze_fight`        | 一次性全量分析：findings + score + 排行基线 + 五档判定摘要   |
| `analyze_death_review` | 全队死亡 / 团灭 / 引怪(ADD) 复盘（有界视图，ADD 为线索非定论）|

> `analyze_player` 是核心工具，内部协调多个分析器；它不生成自然语言讲解，
> AI 层再基于结构化结果撰写分析。

## 缓存

SQLite + Drizzle 提供持久化缓存，采用 cache-aside 策略：命中缓存时不再请求 WCL，
未命中则请求并回填。缓存 key 内嵌版本（`analysis:v1:{report}:{fight}:{player}`），
修改分析算法只需递增版本即可避免旧结果污染。

- `packages/storage/src/cache.ts`：`MemoryCache` / `SqliteCache`
- `packages/storage/src/repositories/cache-repository.ts`：类型化、版本化的 `WclCache`
- `WclClient` 通过 `WclClientCache` 接口接入缓存，`wcl-client` 不依赖 `storage`

## 分析引擎

`packages/analysis-engine` 提供确定性、可测试、不依赖 LLM 的战斗分析。每个分析器
接收归一化后的 `AnalysisContext`，输出结构化 metrics：

| 分析器             | 输出                                          |
| ------------------ | --------------------------------------------- |
| Cast               | 每技能次数、首次/末次时间、最短/最长/平均间隔 |
| GCD                | GCD 数量、空转时间、空转比例、空转窗口        |
| Cooldown           | 实际/理论次数、平均/最大延迟、是否漏用        |
| Buff               | uptime、downtime、最大/平均叠层、刷新次数     |
| Damage             | 总伤害、DPS、按技能伤害、暴击/命中分布        |
| Target             | 目标数、切换次数、按目标伤害排名              |
| Death              | 死亡时间、死亡前 N 秒受到的伤害与来源         |
| Resource           | 资源峰值/最低、获得/消耗总量                  |
| Interrupt / Dispel | 次数、按目标分布                             |

## 开发方式

```bash
pnpm build        # 编译所有包
pnpm test         # 运行所有包测试
pnpm lint         # ESLint
pnpm format       # Prettier 格式化
pnpm typecheck    # 类型检查
pnpm ssr-smoke    # SSR 冒烟：构建→临时端口起服务→六项端到端断言（不碰真实缓存）
```

## 测试方式

测试使用 Vitest + fixture / mock，不依赖在线 WCL API。WCL Client 的认证、
GraphQL 请求、分页、限流、URL 解析均已覆盖；Web 的 LLM 流式解析与确定性流水线
（URL → fight → 玩家 → 分析）也有单测。真实 WCL 的 schema 字段已通过 introspection
对齐（如 `ReportFight` 用 `encounterID` / `gameZone`，`owner` 为对象需子查询）。

## 目录结构

```text
apps/
  mcp-server/            # MCP Server（Adapter，供 Codex/Claude 配置使用）
  web/                   # Web 后端（HTTP + SSE + 用户自带 LLM，托管前端 dist）
  web-ui/                # React + Vite 前端（模块导航 + 流式聊天界面）
packages/
  wcl-client/            # WCL GraphQL Client
  combat-normalizer/     # raw WCL → 内部战斗模型（唯一知道 WCL 字段名的地方）
  combat-facts/          # 客观战斗事实（次数 / 间隔 / CD / Buff / 资源 / GCD）
  analysis-engine/       # 确定性分析引擎（消费 Facts + Spec Knowledge）
  storage/               # SQLite / 缓存
  application/           # 业务编排层（AppService / 客户端装配）
  domain/                # 领域类型
  shared/                # 配置 / 日志 / 错误 / 工具
```

数据流：

```text
WCL → wcl-client → combat-normalizer → combat-facts → analysis-engine → Finding + Evidence → AI
```

- `combat-normalizer`：只做字段归一化，WCL API 变化时只改这里。
- `combat-facts`：只描述"发生了什么"，每条 Fact 自带 `evidence`。
- `analysis-engine`：拿 Facts + 职业知识判断"好不好"，产出带 `verdict` / `confidence` 的 Finding。

## 当前进度

- Phase 0 — 项目初始化：完成
- Phase 1 — WCL Client（OAuth / GraphQL / URL Parser / Report / Fight / Actor / Events / Pagination / Rate Limit）：完成
- Phase 2 — Storage（SQLite + Drizzle 缓存，Report / Fight / Actor / Event / Analysis 缓存）：完成
- Phase 3 — 通用 Analysis Engine（Cast / GCD / Cooldown / Buff / Resource / Damage / Target / Death / Interrupt / Dispel）：完成
- Phase 4 — MCP Tools（10 个工具 + Application Service 编排层）：完成
- Phase 5 — BM Hunter 专项分析（5 条规则 + SpecRegistry，已接入 analyze_player 并附带测试）：完成
- Phase A/B/C — 架构重构第一阶段（领域模型 / Combat Normalizer 独立成包 / Combat Facts 层，Analyzer 改为消费 Facts）：完成
- Phase D/E/F — 架构重构第二阶段（Spec Knowledge 包 BM/奥法带 source+confidence+version 与 Registry 按日期选版 / 五档 Verdict Condition→Action 优先级求值器 `analysis-engine/src/priority/` / Finding·Evidence 升级：confidence、expected/actual、expectedAt 时间点对）：完成
- Phase G — AI Reasoning 包 `packages/ai-reasoning`（确定性输入裁剪 buildBrief → Zod 结构化输出 parseAiReport + 来源校验 checkProvenance + JSON_ERROR: 降级出口；web 分析消息已走 brief 裁剪）：完成
- Phase H — MCP 工具对齐（`get_combat_facts` 有界事实视图 / `get_spec_knowledge` 按战斗日期解析知识 / `analyze_fight` 全量分析含五档判定流摘要；4 个裸事件 tool 加 limit 硬上限 500；契约测试）：完成
- Phase I — 双版本号与持久分析缓存（`ANALYZER_VERSION` + 知识版本进 `AnalysisResult.versions` 与缓存 key，版本变更自动失效重算；web/MCP 接线 SQLite 分析缓存）：完成
- Phase J — 固定 fixture 与跨包 integration（`scripts/generate-combat-fixtures.mjs` → `tests/fixtures/combat/*.json` 黄金数据 + 新工程 `tests/integration` 端到端用例）：完成
- Phase 5.5 — 更多职业专项（奥法 / 元素萨 / 血DK，技能 ID 经真实日志验证，实测产出有效 findings）：完成
- Phase O — 副本死亡 / 团灭 / 引怪(ADD) 全队复盘模块（死亡前受击归因 / 团灭聚类 / ADD 线索）：完成
- Phase P — Web UI 系统重构（React SPA + ui-ux-pro-max 设计令牌 + 测试/lint 质量门接入）：完成
- Phase Q — 复审缺陷修复（DB 路径锚定 / arcane_orb 悬空知识 / 元素萨·血DK knowledge 锚点 / registry tiebreaker / 缓存键含时间窗 / web pipeline 补转移）：完成
- Phase R — 复审遗留 P2 收口（combat facts 补 damage/death/target/dispel/interrupt 计算机、五 analyzer 改消费 Facts / mergeMetrics 下沉 engine / facts view 五分节 / web-ui 组件级测试 jsdom+testing-library）：完成
- Phase S — 死亡复盘 MCP 工具 `analyze_death_review`（有界视图 + 契约测试）+ `hardModeLevel` 内部化为 `keyLevel` + README 工具表补全：完成
- Phase T — 死亡复盘治疗缺口（`Healing` 通道实证接线，EventDataType 清除臆造枚举）+ `getActors` 间歇 null 重试：完成
- Phase U — 新专精知识锚点（惩戒骑 / 武器战 从零新建：知识 + analyzer + CD delay 规则 + M+ 降级矩阵；血DK priority 补骨盾维护锚点 v1.1.0；ANALYZER_VERSION 0.7.0）：完成
- Phase V — 真实日志验证 + 时间坐标系修复（report epoch 基准 + fight 相对偏移，knowledgeVersion 从此在真实报告上解析）+ 判定流 M+ 门控与 never-observed 过滤（消除 90%+ 假 mistake）：完成
- Phase W — 坦克防御 CD 延迟判定语义修正（VB/DRW 反应型技能：团本降为 low 参考措辞，M+ 整体静默）：完成
- Phase X — 死亡复盘治疗归因精细化（窗口治疗按治疗者归名 + 治疗者先死归因「治疗者 X 于 N s 前阵亡」）+ getActors 第三间歇形态（masterData.actors null）修复：完成
- Phase Y — 治疗过量归因（overheal 三层打通：区分「没奶」与「奶了但全过量——目标满血后被打爆」）+ getFights 瞬时怪癖重试加固：完成
- Phase Z — SSR 冒烟测试自动化（`pnpm ssr-smoke`：构建→临时端口/临时 DB→六项端到端断言，替代手工冒烟清单）：完成
- Phase AA — M+ 判定流适配（AoE 领域门控 + M+ 默认开门 + digest 按 pull 分段；真实日志复验四专精 mistake≤2%）：完成
- Phase AB — 排行榜基线 pool 断链修复（brief 投影补 pool/keyLevel + web/ai-reasoning prompt 字段路径对齐，历史最佳池护栏真正生效）：完成
- Phase AC — 参考基线可点开 + 技能名中文化（榜单页/榜首实况/本场直链外链 + 池内层级区间 + `gameData.ability` 官方中文名与 `pnpm ability-names` 工具；顺带修复 Warrior/Paladin 拿不到基线）：完成
- Phase AD — 前端改为「Chat + Inline Artifact」（消息 parts 模型 text/activity/artifact + 结构化 findings/基线/循环卡片 + Codex 式可折叠活动 + Linear 式 Finding 抽屉 + 证据时间轴归一到战斗相对；见 `docs/ui-architecture.md`）：完成
- Phase AE — 基线池收到前 10 + 榜首实况可浏览（`REFERENCE_POOL_SIZE = 10` 客户端截断（WCL 无行数参数）+ 10 条日志直链列表 + 提示词补「小样本=上限参照」；`ANALYZER_VERSION` 0.11.0 以失效旧口径缓存）：完成
- Phase AF — 榜首逐场对标「我具体差在哪」（榜单条目带 `report.code`/`fightID` → 用同一套 analyzer 重跑榜首那一场 → 只比速率指标 + 技能频率 + 判定档分布（场景不同则不横比）+ finding 差异；技能中文名来自一次性的 `report.masterData.abilities`；`CompareCard` + 基线卡上的「与榜首逐场对比」按钮；`ANALYZER_VERSION` 0.12.0）：完成
- Phase AG — 爆发期 vs 非爆发期手法对比（探针实证：WCL Buffs 通道不返回爆发 aura 事件（涌动/天神下凡 sourceId 过滤后均无，全量仅部分存在）→ 爆发窗口改为 **cast 锚定**（施放时刻 + knowledge 声明的 `burstDurationMs`）；knowledge 6 专精补爆发标注（奥法涌动 6s / 武器战天神 20s·剑刃风暴 6s·蹂躏者 10s / 惩戒骑复仇之怒 20s / 元素萨风暴守护者 15s·火元素 30s / 兽王猎野性怒火 15s / 血DK 双防御 CD 参考标注；奥术宝珠·巨人打击等短 CD 技能**不**算爆发）+ `burstDurationMs implies abilityId` 不变量；engine 决策流打 `inBurst` 标 + `burstWindows` 输出；对标新增 phase 区块（双方爆发窗口次数 / 每窗 GCD 密度 / 爆发期与平稳期正确率，0 施放=天赋构型差异不横比）；CompareCard 爆发手法表 + 提示词叙述规则；`ANALYZER_VERSION` 0.13.0。真实复验：M+ 黑脸法爆发期 52.2% vs 榜首 60%（其平稳期 57.8% vs 58.4%——差距恰在爆发期）；团本乌拉特克齐夏法爆发期 33.3% vs 平稳期 55.6%；团本对标受限于 cn 站新团本（毒牙深渊 zone 3004）无榜单数据而诚实降级 no-reference）：完成
- Phase AH — 规则遵守度逐条对比（条件桶对齐）：完成
  （用户「手法细节 = 技能优先级」。把两场决策流按**同一条件桶**（每条 Condition→Action 规则成为期望动作的时机）对齐，输出「条件出现时顶尖打了 X%、你打了 Y%」——比频率表细一层（频率表分不清该放没放 vs 不该放放了）。`DecisionRecord` 增 `expectedAbilityId`；`RotationDigest.rules`（RuleAdherenceDigest：按 expectedRuleId 聚合 decisions/obeyed/各 verdict 计数/confidence，cap 12）；reference-compare 增 `rules`（RuleComparison：双方遵守率 + deltaPp + 失误数，`MIN_RULE_SAMPLE=3` 门控——任一边样本 <3 不标差距标「样本少」，低置信度规则（<0.6）随行标注只解释不定责；label 从 knowledge 技能中文名解析）；CompareCard 规则遵守度表 + 提示词叙述规则（优先解释差距最大的规则）；`ANALYZER_VERSION` 0.14.0。真实复验（黑脸法 vs 榜首 Qingxingood）：弹幕规则 94.7% vs 97.1%（-2.4pp，双方都优）；飞弹规则 36.9% vs 38.9%（-2pp）但**失误 29 vs 13**——同遵守率下失误率是对方两倍多，规则级信号成立。测试 net +7（application 3：条件桶对齐/样本门控/省略；web-ui 2：表渲染/样本少标签）；全仓 build/typecheck/test（606 用例）/lint 全绿）：完成
- Phase 6 — AI 分析输出设计（启发式 score + findings 按严重程度排序 + `docs/ai-prompt.md` 指引）：完成
- Web 版 — 面向大众的聊天对话应用（`apps/web`，用户自带 LLM 配置）：完成
- 实连验证 — cn.warcraftlogs.com 真实日志端到端跑通（schema 对齐 / 专精识别 / analyze_player / LLM 流式）：完成
- Phase 7 — Reference Player / 高分玩家对比（聚合基线已落地：`RankingReference` 同副本同专精榜单分位 + `gapVsP50Pct`，Phase AB 修复字段投递；逐场对标已落地于 Phase AF：`AppService.compareToTopRun` + `CompareCard`；爆发期/平稳期手法拆分已落地于 Phase AG：cast 锚定窗口 + 双方 phase 对比；「逐决策参照高分玩家循环」的深度版仍规划中）
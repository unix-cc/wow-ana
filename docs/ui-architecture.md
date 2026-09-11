# 前端 UI 架构

> **一句话**：这是一个 **AI 战斗教练**（Codex 式的对话入口 + Linear 式的信息密度 + WCL 式的数据表达），
> 不是一个 WCL 数据看板。

本文是前端的设计契约。改 UI 之前先读这里；如果改动与本文冲突，先改本文再改代码。

---

## 1. 设计哲学（不可回退的几条）

1. **Chat-first。** 第一版就是单栏对话流，没有传统「报告页」。分析结果**自然地嵌在对话里**。
2. **AI 是入口，分析是结构化数据。** AI 的话只是解释、归因、排序、建议；
   每一个数字、严重度、时间点、链接都来自确定性引擎（`analysis-engine`），不是模型输出。
3. **AI 回复 ≠ 一大段 Markdown。** 一条助手消息是**有序的 part 列表**：`activity → artifact → text`。
4. **渐进披露（progressive disclosure）。** 默认只给结论；证据、期望 vs 实际、逐决策判定点一下才展开。
5. **Activity 可折叠。** 「做了什么」和「说了什么」分开。工具/流程细节默认收起，不淹没对话。
6. **不做的事**：不做 admin dashboard、不铺默认大表格、不让模型自己算数、
   不为每种分析各写一个页面（详见 §6）。

### 抄什么，不抄什么

| 参考 | 抄什么 | 不抄什么 |
|---|---|---|
| **Codex** | 对话 vs 活动分离、可折叠的步骤输出、状态 | TUI 本身、终端配色 |
| **Vercel AI SDK Elements** | message parts / streaming / tool call 的组织方式 | 直接引入其组件库（我们无依赖） |
| **Linear** | Finding ≈ Issue 的信息组织：严重度 / 分类 / 时间 / 证据 / 建议 | 整个工单系统 |
| **WCL** | 时间轴、技能、Buff 的数据表达方式 | WCL 的界面本身 |
| **传统后台 / Element Plus** | —— | 全部 |

---

## 2. 消息模型：Message Parts

一条消息**不是字符串**，而是 part 的有序列表。这是整个前端最重要的一个决定。

```ts
type MessagePart =
  | { type: 'text';       text: string; isError: boolean }
  | { type: 'activity';   steps: ActivityStep[] }
  | { type: 'artifact';   artifact: AnalysisArtifact }
  | { type: 'comparison'; comparison: ComparisonView };
```

当前渲染顺序固定为 **`activity` → `artifact` → `comparison` → `text`**，理由是分工：

- `activity` —— 过程。确定性管线做了什么（读报告 / 解析战斗 / 读名单 / 跑分析器），默认折叠。
- `artifact` —— 结论。卡片：跑分、问题清单、基线对比、循环判定分布。
- `comparison` —— 差距。和榜首那一场的逐场对照（只在用户主动要求时出现，见 §6）。
- `text` —— 解释。模型的散文（Markdown）。**放最后**，因为「有什么问题」由卡片回答，
  「为什么」由文字回答。

一线代码：`apps/web-ui/src/types.ts`（契约）、`hooks/useChat.ts#toParts`（装配）、
`components/ChatCore.tsx#AssistantMessage`（渲染）。

### 为什么不用「让模型输出 JSON」

曾经考虑过，但本项目正确做法是**结构来自引擎、文字来自模型**：

- 模型可以随便说，但**不能决定严重度**——那是 `analysis-engine` 的 `Finding.severity`。
- 模型**不能复述时间点**——`evidence` 里的 `timestamp/expectedAt` 是引擎算的。
- 用户的 LLM 是自带配置的（任何 OpenAI 兼容端点），要求它严格输出 JSON 会大面积失败。

所以 `artifact` 完全由 `apps/web/src/artifact.ts` 从确定性结果投影，与模型无关。
模型只负责 `text` part。

---

## 3. 数据流

```text
用户消息
   │
   ▼
processTurn（确定性管线，apps/web/src/pipeline.ts）
   │  onActivity(step) ──────────► SSE `activity` 事件（running → done）
   │
   ├─ ask-fight / ask-player / guidance / error ──► SSE `reply`（带可选项）
   │
   └─ analysis
        │  service.analyzeFight()  ← 确定性引擎 + 排行榜基线
        │
        ├─ buildAnalysisArtifact() ──► SSE `artifact` 事件（**先于 LLM**）
        │
        └─ streamLlmAndRecord() ─────► SSE `start` → `delta…` → `done`
```

关键点：**`artifact` 在 LLM 开始流式输出之前就发出**，所以卡片先出现，文字随后填进来——
不是等模型写完才渲染。

### SSE 事件表（`/api/chat`）

| 事件 | 载荷 | 前端行为 |
|---|---|---|
| `activity` | `{ step: ActivityStep }` | 按 `step.id` 更新/追加活动步骤 |
| `artifact` | `{ artifact: AnalysisArtifact }` | 设置结构化卡片 |
| `comparison` | `{ comparison: ComparisonView }` | 设置逐场对标卡片（Phase AF） |
| `start` / `delta` / `done` | `{ text? }` | 累加 Markdown 文本 |
| `reply` | `{ kind, text?, fights?, players? }` | 整条替换（确定性回复）+ 可选项按钮 |
| `error` | `{ text }` | 标记错误文本 part |

（artifact 的字段与 cap 见 `apps/web/src/artifact.ts`；基线池大小见 §6。）

### 持久化

`ChatSession.history: StoredMessage[]`，其中 `StoredMessage = { role, content, artifact?, activity? }`。
- **存**：刷新页面后卡片能重新渲染（`GET /api/sessions/:id` 直接返回这些字段）。
- **不发给模型**：`toLlmMessages()` 剥掉 `artifact` / `activity`，只留 `{role, content}`。
  模型不需要（也不该看到）自己的渲染数据。

---

## 4. 组件地图

```text
App.tsx
 ├─ Sidebar            模块 / 会话列表
 ├─ main
 │   ├─ topbar          模块胶囊 + 后端在线状态
 │   ├─ SettingsPanel   LLM 配置（Base URL / Key / Model，仅存浏览器）
 │   └─ ChatCore
 │       ├─ Welcome             空态
 │       ├─ ActivityPanel       ← 折叠的活动步骤（Codex）
 │       ├─ ArtifactView        ← 结构化分析
 │       │   ├─ 运行头部 + 分数
 │       │   ├─ FindingCard × N  ← 线性 Issue 密度的可点卡片
 │       │   ├─ ReferenceCard    ← 基线对比 + 外链 + 「与榜首逐场对比」按钮
 │       │   └─ RotationStrip    ← 五档判定分布
 │       ├─ CompareCard         ← 逐场对标（Phase AF，仅在要求时出现）
 │       └─ Markdown 正文        ← 模型的话
 └─ DetailDrawer     ← 右侧抽屉：证据 / 期望 vs 实际 / 建议
```

`format.ts` 是**纯展示**的格式化函数（`mm:ss.s`、`万/亿`、严重度标签）。
它**只格式化引擎已经算好的值**，不做任何再计算。

---

## 5. 视觉与交互约定

- **单栏对话为主**，抽屉（Drawer）做 Inspector。不常驻三栏——右侧栏只在需要时出现。
- **Finding 卡片**是一行可点的块：编号 / 严重度徽标 / 分类 / 判定档 / 时间 / 标题。
  标题超长省略，不加换行——列表要能扫。
- **严重度颜色语义固定**（`--sev-critical/high/medium/low/info`），与引擎严重度一一对应，
  不允许为「好看」改色。
- **外部链接必须带 `rel="noopener noreferrer"` 且 `target="_blank"`**，
  文案直接说明点开能看到什么（「榜单总览」/「榜首实况 · 名字」/「查看本场原始日志」）。
- **基线卡片必须同时给出三件事**：本场层数、基线池**实际**层级区间、与池中位差距。
  原因见 §7。
- 可访问性：抽屉用 `role="dialog"`，`Esc` 关闭；活动面板按钮带 `aria-expanded`。

---

## 6. 怎么加一种新的结果

例如要加「伤害曲线」「死亡时间轴」：

1. 在 `apps/web/src/artifact.ts` 里加字段（**必须**从确定性结果投影，必须有上限）。
2. 在 `apps/web-ui/src/types.ts` 的 `AnalysisArtifact` 镜像同名字段。
3. 在 `components/` 加一个渲染组件。
4. 在 `ArtifactView.tsx` 里挂上。

**不要**：新建路由、新建页面、让模型返回 HTML、把原始事件数组丢给前端。
`artifact` 每个数组都必须有 cap（现状：findings ≤ 24、每条 evidence ≤ 6、topRuns ≤ 10）——
一场病态战斗不应该把 DOM 撑爆。

### 基线池的大小是「10」，且 UI 与模型看到的条数**故意不同**

- 分析用的基线池 `REFERENCE_POOL_SIZE = 10`（`@wcl/application`）。WCL 每页固定返回 100 条且
  **没有行数参数**（已实测：`limit` 不在字段参数表里），所以 10 是客户端主动截断。
  理由：参考基线回答的是「离顶尖有多远」，10 条足够；100 条会让 pool 文案暗示成一个群体、
  把分位压成噪声，还多传 10 倍数据。
- **UI（artifact）拿全部 10 条**（`MAX_ARTIFACT_TOP_RUNS = 10`），因为池子就这么大，
  每条都带 permalink，玩家可以逐条点开看打法。
- **模型（brief）只拿 3 条**（`MAX_TOP_RUNS = 3`，且只给有链接的）——模型只需要能引用，
  不需要浏览列表。这个不对称是有意的，不要"对齐"它。

### 逐场对标是**显式请求**，不是每次分析的默认动作（Phase AF）

`CompareCard` 回答的是基线卡片回答不了的问题：「我具体差在哪」。

- **入口**：`ReferenceCard` 上的「与榜首逐场对比」按钮，或直接说「和榜首对比 / 我差在哪」。
  按钮**不调隐藏 API**，它发一条普通的用户消息（`COMPARE_PROMPT`）——turn 真的发生过，
  刷新后仍能从历史里复现。
- **为什么不自动跑**：它要对**另一个玩家的另一份报告**重新跑一遍完整分析
  （约十几次 WCL 往返）。自己的那一场通常是缓存命中，对方的不是。
- **为什么能跑**：榜单条目带 `report.code` / `report.fightID`，所以能定位到那一场
  （`RankingReference.top[].reportCode/fightId`）。
- **cap**：技能行 ≤ 8（`MAX_COMPARE_ABILITY_ROWS`），两类 finding 各 ≤ 8。

对标卡片的三条硬规矩（**改这个卡片前必须守住**）：

1. **两场不是对照实验。** 基线是榜首（实测 +20~+21），玩家往往低得多（如 +10）。
   层数 / 装等 / 路线差异都未剥离，因此 DPS 差额**必须**带 note，不许写成「你差 X%」。
2. **只比速率，不比绝对次数。** 两场战斗时长不同，绝对次数不可比。表里给的是
   「次/分钟」与「占比」。这条写进了 `notice`，永远展示。
3. **场景不同就不横比判定档。** 逐决策判定档只在两边 `scenario` 相同时才当结论；
   不同（实测出现过「我 st / 榜首 aoe」）时卡片显式写「不可直接横比」。
   *判断来自数据，不是来自猜测。*

另外：技能名来自 `report.masterData.abilities`（报告级全量技能表，cn 站返回中文名）——
事件里只有 `abilityId`。解析不到名字的技能**直接不进表**，不显示裸 id。

---

## 7. 已知边界与诚实性要求

- **大秘境基线不是同层同侪。** WCL `characterRankings` 无法按钥石层过滤
  （`hardModeLevel` 枚举里根本没有钥石等级，2026-09-10 实测），池子是「该本最高层前 N 名」。
  所以 UI **禁止**出现「同层分位 / 同层排名」；必须写成「与池中位差距」并标出池的层级区间。
- **基线池是「上限参照」，不是人群。** 池只有 10 条，且全是该专精的顶尖记录。
  因此 UI 与提示词都**禁止**「超过 X% 玩家 / 分位」这类人群统计；一律用
  「与池中位差距」（`gapVsP50Pct`）。卡片上永远写明池的样本量（「前 10 名」），
  让读者知道这是小样本。
- **基线池大小变化会改动所有战斗的数值。** 池从 100 收到 10 之后，中位上升、差距变大、
  层级区间收窄（实测同一场：-50.4% → -54.2%，池层级 +19~+21 → +20~+21）。
  这类语义变更**必须同时 bump `ANALYZER_VERSION`**，否则分析缓存会继续吐出旧口径的结果。
- **没有基线时要说没有。** `reference` 缺失时明确说明，不编造名次。
- **`unknown` 是正常结果。** 知识未覆盖时判定为 `unknown`（灰）而不是硬判失误——
  UI 不能把 `unknown` 渲染成问题。
- **对标失败要区分是哪一种失败。** `status` 有四种取值（`ok` / `no-reference` /
  `player-not-found` / `no-data`），每种配一句人话原因（榜单缺、报告私密、名单里没有同名玩家…）。
  非 `ok` 时卡片**不渲染空的表格骨架**——宁可不画，也不给一个看起来像 0 的假表。
- **外链要放在它指代的东西旁边。** 榜首日志的 permalink 在卡片头部右上（紧邻对手名字），
  不放卡片底部——长卡片里底部的链接等于不可见（2026-09-10 实测反馈）。

---

## 8. 测试

- `apps/web-ui/tests/components/ChatCore.test.tsx` —— part 顺序、卡片渲染、活动折叠、
  外链属性、抽屉回调、逐场对标 part、对比按钮发出的消息（`COMPARE_PROMPT`）。
- `apps/web-ui/tests/components/CompareCard.test.tsx` —— 对照表数字、层数前提可见、
  场景不同时的警告、空差异的解释、失败态的诚实降级、外链在**头部**且带 `rel/target`。
- `apps/web-ui/tests/components/DetailDrawer.test.tsx` —— 证据格式化、关闭方式、空证据。
- `apps/web/tests/artifact.test.ts` —— 投影、排序、cap、丢垃圾字段、不编造分数。
- `apps/web/tests/compare.test.ts` —— 对标投影、cap、rotation 展平、失败态透传。
- `apps/web/tests/pipeline.test.ts` —— 活动步骤（running→done/failed）、rotation 透传、
  对比意图识别（且与死亡复盘意图互不干扰）。
- `apps/web/tests/session.test.ts` —— artifact / comparison 持久化 + 发给模型前剥掉。
- `packages/application/tests/reference-compare.test.ts` —— 速率归一化、技能按 id 合并与排序、
  cap、finding 按规则 id 求差、场景一致才判 `comparable`、除零不产生 delta。
- `packages/wcl-client/tests/client.test.ts` —— `getAbilityNames`（`gameID 0` 占位符过滤、
  空名跳过、`masterData` 为 null 时降级为空表）。

改契约（`MessagePart` / `AnalysisArtifact` / `ComparisonView`）时，这几处必须同时更新。

---

## 9. 预览工具（`scripts/preview-conversation.mjs`）

本机 Chromium 的 CDP 通道不稳定（daemon 会掉回 `about:blank`，2026-09-10 两次实测），
所以**截图不可靠**。替代方案：把真实组件 + 真实 `design.css` + 会话 API 里的真实载荷
用 `renderToStaticMarkup` 渲成一个静态 HTML，用来确认布局与文案：

```bash
node scripts/preview-conversation.mjs <sessionId> [outFile]
```

它是**调试辅助**，不是产品面：只验证静态布局，交互（折叠 / 点击 / 抽屉）要靠组件测试。
不要把它当成「渲染正确」的唯一证据——组件级测试才是门禁。

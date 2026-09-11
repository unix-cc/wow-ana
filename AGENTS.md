# AGENTS.md

本项目的开发规范，供编码 Agent 参考。

## 技术栈

TypeScript (strict) / Node.js / pnpm / MCP SDK / GraphQL / Zod / SQLite / Drizzle /
Vitest / ESLint / Prettier。

## 命令

```bash
pnpm build        # 编译所有包（tsc）
pnpm test         # 运行所有包测试（vitest）
pnpm lint         # ESLint
pnpm format       # Prettier 格式化
pnpm typecheck    # 类型检查
pnpm --filter @wcl/wcl-client test   # 单独运行某包测试
```

> Windows 注意：本机 npm 安装的 corepack shim 在 **Git Bash** 下会把路径错转成
> `C:\c\develop\...` 而报 `Cannot find module`。**用 PowerShell 跑 pnpm 正常**；
> Git Bash 下可退化为 `node "C:/develop/env/nvm/nodejs/node_modules/corepack/dist/pnpm.js" <args>`
> 或直接用 `npx tsc -p <pkg>/tsconfig.json` / `npx vitest run`。

## 架构约束

- 所有 WCL GraphQL 调用集中在 `packages/wcl-client`。
- 原始 WCL 字段名只出现在 `packages/combat-normalizer`，其他包不得依赖 raw 字段。
- 所有确定性分析算法集中在 `packages/analysis-engine`。
- **基础统计（次数 / 间隔 / 覆盖率 / 资源 / GCD）先由 `packages/combat-facts`
  计算成 Combat Facts，Analyzer 消费 Facts，不再直接遍历 `CombatEvent`。**
- **职业知识（`@wcl/spec-knowledge`）是 Spec Knowledge 的唯一来源**：技能 ID、
  CD、Buff 期望覆盖、`Condition → Action` 优先级都带 `source` + `confidence` +
  `knowledgeVersion` + `patch`。禁止在 Prompt / analyzer 常量里硬编码新知识；
  旧 `specs/*/constants.ts` 属历史兼容，新规则一律从 knowledge 取数。
- MCP（`apps/mcp-server`）仅作为 Adapter，不实现业务逻辑。
- 不把原始 Combat Events 直接交给 LLM。
- 不把 WCL Client Secret / Access Token 暴露给 MCP / LLM / 日志。

## 分层数据流

```text
WCL → wcl-client → combat-normalizer → CombatEvent（内部战斗模型）
    → combat-facts → Combat Facts（客观事实）
    → analysis-engine（Facts + Spec Knowledge → Finding + Evidence）
    → ai-reasoning → 最终报告
```

Facts 只描述"发生了什么"，不判断"好不好"；判断由 Analysis Engine 产出 `Verdict`
（correct / acceptable / suboptimal / mistake / unknown）。低置信度知识
（`confidence < 0.6`）不得产出 `mistake`。

## 代码规范

- 开启 `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`。
- 禁止 `any`；第三方非结构化数据用 `unknown` + Zod / type guard 收窄。
- 可选字段类型显式包含 `| undefined`，以兼容 `exactOptionalPropertyTypes`。
- 测试使用 mock / fixture，不依赖在线 WCL API。
- 每个重要 Finding 必须可追溯到 Evidence。

## 开发阶段

- Phase 0 项目初始化：完成
- Phase 1 WCL Client：完成
- Phase 2 Storage：完成
- Phase 3 通用 Analysis Engine：完成
- Phase 4 MCP Tools：完成
- Phase A 领域模型（CombatFact / FactSet / Verdict / Evidence 升级 / 版本与知识来源）：完成
- Phase B Combat Normalizer 独立成包（wcl-client 保留兼容 re-export）：完成
- Phase C Combat Facts 层（Cast / GCD / Cooldown / Buff / Resource，Analyzer 改为消费 Facts）：完成
- Phase D Spec Knowledge 包（BM / 奥法知识：abilities / buffs / resources / cooldowns / Condition→Action
  priority，均带 source + confidence + knowledgeVersion + patch，Registry 按 fight date 选版）：完成
- Phase E 优先级求值器 Condition → Action + 五档 Verdict：完成
  （`src/priority/`：types → knowledge-index → state(事件重放) → evaluator(五档)；
  通过 index.ts 导出，**未接入默认 SpecRegistry** 以保兼容）
- Phase F Finding/Evidence 升级：完成
  （core/finding.ts comparisonFinding/evidencePoint/severityForVerdict；Evidence 增 expectedAt
  时间点对；BM+奥法 9 规则与 makeCooldownDelayRule/makeGcdIdleRule 工厂补 confidence(取自
  spec-knowledge)/expected/actual/fightId；priority/verdict-findings.ts + rotation.ts
  evaluateRotation 端到端；blood/elemental 无知识锚点暂不标 confidence，待其 knowledge 落地）
- Phase G AI Reasoning 包 + 结构化输出：完成
  （packages/ai-reasoning：buildBrief 确定性输入裁剪（severity 排序 findings/evidence/描述截断、
  metrics 叶子化 key 排序限量、reference 去 top[] 整列投影）→ AnalysisBrief；SYSTEM_PROMPT
  （explain-not-compute + verdict/confidence 门控 0.6 + JSON_ERROR: 降级出口）→ buildUserContent；
  Zod AiReport（§23 形状，AI finding 必带 sourceId）+ parseAiReport（剥离围栏/散文）+ 
  checkProvenance（sourceId ∈ brief.sources、priority 唯一）；未写死任何技能 id/CD 数值。
  web server.ts 的 buildAnalysisUserMessage 已改走 buildBrief + buildUserContent（token 裁剪，
  系统提示保持教练式 markdown，未强制 JSON 回复——结构化回复契约留给 MCP/后续前端渲染接线））
- Phase H MCP 工具对齐：完成
  （新增 get_combat_facts / get_spec_knowledge / analyze_fight 三 tool；
  application 侧：analysis-views.ts（buildCombatFactsView 有界事实视图 + buildRotationDigest 判定流摘要）、
  AppService 新方法 getCombatFacts/getSpecKnowledge/analyzeFight（analyze_player 行为不变，analyzeFight =
  runAnalyzers + evaluateRotation 判定 findings 并入重算 score + reference + rotation digest）；
  4 个裸事件 tool（casts/buffs/damage/deaths）加 limit 可选参（schema 上限 500，服务端 clamp [1,500]，
  防宿主 AI 原始事件泛滥）；analyzeFight 支持 include/cooldowns 透传；
  契约测试 tools-contract.test.ts（schema/超限拒绝/错误降级/服务调用参数）+ application 13 用例含 limit
  钳制/facts 视图/知识解析（未知专精 throw）/analyzeFight digest）
- Phase I 双版本号（analyzerVersion / knowledgeVersion）：完成
  （analysis-engine 导出 ANALYZER_VERSION 常量；AnalysisResult 增可选 versions?: AnalysisVersion；
  storage getAnalysis/setAnalysis 增 versions 参数，key=analysis:v{v}:{analyzerVersion}:
  {knowledgeVersion??'none'}:{report}:{fight}:{player}——ANALYSIS_VERSION 整数降级为缓存结构版本，
  内容失效由双版本 key 自动达成；AppService 构造器增可选 analysisCache?: Pick<WclCache,
  'getAnalysis'|'setAnalysis'>，不传则保持每次全算；analyzePlayer/analyzeFight 读穿缓存（命中跳过
  runAnalyzers + rankings fetch，miss 回填，result 统一带 versions；analyzeFight 命中时仍用 events 本地
  重算 rotation digest）；buildAnalysisVersion 用 knowledgeRegistry.resolve(player, fightTime) 取当时生效
  知识版本，无知识 spec（如 Demonology）versions 只含 analyzerVersion；web/mcp buildContext 已传
  database.cache 启用 SQLite 持久分析缓存；测试 storage 9（版本隔离 3 新增）+ application 18（+5））
- Phase J 测试重构（tests/fixtures 固定 fixture + integration）：完成
  （scripts/generate-combat-fixtures.mjs 可复现生成器 → tests/fixtures/combat/{hunter-bm-basic,
  mage-arcane-basic}.json：CombatEvent 时间线 + fight/player/report 常量 + meta（expectedFindingIds /
  expectedRotationFinding，作者意图即黄金断言）；勿手编 JSON，改场景=改生成器重跑；新 workspace 工程
  tests/integration（@wcl/integration，pnpm-workspace + vitest.workspace 均已接入），
  tests/fixtures-sanity.test.ts（8：结构/时间单调/类型合法/meta 意图）+ tests/analyze-fight.integration.
  test.ts（3：BM fixture→AppService 端到端产出 3 期望 finding + versions.knowledgeVersion=1.0.0；
  缓存命中不重拉 rankings；奥法 salvo-12+missiles → rotation mistake arcane.orb_low_charges 并入
  findings，digest knowledgeVersion=1.2.0）。integration 依赖各包 dist，先 pnpm build 再 pnpm test；
  tests/fixtures/wcl/ 保留给将来真实脱敏 WCL 原始响应）
- Phase K 修复 audit §10 真实缺陷：完成
  （K1 死亡分析：loadPlayerEvents / getPlayerDeaths 改为按 targetId=playerId 拉 WCL Deaths
  （死者是 target），并新增 dataType:'DamageTaken' + targetId=playerId 喂 DeathAnalyzer 死亡前
  伤害窗口——受击事件 sourceId≠player，不会污染 damage done / target 分析（两 analyzer 均按
  sourceId===player 过滤）；K2 Debuffs 数据源：新增 dataType:'Debuffs' + sourceId=playerId 拉取，
  Buffs 结果只保留 buff 系列（type==='buff'），debuff 事件以 Debuffs dataType 为唯一权威源
  （防 WCL Buffs 也含 applydebuff 时双计）——flame-shock-uptime 等 debuff 规则的数据前提就位；
  K3 metrics 防覆盖：runAnalyzers 裸 Object.assign 换成 mergeMetrics 守卫（同键异值 → throw，
  同值 / undefined 幂等跳过），metrics.spec 经同一守卫写入，静默覆盖转为开发期即时错误。
  application 新增 6 用例：K1 拉取语义 + takenTotal 窗口 + 受击不入 damage、K2 双计回归防护
  （Buffs 伪含 applydebuff 时 uptime 仍按单次计）、K3 守卫单元测试。全仓 typecheck/lint/
  test 13 工程绿。audit §10.1/2/4 修复，§10.5（helper 内 as 强转）保留为 backlog）
- Phase M 真值修复（真实日志验证后纠正分析语义）：完成
  （用真实报告 fXdMjWKJbpna6yHv fight13 元素萨复现：a) K2 假设被证伪——WCL Debuffs
  dataType+sourceID=玩家 返回的是「玩家承受」而非「玩家施加」的 debuff，flame-shock-uptime
  曾恒 0%；b) 大秘境是整本多目标场景，单目标 DoT 覆盖率 / GCD 空转模型不成立 → 新增
  fight-context.ts（isMythicPlusRun / mythicPlusKeyLevel，zone 名含 mythic+），flame-shock
  规则大秘境跳过、首领战改按 Flame Shock 周期伤害事件链（无数据则静默，杜绝 0% 假警报）；
  makeGcdIdleRule 大秘境跳过；元素萨 analyzer 对 FE 0 次使用在大秘境降 low+天赋免责；
  c) reference 排行榜：characterRankings 经实测忽略 difficulty/size（恒返回历史最高层
  top100）→ RankingReference.source 增 pool 语义标签 + keyLevel，player 增 gapVsP50Pct
  （相对池中位 %），ai-reasoning 同步投影，SYSTEM_PROMPT 禁止在「全层历史最佳池」上用同层
  分位措辞；d) ANALYZER_VERSION 0.1.0 → 0.2.0 使旧缓存自动失效。analysis-engine +8 用例
  （M+ 门控 / FS 伤害链 / 静默），115 全绿；全仓 typecheck / test / lint 全绿）
- Phase N 奥法知识纠正（Arcane Power 残留清除）：完成
  （真实日志复现：规则仍挂 12042/120s，但 Arcane Power 已于 Dragonflight 10.0
  重做为 Arcane Surge（365350）、10.1.5（2023-07）完全移除 → 每场分析恒伪造
  「奥术强化 0 次使用、理论 N 次」假警报。修复：spec-knowledge mage-arcane 删
  arcane_power（abilities+cooldowns）、surge 正式立为爆发 CD（cooldownMs 90s，
  来源 wowhead 328151 + icy-veins 12.1，confidence 0.7），knowledgeVersion
  1.2.0 → 1.3.0；legacy constants 换 arcaneSurge；规则文件改
  arcane-surge-delay.ts（id → arcane_mage.arcane_surge_delay，CD/confidence 从
  knowledge 读取不硬编码）；奥法 analyzer 仿元素萨：M+ 整本战斗把「基本未使用」
  high 降 low + 爆发随波次对齐免责；ANALYZER_VERSION 0.2.0 → 0.3.0。engine
  +5 用例（120 全绿：12042 忽略回归 / 90s 理想槽位 / M+ 降级 / 团本保持 high /
  gcd idle 门控），spec-knowledge 16 绿，全仓 typecheck / test / lint 全绿）
- Phase O 副本死亡 / 团灭 / 引怪(ADD) 复盘模块：完成
  （新增 engine `combat/death-review.ts` 纯函数 + `combat/roles.ts`（坦克/治疗
  职责判定）+ AppService.analyzeDeathReview 全队级方法 + web 对话意图分支
  （问「死亡原因 / 团灭 / 谁add」→ 自动跑复盘喂 LLM）+ SYSTEM_PROMPT 复盘铁律。
  真实日志实测修正：WCL DamageTaken 的 **sourceID 参数=受害者**（此前 K1 用
  targetId 是错通道，恒空/畸形）且事件时间为 report-absolute → 死亡前受击归因
  数据源真正打通（loadPlayerEvents 同步改为 sourceId）。add 判定基于「死亡窗口
  内怪首次被谁接触 + 时序」产出 confidence 线索而非定论（无仇恨表）。engine
  +13 用例（133 全绿），application +2（26 全绿，含 K1 通道断言强化）；
  ANALYZER_VERSION 0.3.0 → 0.4.0）
- Phase P Web UI 系统重构（React SPA + ui-ux-pro-max 设计令牌）：完成
  （新增 `apps/web-ui`（React 19 + Vite 7）：模块导航（战斗分析 / 团灭复盘 /
  报告总览 / 自由对话，纯前端 onboarding 层）+ 流式聊天核心（SSE delta 增量
  渲染 + ask-fight/ask-player 选项卡）+ 会话侧栏（建/切/删，localStorage 持久
  sessionId）+ LLM 设置面板。**后端契约零改动**：全部复用 apps/web 的
  /api/chat SSE 与 /api/sessions；Node 后端优先托管 web-ui/dist（存在时），
  回退旧 public/，含 SPA fallback。设计令牌取自 ui-ux-pro-max skill 设计数据
  （colors.csv「AI/Chatbot 平台」行：primary #7C3AED 紫 + CTA #06B6D4 青、
  暗色 bg #0F0F23；severity 五色保留确定性分析语义）。质量门接入：vitest 25
  用例（markdown 渲染器 / modules 定义 / SSE 分帧解析含跨 chunk 断帧重组 /
  非 200 错误降级）+ 根 eslint 配置 files 扩到 .tsx。**测试抓出并修复两个
  真实 bug**：markdown.ts 表格/代码块 push 对象被 join 成 '[object Object]'
  （聊天中带表格或代码块的回复显示乱码）；api.ts loadSettings 在无
  localStorage / 存量 JSON 缺字段时返回 {} 违反 LlmConfig 契约（现为默认值
  合并）。`.ssr-smoke.mjs` SSR 渲染冒烟；端到端实测：/ 与 hashed assets 与
  SPA fallback 均 200、/api/sessions 返回 SQLite 持久会话、空 LLM 配置
  POST /api/chat 400 中文错误。全仓 typecheck / test（14 工程）/ lint 绿。
  开发流：`pnpm --filter @wcl/web-ui dev`（5173，/api 代理 8787）；生产：
  先 `pnpm --filter @wcl/web-ui build` 再 `pnpm --filter @wcl/web start`）
- （A–P 收官；复审见 docs/architecture-audit.md §15（2026-09-09 全量复审，P1×3））
- Phase Q 复审缺陷修复（§15.5 计划全落地）：完成
  （P1-1 DB 路径分裂：database-service 改走 @wcl/shared config + envRootDir，相对
  DATABASE_URL 锚仓库根解析，env 双轨收口；P1-2 arcane_orb 悬空：knowledge 1.4.0 补
  cooldownMs 20s（外部实证），条件完整性测试加「cooldownReady key 必有 CD」断言，连带修
  arcane_charge 恒真（无 abilityId buff 的 buffStacks 断言降级 unknown），golden 场景改锚
  arcane.blast_builder；P1-3 元素萨/血DK knowledge v1.0.0 落地（带 source+confidence），
  六条规则 CD/confidence 改从 knowledge 读取，downgradeForDungeon 提共享 helper，
  ANALYZER_VERSION→0.5.0+同步测试。P2 批：registry 排序加 knowledgeVersion tiebreaker、
  getBySpec* 取最新；eventQueryHash 加 startTime/endTime（WclClientCache 接口同步）；
  checkProvenance 强制 sourceId 唯一；web pipeline 补 ask-fight 认新 URL / ask-player 放行
  死亡复盘 / death-review 缺 ctx 返回 guidance 并入历史；wcl-client 改 import
  @wcl/combat-normalizer、cached 事件加 Array.isArray 守卫、4 处 as 强转改 type guard
  过滤。测试 +9（registry tiebreaker×2 / hash 窗口 / provenance 唯一 / pipeline 转移×3 /
  analyzer-version / cooldownReady 完整性）。全仓 build / typecheck / test（15 工程）/ lint 绿。
  修复细节见 docs/architecture-audit.md §15.6。）
- Phase R 复审遗留 P2 收口（combat facts 全类收编 + mergeMetrics 下沉 + web-ui 组件测试）：完成
  （R1 combat facts 收口：domain/fact.ts 增 damage/death/target/dispel/interrupt 五组事实类型
  （DamageFacts 含 first/lastTimestamp、DeathIncidentFact 含死亡前受击窗口、TargetFacts 含
  switches），FactSet 增同名可选组 + listFacts 扁平化；combat-facts 新增五台计算机
  （damage/deaths/targets/dispels/interrupts，语义与旧 analyzer 逐行对齐——死亡窗口含起点、
  无 targetId 事件不计 switch 但计入 count），buildCombatFacts 增 opt-in 布尔开关
  （damage/death/target/dispel/interrupt，默认不计算保持成本轮廓）；analysis-engine 五个
  combat analyzer 全部改为消费 Facts（cast analyzer 同款模式），metrics 形状逐字段不变
  ——既有 damage/deaths/targets/interrupts-dispels 测试原样通过即回归证明。R2 facts view：
  application CombatFactsView 增五分节（damage dps/activeTimeMs + abilities Capped、
  deaths takenSample Capped、target targetsCapped、dispel/interrupt byTargetCapped，
  FACTS_VIEW_OPTIONS 增六项上限）；AppService.getCombatFacts 默认开五组；
  MCP get_combat_facts 描述同步。R3 mergeMetrics 下沉：analysis-engine
  core/merge-metrics.ts（application re-export 兼容），app-service 改 import engine。
  R4 web-ui 组件级测试接入：devDeps +jsdom +@testing-library/react@16；vitest.config
  environmentMatchGlobs（tests/components/** → jsdom），include 扩 .tsx；tsconfig include
  扩 tests；16 用例覆盖 SettingsPanel（预填/trim 保存/已保存指示/onClose）、Sidebar
  （模块高亮/切换/会话空态/删除 stopPropagation/设置）、ChatCore（欢迎页快捷 chip/
  user 纯文本 vs assistant markdown html/error class/options 选中回传/Enter 提交且
  Shift+Enter 换行/流式禁用/空输入禁用/LLM 未配置 placeholder）。ANALYZER_VERSION
  0.5.0→0.6.0。全仓 build / typecheck / test（15 工程，web-ui 41）/ lint 全绿。
  遗留 backlog：① M+ 榜单无法按层数过滤（接口限制）；② hardModeLevel 原始字段内部化
  （DTO 边界内可接受））
- Phase S 死亡复盘 MCP 工具 + 字段内部化：完成
  （S1 新增 MCP tool `analyze_death_review`（Phase O 遗留「web 闭环优先」补齐）：application
  analysis-views.ts 增 buildDeathReviewView 有界视图（DeathReviewView：deaths/wipes/adds
  三段全带 Capped 标记与真实 count，death 行含 cause 归因/killer 最后一击/topSources 前 3
  攻击者，add 行保留 confidence+note+touchedBy 线索语义；FACTS_VIEW_OPTIONS 增
  reviewDeaths 20/reviewTopSources 3/reviewWipes 5/reviewAdds 10 四项上限）；insight.ts
  注册 tool（入参 reportCode+fightId+可选 wipeGapMs，M+ 默认 60s 聚类窗的逻辑在
  AppService 不在工具层），工具描述明写「ADD 是线索非定论、无证据不得指责玩家」；
  契约测试 +3（成功视图/省略 wipeGapMs 不传参/错误降级），server.test 工具清单同步。
  S2 hardModeLevel 内部化：engine RankingReference.top[].hardModeLevel → keyLevel
  （语义化：keystone/hard-mode 层级），raw 字段名止步于 wcl-client DTO 边界（app-service
  映射处注释说明）；ai-reasoning brief 本就整列丢弃 top[]，无下游破坏。
  S3 README 同步：MCP 工具表补 4 个新 tool（get_combat_facts/get_spec_knowledge/
  analyze_fight/analyze_death_review）+ limit 上限说明；进度表补 Phase Q/R/S。
  application analysis-views 测试 +3（投影/capping/空复盘诚实）。全仓 build / typecheck /
  test（15 工程）/ lint 全绿。遗留 backlog 仅剩：M+ 榜单无法按层数过滤（接口限制））
- Phase T 死亡复盘治疗缺口 + getActors 重试 + EventDataType 枚举纠偏：完成
  （T1 治疗缺口判定（Phase O 遗留「死亡窗口只喂受击没喂 heal」）：**先实测再接线**——探针
  scripts/_probe-healing*.mjs 用真实报告钉死通道语义：WCL EventDataType 枚举里根本没有
  'HealingDone'/'HealingTaken'（API 直接报错并建议 'Healing'），本地手维护联合类型里这两个
  是臆造值已删除；`Healing + targetID=受害者` 返回获得的治疗（黑脸法 #5 实测 1872 条有效
  /17.5M），amount>0 才是有效治疗（全过量行为记 0），且该 dataType 混返 heal/buff/other
  必须按 type==='heal' 过滤。实现：analyzeDeathReview 每死者并行拉 DamageTaken+Healing 双
  通道；buildDeathIncident 增第 4 参 healingEvents，DeathIncident 增 healingReceived/
  healCount，summary 增三态措辞（无有效治疗 / 缺口 N / 已覆盖受击），无受击数据时不出现
  治疗措辞（no-data 不暗示治疗失职）；web 死亡明细行与 MCP analyze_death_review 视图同步
  暴露 受击/有效治疗 两列。T2 getActors 间歇 masterData null（Phase O 记录未根治）：
  RawActorsQuery 类型纠正 masterData 可空；fetchActorsWithRetry 有限重试 3 次（250ms
  递增退避），report 缺失（真 404）不重试直接 WclReportNotFoundError，重试耗尽给明确
  「transient API quirk」错误；缓存读出非数组自愈回源。测试 +7（wcl-client 3：null 重试
  成功/耗尽明确报错/404 不烧重试；engine death-review 3：有效治疗过滤/零治疗诚实/无受击
  不提治疗；application 1：no-healing vs insufficient-healing 三态 + Healing 通道
  targetID 断言）。死亡复盘不进分析缓存，无需 bump ANALYZER_VERSION。全仓 build /
  typecheck / test（15 工程）/ lint 全绿）
- Phase U 新专精知识锚点（惩戒骑 + 武器战从零新建；血DK priority 扩充）：完成
  （用户指定方向「补 spec knowledge」，从缓存实际分析记录确认奥法/元素萨已覆盖后选定三专精。
  U1 惩戒骑（specId 70，v1.0.0）：知识 paladin-retribution.ts——AW 31884/120s（wowdb）、
  Execution Sentence 343527/60s（icy-veins 12.1 明文）、Wake of Ashes 255937/45s、
  Blade of Justice 184575 / Final Verdict 383328（Blizzard 论坛 spell dump 实证）、
  圣能上限 5；未验证 id（Divine Toll / Art of War / Hammer of Light）一律留 undefined 保持
  休眠（arcane_charge 同款纪律，并有测试钉死「priority 不得引用休眠 buff」）。analyzer 三条
  CD delay 规则 + gcd idle，M+ 下三个零施放 finding 全降 low 并注明辐耀荣光构型下 AW 非主动
  技能。U2 武器战（specId 71，v1.0.0）：知识 warrior-arms.ts——Colossus Smash 167105/45s
  （wowdb 实证）、Avatar 107574/90s、Bladestorm 227847/90s、Rend 12.1 回归武器战专属、
  Demolish 12.1 固定 30s（无 id 休眠）、Rage cap 100；note 明示 Tactician/Anger Management
  使实际 CD 常短于 45s——延迟模型只罚晚不罚早（有专门测试：30s 间隔连发不触发）。
  analyzer 三条 CD delay + gcd idle，M+ 下 Avatar/Bladestorm 零施放降 low（可选天赋），
  **Colossus Smash 是必点技能零施放保持 high**（与惩戒骑三降的差异点）。U3 血DK v1.0.0→
  1.1.0：bone_shield 补 stacks:true，priority 增唯一锚点 marrowrend@骨盾≤3（conf 0.6），
  防御 CD 仍刻意不入列（fight-driven，Phase M/N 假警报教训）；Runic Power 阈值待 WCL
  资源标签实证后再补。双 registry 注册（engine SpecRegistry 70/71 + spec-knowledge
  DEFAULT 列表）。ANALYZER_VERSION 0.6.0→0.7.0（package.json 同步）。测试 +11
  （engine 8：延迟/准点/提前不罚/零施放/M+ 降级矩阵；spec-knowledge 3：新条目完整性/
  休眠不变量/血DK priority 锚点+防御不入列）。全仓 build/typecheck/test（15 工程，engine
  26 文件）/lint 全绿；服务已用新 dist 从仓库根重启（8787 双 200）。踩坑：同一文件多个
  Edit 并行再次触发丢改动（death-knight-blood.ts 的版本 bump 丢失，grep 复查才发现）——
  同文件编辑必须严格串行，此教训已两次实证）
- Phase V 真实日志验证 Phase U + 时间坐标系修复 + 判定流域门控：完成
  （用户提供 fXdMjWKJbpna6yHv fight13（含血DK/奥法/元素萨/武器战）验证。探针
  scripts/_probe-phase-u.mjs 跑通 4 专精分析，连带发现并修复两个被掩盖的深层 bug：
  **V1 时间坐标系 bug（Phase I 遗留）**：WCL 的 report.startTime 是 epoch、fight.startTime
  是 report-relative 偏移（probe 实测 fight13 = 25,302,116ms；事件与 fight 同为 report
  坐标系，delay 规则的 elapsed 数学本来就对），但 buildAnalysisVersion /
  getSpecKnowledge / priority/rotation.ts 三处把 fight.startTime 直接当 epoch 传给
  knowledgeRegistry.resolve → 1970 < effectiveFrom 2026-01-01 → **真实报告上
  knowledgeVersion 恒缺失、rotation 判定流从未运行过**（缓存键里的 'none' 一直可见但
  无人起疑）。修复 = report.startTime + fight.startTime。同步纠正：fixtures 改为真实
  坐标系形状（report epoch 基准 + fight 50s 偏移，生成器改后重跑；sanity 测试加
  「绝不允许退回 fight-is-epoch 形状」不变量）、engine test helper makeContext 增
  REPORT_EPOCH_BASE、application 增真实坐标系回归测试。
  **V2 判定流域门控（坐标系修复后暴露）**：真实 M+ 数据上 rotation verdict 流
  90%+ 假 mistake（血DK 922/1011、武器战 830/902）。三类根因：a) 从未施放的技能被
  冷却重放视为永久就绪 → 恒为期望动作（FE 133 次 / Bladestorm 登顶）——不可区分
  「没点天赋」；b) 骨盾叠层 ±1 重建 + 开怪前 buff 不回溯 → 层数漂移恒低；c) M+ 整本
  战斗本就违反优先级模型全部假设（Phase M 同款裁决）。修复：evaluateRotation 对 M+
  整体静默（isMythicPlusRun 门控，findings 空 + digest 无）+ **never-observed 过滤**
  （行动技能全场 0 施放的 priority 规则整条剔除——零使用覆盖归 spec 规则层，其带
  天赋免责降级）+ 血DK marrowrend 锚点 confidence 0.6→0.5（叠层漂移使其只能解释
  永不定责）。fixtures/priority-rotation 测试相应增 blast 观察 cast（blast_builder
  需被观察才可为期望动作）。最终真实 fight13 验证：4 专精 knowledgeVersion 全解析
  （1.4.0/1.1.0/1.0.0/1.0.0），M+ rotation: none，findings 干净——奥法 surge delay
  medium、血DK DRW/VB delay、武器战 Avatar delay + Bladestorm 零施放降 low 英雄天赋
  免责（实测该战士为 Colossus 构型，歧义处理正确）。ANALYZER_VERSION 0.7.0→0.8.0。
  测试净增：application +1（坐标系回归）、engine +2（M+ 门控 / never-observed）、
  sanity +1（坐标系不变量）；fixtures 重新生成。全仓 build/typecheck/test（15 工程）/
  lint 全绿；服务已新 dist 重启（8787 双 200）。经验：**「知识从未解析成功」这类
  静默失效最可靠的暴露途径就是真实日志端到端跑一遍**；缓存键/输出里的常量异常
  （'none'）值得追根）
- Phase W 坦克防御 CD 延迟判定语义修正（Phase V 遗留措辞问题）：完成
  （Phase V 验证暴露：血DK 知识文件自己声明「坦克防御技能使用是战斗驱动的，编码
  CD 槽位会产生 Phase M/N 同款假警报」，但 VB/DRW delay 规则仍在 M+ 产出「DRW
  平均延迟 30s（high）」的语义错误指控（该坦克按承压节奏开了 15 次）。修复两层：
  W1 makeCooldownDelayRule 增 `defensive` 选项——反应型防御 CD 的 delay/零施放
  finding 一律 cap low + 「参考」措辞（标题「使用节奏偏晚（参考）/使用次数偏少
  （参考）」、描述与 recommendation 注明按需使用不定责）；VB/DRW 规则启用。
  W2 血DK analyzer M+ 门控：整本战斗里槽位模型无意义，VB/DRW 两条规则在
  isMythicPlusRun 下整条跳过（ruleIds 同步移除，骨盾/gcd 规则保留自门控）。
  团本行为：延迟/零施放 finding 保留但降为 low 参考。ANALYZER_VERSION 0.8.0→0.9.0。
  测试 blood.test 重写 +3（防御 cap low+措辞 / 零施放 cap low / M+ 跳过两条规则）；
  真实 fight13 复验：血DK findings 2→0、score 77→100（诚实：按需开技能的坦克不再
  被误指控），其余三专精输出不变。全仓 build/typecheck/test（15 工程）/lint 全绿；
  服务已新 dist 重启（8787 双 200））
- Phase X 死亡复盘治疗归因精细化 + getActors 第三形态修复：完成
  （用户场景：YR1c6fNvbGjtVdgH fight1「密谋小径」团灭——Phase O 已实测首倒治疗西爱→
  41s 连锁全灭，但死亡明细只能说「窗口内无有效治疗」，说不出「治疗者已阵亡」。
  X1 治疗归因（engine death-review.ts）：DeathIncident 增 healers[]（窗口内有效治疗
  按治疗者归因，带名字/次数/总量，summary 显示「来源 A、B」）+ healerDiedBefore
  （有治疗缺口时，死亡时间线里最近一个先于死者阵亡的治疗者：名字/提前 N ms/
  hadHealedVictim——该治疗者此前是否治疗过死者，强归因标记；条件：takenTotal>0 且
  healingReceived<takenTotal 且死亡者非本人 且间隔 ≤90s（M+ 级联 30-60s 实测）。
  措辞「治疗者 X 于 N s 前阵亡，此前曾治疗该玩家」——证据陈述不定责（治疗者可能死于
  同一机制）。零治疗/覆盖/缺口三态措辞均带归因。X2 接线：analyzeDeathReview 传
  priorDeaths/roleById/playerNameById；view（ReviewDeathView 增 healers cap 2 +
  healerDiedBefore）；web 死亡行加〔治疗者 X 于 N s 前阵亡〕/〔治疗来源：A、B〕。
  **真实复验（fight1）**：4 个后续死亡全部正确归因西爱 29.6/39.2/41.0/41.0s 前阵亡，
  与 Phase O 的 41s 级联记录吻合；西爱本人死亡无归因（正确）。
  X3 顺手修复 getActors 第三种间歇形态：**masterData 非空但 actors 为 null**（此前
  只建模了 masterData: null；实跑当天就撞上，裸 TypeError 穿透重试）。类型改
  actors: Array|null，守卫改 Array.isArray(masterData.actors)，重试覆盖该形态。
  测试 +7（engine 5：归因/阵亡归因含 hadHealedVictim/非治疗不归因/超窗不归因/
  覆盖不归因；wcl-client 1：第三形态重试；application view 1 处断言扩展）。
  死亡复盘不进分析缓存，无需 bump ANALYZER_VERSION。全仓 build/typecheck/test
  （15 工程）/lint 全绿；服务已新 dist 重启（8787 双 200）。遗留：治疗过量归因
  （overheal 字段需打通 wcl-client DTO→normalizer→domain，本轮刻意未做））
- Phase Y 治疗过量（overheal）归因 + getFights 瞬时加固：完成
  （收 Phase X 遗留。先探针实证 WCL 原始 heal 行字段：**overheal 存在且语义清晰**
  ——amount=0&&overheal>0=全过量，amount>0&&overheal>0=部分过量（136 行样本 64+20）。
  Y1 三层链路：domain CombatEvent 增 overheal?；normalizer 直通映射；engine
  DeathIncident 增 healAttempts（含全过量行的治疗尝试数）/overhealInWindow（过量
  总量）。措辞升级：「无有效治疗」→ 有尝试全过量时「N 次治疗尝试全部过量 X——目标
  满血后被打爆」（=治疗者在奶但目标满血，与「根本没奶」是两个故事）；有缺口时附带
  「另有 X 过量」。view/web 同步。Y2 顺手修复 getFights 瞬时怪癖：验证探针当天撞上
  WCL 瞬时返回缺 fight 的列表（下一次请求即正常），fetchFightsWithRetry（3 次退避，
  null/空列表视为瞬时；报告不存在不重试；真实报告至少 1 场战斗）。**真实复验
  （fight1）**：熊虎狂怒死亡明细现显示「另有 12,198 过量」，4 个治疗者先死归因不变。
  测试 +6（normalizer 1：overheal 直通四态；engine 2：全过量语义/部分过量措辞；
  wcl-client 2：fights null/空重试+耗尽明确报错；application view 1 处断言扩展）。
  全仓 build/typecheck/test（15 工程）/lint 全绿；服务已新 dist 重启（8787 双 200））
- Phase Z SSR 冒烟测试自动化：完成
  （收 Phase P 遗留「.ssr-smoke.mjs 为手工构建产物未自动化」。新 scripts/ssr-smoke.mjs
  + 根 package.json `pnpm ssr-smoke`：默认构建 web-ui+web dist → 临时端口 + **临时
  SQLite DB**（DATABASE_URL 指向 tmpdir，真实 wcl-cache.db 零接触）→ 从仓库根 spawn
  apps/web/dist/index.js → 六项端到端断言：① GET / 引用 Vite 哈希 bundle（防退化回
  legacy public/）② /api/sessions 200 JSON ③ SPA 路由回放 index.html ④ 哈希资产
  JS MIME ⑤ 空 LLM 配置 400 引导语（Phase Q 空回复回归锚点）⑥ 非法 JSON 400 不挂起。
  任一失败非零退出，启动失败打印服务日志。`--no-build` 复用现有 dist 快速跑。
  实测两模式六项全过；8787 开发服务不受影响。注：scripts/*.mjs 与探针脚本同属
  根目录、不在各包 lint 门内（仓库既有约定，本次不扩门））
- Phase AA M+ 判定流适配（开门 + 领域门控 + 分段输出）：完成
  （此前评估为「大工程」的方向。先实证后动手：探针强制 mythicPlus:'evaluate' 跑
  真实 M+ 报告量化残留误报——Phase V 静默时测量 90%+，两大根因（never-cast 恒就绪/
  骨盾漂移）修复后实测：奥法 suboptimal 24%+mistake 3%、武器战 mistake 21%、
  血DK/元素萨已可用。AA1 scenarioGate 领域门控（原则性）：未标记 scenario 的 ST
  规则在 AoE 场景（targetCount≥3）降为 explain-only（uncertain）——ST 优先级列表
  不在多目标场景定责，AoE 只信 scenario:'aoe' 规则，知识无 aoe 规则的专精诚实静默
  （血DK模式推广）。unknown 场景（目标数不可观测）保持 untagged 规则照常评估。
  效果：奥法 suboptimal 24%→14%（剩余为 st 场景真评估）、武器战 mistake 21%→2%。
  AA2 arms.cleave_aoe conf 0.7→0.55（低于 0.6 定责门槛）：12.x 武器战 AoE 靠旋风斩
  顺劈化 MS/OP，知识未建模该机制，「AoE 只该顺劈斩」表述过强（实测 191 假 mistake）
  ——降级 explain-only 直到顺劈化机制被查证建模；arms knowledge 1.0.0→1.1.0。
  AA3 开门：evaluateRotation 默认 mythicPlus:'evaluate'（'skip' 显式恢复静默）。
  AA4 digest 分段：RotationDigest 增 engagements[]（decision 时间间隙 >15s 切段，
  每段起止/决策数/flagged 数，cap 20）——M+ 宿主模型可说「第 3 波拉怪」而非一堆
  时间戳；单段团本不出该字段。**真实复验（fight13）**：四专精 mistake≤2%（奥法 2%/
  血DK 0/元素萨 2%/武器战 2%），AoE 无知识处全部诚实 unknown；武器战 8 个 pull 段
  正确切分（含段级 flagged）。ANALYZER_VERSION 0.9.0→0.10.0。测试 net +4（aoe
  explain-only 专项 / M+ 默认诚实评估 / skip 选项 / digest 分段 2）；STANDARD 夹具
  加 aoe 锚定规则。已知残留：元素萨 5 例 expect=lava_burst actual=stormkeeper（开
  SK 的 GCD 被判偏离，属知识覆盖不足非 M+ 噪声）；武器战 AoE 评价待顺劈化机制建模
  后恢复。全仓 build/typecheck/test（15 工程）/lint 全绿；服务已新 dist 重启（8787
  双 200））
- Phase AB 排行榜基线 pool 断链修复（Prompt↔Brief 契约对齐）：完成
  （起因：用户问奥法判定标准 + 「计划里是否有用同副本高层同专精榜单做参考」。查
  RankingReference 链路时发现两处断链，会让「历史最佳池」护栏实际失效：
  ① `packages/ai-reasoning/src/brief.ts` projectReference() 只投影 encounterName/
  metric/className/specName/count/stats/player，**丢弃 pool 与 keyLevel**——而
  `BriefReference` 类型早已声明这两个字段（类型允许、投影没接），模型既看不到基线池
  语义也看不出是大秘境；② `apps/web/src/prompt.ts` 写的是 `reference.source.pool`，
  但实际投递的是 ai-reasoning 的**扁平 brief**（无 source 嵌套层）→ 提示词指向不存在的
  字段（ai-reasoning 自身 SYSTEM_PROMPT 规则 4 亦缺 pool 护栏，仅其测试引用）。
  AB1 brief 投影补 pool/keyLevel 透传；AB2 ai-reasoning SYSTEM_PROMPT 规则 4 改为
  「先看 reference.pool 判断语义」，全层数历史最佳池禁用同层分位措辞、改引
  gapVsP50Pct；AB3 web prompt 三处 `reference.source.pool`→`reference.pool` 并提
  keyLevel。AB4 测试：brief 基例补 pool/keyLevel 并断言投影存活、prompt 增护栏用例
  （含 not.toContain('reference.source') 锁裸路径）。**结论**：榜单基线一直存在且为
  「同副本+同专精」，但 WCL characterRankings 实测忽略 difficulty/keyLevel 过滤，
  池恒为全层数历史最佳 top100（≈最高层），无法按层过滤——§15 唯一遗留项，本次让既有
  pool 标签 + gapVsP50Pct 缓解措施真正生效。全仓 build/typecheck/test（442
  用例）/lint 全绿，服务已新 dist 重启（8787 ROOT/API 双 200））
- Phase AC 参考基线「可点开」+ 技能名中文化（外链 / 层级区间 / 官方 zh-CN 名称源）：完成
  （起因：用户要求「大秘境参考对比写明白一点 + 给外链」「很多技能名是英文的，能否中文 /
  去哪拿中英对照」。先实证后动手，四个结论全部来自实测：
  **① 外链**：`RankingEntry.report{code,fightID}` 一直在 DTO 里但没被用起来。新增
  `@wcl/wcl-client` site.ts（wclSiteOrigin 由 WCL_API_URL 推导 → cn 部署链 cn 站；
  buildReportUrl / buildRankingsUrl），app-service buildReference 产出
  `source.rankingsUrl`（zone 级榜单页，#dungeon= 大秘境 / #boss= 团本）、
  `top[].runUrl`（榜首那一场的 report#fight 直链）、`top[].durationMs`，web server 把
  本场直链塞进 brief meta.reportUrl；brief 新增 `topRuns`（**只带链接的**前 3 条，
  无 report 的行丢弃）。AI 两份 SYSTEM_PROMPT 均改为「必须给外链 + 原样引用」。
  **② 层级区间**：实测 `characterRankings` 的 `hardModeLevel` 枚举只有
  Any/Highest/NormalMode/Level0..Level4（**没有钥石层数**），`bracket`/`byBracket`
  要么返回 0 条要么不存在该字段 → 「按层过滤」在 API 层彻底无解（§15 遗留项确认为
  接口缺陷而非我们没用对）；于是如实输出池内**实际**层级区间 `source.poolLevels`
  （实测该本 top100 = +19~+21），pool 文案改为「Mythic+ 该本最高层前 N 名（池内层级
  +19~+21）」，AI 必须同时说清「本场层数 / 池区间 / 与池中位差距」。
  **③ 技能名中文化**：实测 WCL 事件只回 `abilityGameID`、**完全不回技能名**（默认与
  Accept-Language: zh-CN 都一样），所以名字 100% 由我们自己提供；同时发现
  `gameData.ability(id)` 在 cn 站**回中文名**（30451→奥术冲击 / 34026→杀戮命令 /
  845→顺劈斩）——即无需任何第三方对照表。新增 `scripts/sync-ability-names.mjs`
  （`pnpm ability-names`，`--diff` 比对知识里的名字 vs 官方中文名），据此把唯一纯英文的
  知识（兽王猎 10 条 + 奥术齐射 2 条）补成中文；`makeCooldownDelayRule` 增
  `abilityDisplayName`（**英文常量继续负责事件匹配，中文名只负责展示**），12 条 CD 规则
  从知识取 `name` 传入 → 产出从「Avatar 使用存在延迟」变为「天神下凡 (Avatar) 使用存在
  延迟」；另修 kill-command / barbed-shot / beast-cleave / clearcasting-waste /
  arcane-charges-overflow / bone-shield-uptime 的 expected.ability 硬编码英文。
  **④ 顺带修掉一个真实缺陷**：SPEC_TO_CLASS 缺 Warrior/Paladin 等近 10 个职业，导致
  武器战/惩戒骑**永远拿不到基线**（实测 Arms reference=undefined）；改为
  `classForPlayer()` 优先用 actor 的 class（实测 Player actor 的 `subType` 就是职业，
  如 Paladin/Monk，落到 domain Player.className），再用 spec 名兜底，并把
  Frost/Holy/Restoration/Protection 这类**跨职业重名**从名字表里剔除（宁可不给基线
  也不给错基线）；`rankingsClassName()` 处理「Death Knight→DeathKnight」空格差异
  （实测带空格的 slug 返回 0 条）。真实复验（fXdMjWKJbpna6yHv fight13）：四个专精
  **全部拿到** pool/层级区间/榜单链接/榜首直链，技能名全中文。测试 net +14
  （wcl-client site 5 / brief 3 / prompt 2 / application class 解析 3 / application M+ 链接 1）。
  诚实边界：cn.warcraftlogs.com 对非浏览器 UA 一律 403（Cloudflare，连首页也是），
  所以外链**无法在此环境 HTTP 验证**——榜单页 base path 与 report 直链是 WCL 规范格式
  （搜索到的真实链接 corroborate），hash 过滤器名为 best-effort（即使过滤器名变了，
  base path 仍落到正确 zone）。全仓 build/typecheck/test（456 用例）/lint 全绿，
  服务已新 dist 重启（8787 ROOT/API 双 200））
- Phase AD 前端「Chat + Inline Artifact」重构（消息 parts 模型 + 结构化卡片 + 活动面板 + 抽屉）：完成
  （起因：用户提出前端方向——「AI 是对话入口，但分析报告应该是结构化 UI，而不是一大段
  Markdown」，抄 Codex 的 conversation/activity 分离 + Linear 的 Issue 密度 + WCL 的数据
  表达，不要传统 admin dashboard。**采纳其核心，但在一处刻意与建议不同**：
  建议里隐含「让 AI 输出结构化 JSON」，本项目不改——模型只准解释/归因/排序/建议，
  结构一律来自确定性引擎（severity/timestamp/evidence/链接都不是模型能决定的），
  且用户的 LLM 是任意 OpenAI 兼容端点，强制 JSON 会大面积失败。所以 artifact 由
  `apps/web/src/artifact.ts` 从 AnalysisResult 投影，模型只负责 text part。
  ① **契约**：`MessagePart = text | activity | artifact`，助手消息渲染顺序固定
  activity → artifact → text（过程 / 结论 / 解释），前端 `useChat.toParts` 装配；
  ② **后端新增两个 SSE 事件**：`activity`（pipeline 每个确定性阶段 running→done/failed，
  `ProcessTurnInput.onActivity`，detail 是**结果**如「15 场战斗」「3 条发现 · 工程分 81」
  而不是假进度条）与 `artifact`（在 LLM 开始流之前发出，卡片先出现、散文随后填）；
  ③ **持久化**：`StoredMessage = {role, content, artifact?, activity?}`，刷新后卡片能重渲染，
  `toLlmMessages()` 在喂模型前剥掉 artifact/activity（模型不需要自己的渲染数据）；
  ④ **前端组件**：`ActivityPanel`（默认折叠）、`ArtifactView`（跑分 + 问题清单 + 基线 +
  循环判定条）、`FindingCard`（Linear 密度可点卡片）、`ReferenceCard`（本场层数 / 池层级
  区间 / 与池中位差距 / 外链）、`RotationStrip`、`DetailDrawer`（右侧抽屉：证据 + 期望 vs
  实际 + 建议，Esc/遮罩关闭）；`format.ts` 纯展示格式化（mm:ss.s / 万·亿 / 严重度标签），
  只格式化引擎已算好的值；
  ⑤ **修掉一个真缺陷（UI 暴露出来的）**：evidence 的 `timestamp`/`expectedAt` 与 rotation
  `samples[].time` 都是**报告相对绝对毫秒**（与 `fight.startTime` 同坐标系），UI 直接当
  时钟渲染 → 一场战斗从报告 7 小时处开始就显示成「422:20」。artifact 作为渲染模型
  统一 rebase 到**战斗相对**（早于开打的时刻无法 rebase，宁可丢掉时间也不显示乱码时钟），
  engagements 窗口同步平移；顺带修 `formatClock` 的浮点误差（`92.3-60` 二进制下
  32.2999…，十位会被截成 2）改为整数毫秒运算；
  ⑥ **文档**：新增 `docs/ui-architecture.md`（设计哲学 / parts 契约 / SSE 事件表 / 数据流 /
  组件地图 / 「怎么加一种新结果」/ 诚实性边界 / 测试清单），README 前端段落改写。
  测试 net +25（web-ui App 冒烟 4 + ChatCore 重写 14 + DetailDrawer 6 / web artifact 8 +
  pipeline 活动与 rotation 4 + session 2）；全仓 build/typecheck/test（481 用例）/lint 全绿，
  服务新 dist 重启（8787 ROOT/API 双 200）。**真实端到端复验**（`_probe-ui-contract.mjs`
  打 :8787 真 SSE + 真 M+ 报告）：三轮 turn 分别收到 6 / 0 / 2 个 activity 步骤，
  artifact 带 3 条 findings（时间已归一为 @49s / @279s）、基线池 +19~+21、本场 +10、
  差距 -50.4%、榜单与榜首直链齐全，且 `GET /api/sessions/:id` 刷新后 artifact 仍在。
  诚实边界：本机 Chromium（agent-browser）冷启动卡死/CDP 通道断开，**截图未能取得**；
  改为补 `App.test.tsx` 冒烟（挂载整个 SPA 断言 shell/welcome 渲染）来锁住「#root 空白」
  这类崩溃，比一次性截图更可靠）
- Phase AE 基线池收到前 10 + 榜首实况可浏览（并暴露一个缓存失效陷阱）：完成
  （起因：用户「榜首的实况统计前 10 即可，读取数据也是前 10 即可，100 太多了」。
  实测确认 WCL `characterRankings` **没有行数参数**——`limit` 不在字段参数表里，每页固定 100 条，
  且 `count` / `hasMorePages` 描述的是分页而非总体量，所以「取前 10」只能是**客户端截断**。
  ① `@wcl/application` 新增 `REFERENCE_POOL_SIZE = 10`，`getEncounterRankings` 增 `limit`
  参数（client.ts 内 slice，`count` 仍保留为 WCL 那一页的原始行数，两者**刻意不混用**——
  这正是「前 100 名」不再泄漏进文案的原因）；② pool 文案改为「前 10 名」，`reference.top`
  现在就是整池（不再 slice 10）；③ UI：`MAX_ARTIFACT_TOP_RUNS = 10`，`ReferenceCard` 改为
  **榜首实况列表**（序号 / 名字 / 层级 / DPS / 日志直链），前 3 条内联、其余「展开剩余 N 条」，
  沿用渐进披露；**brief 仍只给模型 3 条**（模型只需能引用，不需浏览列表）——这个不对称是有意的，
  已写进 `docs/ui-architecture.md` §6；④ 提示词两份都补「池是小样本=上限参照，禁止人群分位措辞」。
  **过程中踩到并修掉一个真陷阱**：改完 pool 大小后 live 复验**仍显示「前 100 名」**——
  分析结果走了 SQLite 分析缓存，而缓存 key 只含 ANALYZER_VERSION，池大小变更不会自动失效。
  这类「改变所有战斗语义」的变更**必须 bump 版本**：`ANALYZER_VERSION` 0.10.0 → 0.11.0
  （package.json 同步），缓存随即失效重算，复验才拿到「前 10 名 / 池 +20~+21」。
  语义变化已如实记录：同一场差距由 -50.4% 变 -54.2%、池层级由 +19~+21 收窄为 +20~+21
  （顶尖 10 条中位更高），已在 ui-architecture.md §7 写明「池大小变化会改动所有战斗数值 + 必须 bump 版本」。
  live 复验：artifact 带 10 条榜首实况**且 10 条全部有 permalink**（榜首 小奈电下 +21 296158）。
  测试 net +6（wcl-client 3 / application 2 / web artifact 1 / web-ui 榜首列表与展开 1）；
  全仓 build/typecheck/test（487 用例）/lint 全绿，服务新 dist 重启（8787 双 200））
- Phase AF 榜首逐场对标（"我具体差在哪"）：完成
  （起因：用户「我想让 ai 帮我分析同副本的榜首的数据，然后横向对比一下我具体差在哪」。
  此前只有**聚合**基线（分位 + 10 条 permalink），回答"离顶尖有多远"，回答不了"差在哪"。
  ① **可行性实测先行**：榜单条目带 `report.code`/`report.fightID`，所以能定位到那一场 →
  `getPlayers` 按名字匹配到 actor → 用**同一套 analyzer** 跑对方那一场。真实日志验证通过
  （诸王之眠 +10 奥法 vs +21 奥法，对方的 1471 次施法/6033 个 buff 全部拉到）。
  ② `analysis-engine`：`RankingReference.top[]` 增 `reportCode`/`fightId`（原始 WCL 形状在
  wcl-client 边界就内部化，和 `keyLevel` 同规矩）；**`ANALYZER_VERSION` 0.11.0 → 0.12.0**
  ——缓存里的旧结果没有这两个字段，不 bump 则对标在新分析的战斗上会失败。
  ③ `packages/application/src/reference-compare.ts`（新）：纯函数 `buildReferenceComparison`。
  **只比速率**（施法/分钟、GCD/分钟、未施法占比、每个技能的次/分钟）——两场时长不同，
  绝对次数不可比；DPS 照给但**强制带 note** 说明层数/装等/路线差异未剥离；finding 按规则 id 求差
  （只有我有的 = 真差异点）；**判定档分布只在两边 `scenario` 相同时才判 `comparable`**
  （实测真的出现过"我 st / 榜首 aoe"，此时卡片显式写"不可直接横比"）。
  ④ `AppService.compareToTopRun()`：对方的报告私密 / 名单里没同名玩家 / 榜单条目缺坐标，
  分别返回 `no-data` / `player-not-found` / `no-reference` + 一句人话原因，**绝不画半张空表**。
  ⑤ **技能名的真解法**：事件里只有 `abilityId`（WCL 的 `events(dataType: Casts)` JSON 没有嵌套
  ability 对象，所以归一化后 `abilityName` 恒空）。逐个调 `gameData.ability(id)` 是 N 次请求，
  而 `gameData.abilities(ids:...)` **不存在**（实测 `Unknown argument "ids"`）。正解是
  `report.masterData.abilities { gameID name }`——**一次请求拿到整份报告的技能表，cn 站返回官方中文名**
  （新 `WclClient.getAbilityNames`，过滤 `gameID 0` 占位符）。
  ⑥ web 接线：`pipeline` 增对比意图（`ready` 态，与死亡复盘意图互不干扰）→ `kind: 'compare'`；
  `server.ts` 从**最近一条 analysis artifact** 取本场身份（不重新解析用户措辞）→ 跑对标 →
  SSE 发 `comparison`（在 LLM 之前）→ 用一份专门的 `buildComparisonUserMessage` 让模型只做叙述，
  并把三条铁律写进提示词（禁人群分位 / 层数不同不得整体归因手法 / 场景不同不得横比判定档）。
  ⑦ 前端：新 `CompareCard`（对照表 + 技能频率 + 判定档 + 可见脚注 + 诚实说明）、
  `ReferenceCard` 加「与榜首逐场对比」按钮（**发普通用户消息 `COMPARE_PROMPT`，不调隐藏 API**，
  turn 可复现）；`MessagePart` 增 `comparison`，持久化但喂模型前剥掉。
  **过程中被用户当场抓到一处真问题**：链接原本长在卡片最底部，用户按"右上角应该有"去找却找不到
  → 改到 `.compare-head` 右上（紧邻对手名字），并把「层数不同」这类关键前提从 tooltip 改成可见脚注。
  测试 net +33（application 11 / web 5+3 / web-ui 8+1 / wcl-client 2 / pipeline 3）；
  全仓 build/typecheck/test（520 用例）/lint 全绿。
  **诚实边界**：本机 Chromium 的 CDP 通道仍不稳定（daemon 掉回 `about:blank`），真机截图未取得；
  新增 `scripts/preview-conversation.mjs`——用真实组件 + 真实 CSS + 会话 API 真实载荷
  `renderToStaticMarkup` 成静态 HTML 作为替代（调试辅助，交互仍需组件测试覆盖））

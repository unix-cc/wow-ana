# 分析引擎

`packages/analysis-engine` 是确定性、可测试、可重复、不依赖 LLM 的战斗分析层。
对同一份输入数据，输出必须完全一致。

## 核心接口

```ts
interface AnalysisResult {
  findings: Finding[];
  metrics: Record<string, unknown>; // 各分析器输出的强类型结构
  score?: { overall: number }; // 启发式总分 0-100
}

interface Analyzer {
  analyze(context: AnalysisContext): AnalysisResult | Promise<AnalysisResult>;
}
```

`AnalysisContext` 包含 `report / fight / player / events`，分析器按需从事件流中
筛选并计算。

## 分析器

### Cast Analyzer

按玩家统计每次施法，并按技能聚合：

- 技能使用次数、首次/末次时间
- 最短 / 最长 / 平均施法间隔

### GCD Analyzer

- `totalGcd`：相邻施法间隔 ≥ GCD 阈值计为一个 GCD
- `idleMs` / `idlePercent`：战斗期间未施法的累计时间与占比
- `idleWindows`：超过空闲阈值的连续无施法窗口

### Cooldown Analyzer

给定技能 CD 配置，对比实际与理论使用次数：

- `expectedCasts = floor(duration / cd) + 1`
- `averageDelayMs` / `maxDelayMs`：相对理想节奏的施放延迟
- `missedFinalCast`：战斗结束前是否还能多用一次

### Buff Analyzer

跟踪 apply / refresh / remove，计算：

- uptime、downtime
- 最大叠层、平均叠层
- 刷新次数

### Damage Analyzer

- 总伤害、DPS（基于战斗时长）
- 按技能伤害、命中/暴击分布

### Target Analyzer

- 目标数量、目标切换次数
- 按目标伤害排名（用于判断主目标 / AoE）

### Death Analyzer

- 死亡时间
- 死亡前 N 秒受到的伤害、来源（用于机制归因）

### Resource Analyzer

- 各资源类型的峰值 / 最低值
- 获得 / 消耗总量

### Interrupt / Dispel Analyzer

- 打断 / 驱散次数
- 按目标分布

## Findings 与 Evidence

分析器只负责产出 metrics。需要生成问题（Finding）时，通过 `AnalysisRule`
评估 metrics 或事件流，每个 Finding 携带可追溯的 `evidence`。AI 层再基于
Findings 生成自然语言解释。

## 评分与排序（Scoring）

`core/scoring.ts` 提供两个确定性工具，用于让 AI 优先关注高影响问题：

- `prioritizeFindings(findings)`：按严重程度稳定降序排序
  （critical → high → medium → low → info）。
- `computeScore(findings)`：启发式总分 0–100，按 finding 严重程度扣分并夹取。
  这是信号，不是 DPS 损失估计，也不代表排名。

Aggregation 层（如 `AppService.analyzePlayer`）在合并所有 findings 后调用两者，
把排序后的 findings 与 `score` 放进 `AnalysisResult` 返回给 AI。

## 职业专项分析（specs/）

`specs/` 下按职业 / 专精组织专项规则，通过 `SpecRegistry` 按玩家 `specName`
或 `specId` 匹配。共享规则工厂在 `specs/helpers.ts`：

- `makeCooldownDelayRule`：大 CD 使用延迟（含「基本未使用」检测）
- `makeGcdIdleRule`：GCD 空转
- `abilityCasts` / `buffActiveMs` / `debuffActiveMs`：技能计数 / buff 覆盖率 / DoT 覆盖率

当前已实现专精：

| 专精                 | 规则                                                                                       | 关键技能 ID（经真实日志验证）                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 兽王猎 Beast Mastery | Kill Command 使用、Barbed Shot buff 覆盖、Beast Cleave 覆盖、Bestial Wrath 延迟、GCD 空转  | KC 34026 / BW 19574 / Barbed Shot 217200 / Beast Cleave 115939                     |
| 奥法 Arcane          | Clearcasting 浪费、奥术充能溢出、Arcane Surge 延迟（含未使用）、GCD 空转                 | Blast 30451 / Missiles 5143 / Barrage 44425 / Surge 365350 / Clearcasting 263725   |
| 元素萨 Elemental     | 烈焰震击覆盖、Lava Surge 浪费、Stormkeeper 延迟、Fire Elemental 延迟（含未使用）、GCD 空转 | Flame Shock 188389 / Lava Burst 51505 / Stormkeeper 191634 / Fire Elemental 198067 |
| 血DK Blood           | Bone Shield 覆盖、Vampiric Blood 延迟、Dancing Rune Weapon 延迟（含未使用）、GCD 空转      | Death Strike 49998 / Marrowrend 195182 / Bone Shield 195181 / VB 55233 / DRW 49028 |

> 事件数据只携带 `abilityId`（WCL 不返回技能名），因此上面技能 ID 都经过真实
> 日志验证，勿随意改动；规则同时按名字兜底匹配。

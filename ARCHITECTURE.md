# WCL AI Analyzer — System Architecture

> 面向《魔兽世界》Warcraft Logs（WCL）的 AI 战斗日志分析系统。

---

# 1. 项目定位

WCL AI Analyzer 是一个基于 Warcraft Logs（WCL）战斗日志的 AI 战斗分析系统。

用户只需要提供一个 WCL Report URL：

```text
https://www.warcraftlogs.com/reports/xxxxxx
```

系统自动完成：

```text
WCL Report
    ↓
战斗数据获取
    ↓
数据标准化
    ↓
战斗事实提取
    ↓
职业/专精知识匹配
    ↓
规则分析
    ↓
AI 推理
    ↓
结构化分析报告
```

系统最终回答：

> **“这场战斗发生了什么、玩家实际做了什么、理论上应该怎么做、哪里存在问题、为什么，以及如何改进。”**

---

# 2. 核心设计原则

## 2.1 WCL 是事实来源

WCL API 提供：

* 战斗信息
* 玩家信息
* 技能施放
* Buff / Debuff
* Damage
* Healing
* Death
* Cast
* Resource
* Position
* Target
* Encounter
* Ranking

这些数据属于：

> **Combat Facts（战斗事实）**

系统不能修改事实。

---

# 2.2 Spec Knowledge 是知识来源

系统维护独立的职业/专精知识库。

例如：

```text
兽王猎
奥术法师
鲜血死亡骑士
...
```

知识库描述：

* 技能优先级
* 技能关系
* Buff / Debuff
* Resource
* Cooldown
* 单体逻辑
* AOE 逻辑
* 天赋差异
* 套装影响
* 饰品影响
* 常见循环
* 战斗阶段
* 版本变化
* 特殊机制

Spec Knowledge 表达的是：

> **“在特定条件下，理论上应该如何决策。”**

---

# 2.3 Analysis Engine 负责判断

不能简单使用：

```text
技能 A > 技能 B
```

然后认为：

```text
玩家用了 B
=
错误
```

必须结合实际战斗状态。

例如：

```text
Spec Knowledge
        +
Combat Facts
        +
Fight Context
        +
Player State
        +
Target State
        +
Resource State
        +
Cooldown State
        +
Encounter Mechanics
        ↓
Decision Evaluation
```

最终判断：

```text
Correct
Acceptable
Suboptimal
Mistake
Unknown
```

---

# 2.4 AI 不负责计算基础事实

AI 不应该直接从海量 WCL Event 中自己计算：

```text
技能用了多少次
技能之间间隔多久
Buff 覆盖率多少
资源溢出多少
CD 浪费多少
```

这些应该由程序完成。

AI 的主要职责：

```text
解释
归因
总结
比较
生成建议
```

即：

> **代码负责计算，AI 负责理解。**

---

# 3. 总体架构

```text
                         ┌─────────────────────┐
                         │       User          │
                         │   WCL Report URL    │
                         └──────────┬──────────┘
                                    │
                                    ↓
                         ┌─────────────────────┐
                         │   Report Resolver   │
                         │  URL → Report ID    │
                         └──────────┬──────────┘
                                    │
                                    ↓
                         ┌─────────────────────┐
                         │    WCL Connector    │
                         │                     │
                         │ GraphQL API         │
                         │ OAuth / Client      │
                         │ Pagination          │
                         │ Rate Limit          │
                         └──────────┬──────────┘
                                    │
                                    ↓
                         ┌─────────────────────┐
                         │   Data Collector    │
                         │                     │
                         │ Report              │
                         │ Fight               │
                         │ Events              │
                         │ Players             │
                         │ Rankings            │
                         └──────────┬──────────┘
                                    │
                                    ↓
                         ┌─────────────────────┐
                         │ Combat Normalizer   │
                         │                     │
                         │ WCL → Internal Model│
                         └──────────┬──────────┘
                                    │
                                    ↓
              ┌─────────────────────┴─────────────────────┐
              │                                           │
              ↓                                           ↓
 ┌────────────────────────┐                   ┌────────────────────────┐
 │    Combat Facts        │                   │    Spec Knowledge      │
 │                        │                   │                        │
 │ Skill Cast             │                   │ Class                  │
 │ Buff / Debuff          │                   │ Specialization         │
 │ Damage                 │                   │ Abilities              │
 │ Healing                │                   │ Priority                │
 │ Resource               │                   │ Buff / Debuff           │
 │ Target                 │                   │ Cooldowns               │
 │ Position               │                   │ Resource                │
 │ Death                  │                   │ Single Target           │
 │ Movement               │                   │ AOE                    │
 │ Fight Phase            │                   │ Talents                 │
 └───────────┬────────────┘                   │ Set Bonuses             │
             │                                │ Encounter Rules          │
             │                                │ Patch Version            │
             │                                └───────────┬────────────┘
             │                                            │
             └────────────────────┬───────────────────────┘
                                  ↓
                       ┌─────────────────────┐
                       │   Analysis Engine   │
                       │                     │
                       │ Rotation            │
                       │ Cooldown            │
                       │ Resource            │
                       │ Uptime              │
                       │ Buff                 │
                       │ Target              │
                       │ Death               │
                       │ Mechanic            │
                       │ Comparison          │
                       └──────────┬──────────┘
                                  │
                                  ↓
                       ┌─────────────────────┐
                       │  Finding / Evidence │
                       │                     │
                       │ Issue               │
                       │ Severity            │
                       │ Evidence            │
                       │ Expected            │
                       │ Actual              │
                       │ Confidence          │
                       └──────────┬──────────┘
                                  │
                                  ↓
                       ┌─────────────────────┐
                       │   AI Reasoning      │
                       │                     │
                       │ Explain             │
                       │ Diagnose            │
                       │ Prioritize          │
                       │ Recommend           │
                       └──────────┬──────────┘
                                  │
                                  ↓
                       ┌─────────────────────┐
                       │ Analysis Report     │
                       │                     │
                       │ Summary             │
                       │ Problems            │
                       │ Evidence            │
                       │ Suggestions         │
                       │ Priority            │
                       └─────────────────────┘
```

---

# 4. 核心模块

## 4.1 Report Resolver

负责解析用户提供的 WCL URL。

输入：

```text
https://www.warcraftlogs.com/reports/2FDvga86hQZwfWV1?fight=8
```

输出：

```json
{
  "reportId": "2FDvga86hQZwfWV1",
  "fightId": 8
}
```

需要支持：

```text
Report URL
Report + Fight URL
Zone URL
Ranking URL
```

---

# 5. WCL Connector

负责与 WCL GraphQL API 通信。

职责：

* OAuth
* Client Authentication
* GraphQL Query
* Pagination
* Rate Limit
* Retry
* Error Handling
* API Schema 管理
* 请求缓存

禁止业务分析逻辑进入 Connector。

Connector 只负责：

> **“从 WCL 拿数据。”**

---

# 6. Data Collector

负责根据分析需求获取数据。

例如：

```text
Report Metadata
Fight Metadata
Player Metadata
Cast Events
Damage Events
Healing Events
Buff Events
Debuff Events
Resource Events
Death Events
Position Events
```

不要一次性获取所有数据。

采用：

```text
Analysis Requirement
        ↓
Data Requirement
        ↓
GraphQL Query
        ↓
WCL
```

按需加载。

---

# 7. Combat Normalizer

WCL 原始数据不能直接作为分析引擎输入。

需要转换成内部统一数据模型。

例如：

```typescript
interface CombatEvent {
  timestamp: number;
  type: CombatEventType;

  source?: EntityRef;
  target?: EntityRef;

  ability?: AbilityRef;

  amount?: number;

  resource?: ResourceState;

  buffs?: BuffState[];

  position?: Position;

  metadata?: Record<string, unknown>;
}
```

这样未来即使 WCL API 发生变化，也不会影响分析引擎。

---

# 8. Combat Facts

Combat Facts 是：

> **程序从 WCL 日志中计算出来的客观事实。**

例如：

```json
{
  "ability": "Kill Command",
  "casts": 37,
  "averageInterval": 8.3,
  "wastedCooldown": 4.2
}
```

或者：

```json
{
  "buff": "Bestial Wrath",
  "uptime": 0.82
}
```

或者：

```json
{
  "resource": "Focus",
  "overcap": 1240
}
```

Combat Facts 不负责判断好坏。

只描述：

> **发生了什么。**

---

# 9. Spec Knowledge

这是系统新增的核心模块。

目录：

```text
knowledge/
└── specs/
    ├── hunter/
    │   ├── beast-mastery/
    │   │   ├── overview.md
    │   │   ├── priority.md
    │   │   ├── abilities.md
    │   │   ├── buffs.md
    │   │   ├── cooldowns.md
    │   │   ├── resources.md
    │   │   ├── single-target.md
    │   │   ├── aoe.md
    │   │   └── talents/
    │   │
    │   ├── marksmanship/
    │   └── survival/
    │
    ├── mage/
    │   ├── arcane/
    │   ├── fire/
    │   └── frost/
    │
    └── death-knight/
```

---

# 10. Spec Knowledge 数据结构

每一个专精至少包含：

```text
Spec
├── Overview
├── Abilities
├── Priority
├── Resources
├── Buffs
├── Debuffs
├── Cooldowns
├── Single Target
├── AOE
├── Talents
├── Set Bonuses
├── Trinkets
├── Encounter Rules
└── Patch Version
```

---

# 11. Skill Priority

技能优先级必须采用：

```text
Condition → Action
```

而不是简单的：

```text
1. Skill A
2. Skill B
3. Skill C
```

例如：

```yaml
- priority: 1
  condition:
    target_count: ">= 3"
    buff: "xxx"
  action: "Skill A"

- priority: 2
  condition:
    resource: ">= 80"
  action: "Skill B"

- priority: 3
  condition:
    cooldown_remaining: "< 2"
  action: "Skill C"
```

这样才能支持真实战斗判断。

---

# 12. Spec Knowledge 必须版本化

魔兽世界职业机制会随着版本变化。

因此：

```text
knowledge/specs/mage/arcane/
```

不能假设永久有效。

建议：

```text
knowledge/
└── patches/
    ├── 12.0/
    ├── 12.0.5/
    ├── 12.1/
    └── 12.1.x/
```

或者：

```yaml
spec: arcane_mage
patch: 12.1
effective_from: 2026-08-13
effective_to: null
```

分析时：

```text
Fight Date
      ↓
Patch Resolver
      ↓
Spec Knowledge Version
```

必须确保：

> **使用战斗发生时对应版本的职业知识。**

---

# 13. Spec Knowledge 与 Combat Facts 的关系

两者严格分离。

```text
Combat Facts
=
实际发生了什么

Spec Knowledge
=
理论上应该怎么做
```

例如：

```text
Combat Facts:

10:01:23
玩家施放 Skill B

10:01:24
资源 = 90

10:01:25
Skill A 可用
```

Spec Knowledge：

```text
资源 >= 80
AND
Skill A available

→ Skill A priority > Skill B
```

Analysis Engine：

```text
Actual:
Skill B

Expected:
Skill A

Result:
Potential Suboptimal Decision
```

---

# 14. Analysis Engine

Analysis Engine 是整个系统的核心。

负责：

```text
Combat Facts
        +
Spec Knowledge
        ↓
Analysis
```

主要 Analyzer：

```text
analyzers/
├── rotation/
├── cooldown/
├── resource/
├── uptime/
├── buff/
├── debuff/
├── target/
├── death/
├── movement/
├── mechanic/
└── comparison/
```

---

# 15. Rotation Analyzer

负责分析：

```text
技能优先级
技能使用顺序
技能间隔
技能空窗
资源与技能关系
Combo / Proc
```

例如：

```text
Expected:
A → B → C

Actual:
A → C → B
```

但不能直接判错。

必须进一步检查：

```text
为什么 B 没有使用？
```

例如：

```text
目标死亡
目标不可攻击
玩家移动
机制发生
资源不足
Buff 状态变化
Cooldown
```

---

# 16. Cooldown Analyzer

分析：

```text
CD 使用次数
CD 使用时间
CD 延迟
CD 浪费
CD 对齐
爆发窗口
Boss Phase
```

例如：

```text
Major Cooldown:
使用次数 2
理论可用次数 3

Potential Loss:
1 次

Reason:
Fight Duration
+ Cooldown
```

---

# 17. Resource Analyzer

支持：

```text
Focus
Mana
Energy
Rage
Runic Power
Runes
Combo Points
Arcane Charges
Holy Power
...
```

分析：

```text
Resource Overcap
Resource Starvation
Resource Generation
Resource Spend
Resource Pooling
```

---

# 18. Buff / Debuff Analyzer

分析：

```text
Buff Uptime
Debuff Uptime
Buff Refresh
Buff Wasted
Buff Alignment
Proc Usage
```

例如：

```text
Buff uptime:
82%

Potential:
91%

Loss:
9%
```

然后交给 AI 分析：

> 为什么掉覆盖？

---

# 19. Encounter Analyzer

不能只分析职业循环。

必须理解 Boss 战斗。

例如：

```text
Boss Phase
Intermission
Invulnerability
Movement
Target Swap
Add Spawn
Mechanic
Forced Downtime
```

否则容易产生错误结论。

例如：

```text
Boss 不可攻击 8 秒
```

不能认为：

```text
玩家 DPS 下降
=
玩家问题
```

---

# 20. Finding 数据模型

所有分析结果统一为 Finding。

```typescript
interface Finding {
  id: string;

  category:
    | "rotation"
    | "cooldown"
    | "resource"
    | "uptime"
    | "buff"
    | "debuff"
    | "mechanic"
    | "death"
    | "movement";

  severity:
    | "critical"
    | "high"
    | "medium"
    | "low"
    | "info";

  title: string;

  description: string;

  actual: unknown;

  expected: unknown;

  evidence: Evidence[];

  confidence: number;

  impact?: Impact;
}
```

---

# 21. Evidence

所有重要结论必须能够追溯到日志。

例如：

```json
{
  "timestamp": 123456,
  "ability": "Arcane Blast",
  "eventId": "xxx"
}
```

或者：

```json
{
  "fightId": 8,
  "start": 123456,
  "end": 124789
}
```

最终 AI 说：

> 你在第一次爆发窗口中延迟了核心技能约 4.2 秒。

系统必须能够指出：

```text
Evidence:
Fight 8
00:32.4
00:36.6
```

而不是 AI 自己编造。

---

# 22. AI Reasoning Layer

AI 不直接处理全部 WCL Event。

输入：

```text
Fight Summary
+
Combat Facts
+
Findings
+
Spec Knowledge
+
Evidence
```

例如：

```json
{
  "player": "xxx",
  "spec": "Arcane Mage",

  "findings": [
    {
      "category": "cooldown",
      "severity": "high",
      "title": "爆发技能使用延迟",
      "impact": 4.2
    }
  ]
}
```

AI 负责：

```text
为什么
影响多大
优先级
怎么改
```

---

# 23. AI 输出结构

AI 不应该直接返回自由文本。

建议先生成结构化结果：

```json
{
  "summary": "...",

  "performance": {
    "score": 82
  },

  "findings": [
    {
      "priority": 1,
      "category": "rotation",
      "title": "...",
      "reason": "...",
      "impact": "...",
      "solution": "..."
    }
  ],

  "recommendations": [
    "..."
  ]
}
```

前端再负责展示。

---

# 24. Analysis Pipeline

完整分析流程：

```text
1. Parse WCL URL

2. Resolve Report

3. Load Fight

4. Identify Player

5. Identify Class

6. Identify Spec

7. Identify Patch

8. Load Spec Knowledge

9. Load Required WCL Events

10. Normalize Events

11. Generate Combat Facts

12. Run Analyzer

13. Generate Findings

14. Attach Evidence

15. AI Reasoning

16. Generate Report

17. Store Analysis
```

---

# 25. MCP 的定位

系统可以提供 MCP，但：

> **MCP 不是核心业务架构。**

推荐：

```text
WCL GraphQL API
       ↓
WCL Connector
       ↓
WCL Service
       ↓
Analysis Engine
```

然后提供：

```text
MCP Server
       ↓
调用内部 Service
```

MCP 只是给 AI Agent 提供工具访问能力。

例如：

```text
get_report()
get_fights()
get_players()
get_casts()
analyze_fight()
get_spec_knowledge()
```

不要：

```text
AI → MCP → 直接操作 WCL GraphQL
```

而应该：

```text
AI
 ↓
MCP
 ↓
Application Service
 ↓
Domain Service
 ↓
WCL Connector
```

---

# 26. 推荐项目目录

```text
wcl-ai-analyzer/
│
├── apps/
│   ├── api/
│   ├── web/
│   └── mcp/
│
├── packages/
│   │
│   ├── wcl-client/
│   │
│   ├── combat-model/
│   │
│   ├── combat-normalizer/
│   │
│   ├── combat-facts/
│   │
│   ├── spec-knowledge/
│   │
│   ├── analysis-engine/
│   │
│   ├── analyzers/
│   │   ├── rotation/
│   │   ├── cooldown/
│   │   ├── resource/
│   │   ├── uptime/
│   │   ├── buff/
│   │   ├── mechanic/
│   │   └── death/
│   │
│   ├── ai-reasoning/
│   │
│   └── shared/
│
├── knowledge/
│   ├── specs/
│   ├── encounters/
│   └── patches/
│
├── tests/
│   ├── fixtures/
│   ├── analyzers/
│   ├── knowledge/
│   └── integration/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DOMAIN_MODEL.md
│   ├── ANALYSIS_RULES.md
│   ├── SPEC_KNOWLEDGE.md
│   └── API.md
│
├── AGENTS.md
└── README.md
```

---

# 27. 数据流

```text
                 WCL
                  │
                  ↓
           WCL GraphQL API
                  │
                  ↓
            WCL Connector
                  │
                  ↓
           Combat Normalizer
                  │
                  ↓
            Combat Facts
                  │
                  │
                  ├──────────────┐
                  │              │
                  ↓              ↓
          Analysis Engine   Spec Knowledge
                  │              │
                  └───────┬──────┘
                          ↓
                       Findings
                          │
                          ↓
                    AI Reasoning
                          │
                          ↓
                    Final Report
```

---

# 28. 数据存储

建议至少保存：

```text
Report
Fight
Player
Combat Events
Combat Facts
Analysis
Finding
Spec Knowledge Version
```

不要默认永久保存全部 WCL Event。

可以采用：

```text
Raw Data
    ↓
短期缓存

Normalized Data
    ↓
按需保存

Analysis Result
    ↓
长期保存
```

---

# 29. 缓存策略

缓存层：

```text
WCL API Cache
        ↓
Normalized Data Cache
        ↓
Combat Facts Cache
        ↓
Analysis Cache
```

缓存 Key：

```text
reportId
fightId
playerId
patch
spec
analyzerVersion
knowledgeVersion
```

当：

```text
Analyzer Version
```

或：

```text
Spec Knowledge Version
```

发生变化时，可以重新分析。

---

# 30. Analyzer Version

分析规则必须版本化。

例如：

```text
rotation-analyzer@1.0.0
rotation-analyzer@1.1.0
```

最终 Analysis 保存：

```json
{
  "analyzerVersion": "1.2.0",
  "knowledgeVersion": "12.1.3"
}
```

保证历史结果可追溯。

---

# 31. Spec Knowledge 更新机制

职业知识库允许独立更新。

例如：

```text
Patch 12.1
    ↓
职业改动
    ↓
更新 Spec Knowledge
    ↓
Knowledge Version +1
```

不需要修改：

```text
WCL Connector
Combat Model
Analysis Engine
```

---

# 32. 测试策略

核心分析逻辑必须使用固定 WCL Fixture。

例如：

```text
tests/
└── fixtures/
    ├── hunter-bm/
    │   ├── normal.json
    │   ├── cooldown-delay.json
    │   └── resource-overcap.json
    │
    └── mage-arcane/
        ├── normal.json
        └── rotation-error.json
```

测试：

```text
Input:
Combat Facts

Expected:
Finding
```

而不是测试 AI 最终生成的自然语言。

---

# 33. AI 与规则的边界

## Rule Engine

负责：

```text
精确计算
精确判断
时间窗口
技能优先级
资源
CD
Buff
Uptime
Evidence
```

## AI

负责：

```text
解释
归因
总结
自然语言
优先级排序
教学
```

原则：

> **能用代码确定的事情，不交给 AI 猜。**

---

# 34. 不允许的设计

禁止：

```text
WCL → LLM → “你打得不好”
```

禁止：

```text
WCL Event → Prompt → AI 自己统计所有数据
```

禁止：

```text
Skill Priority List
↓
玩家没按照顺序
↓
直接判错
```

禁止：

```text
AI 自己创造 WCL 数据
```

禁止：

```text
AI 自己创造 Evidence
```

---

# 35. 推荐的最终分析模型

系统最终应该形成：

```text
                    ┌───────────────┐
                    │  WCL Facts    │
                    └───────┬───────┘
                            │
                            ↓
                    ┌───────────────┐
                    │ Combat Model  │
                    └───────┬───────┘
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ↓                             ↓
    ┌────────────────┐           ┌─────────────────┐
    │ Actual Behavior│           │ Expected Behavior│
    │ 实际行为        │           │ 理论行为         │
    └───────┬────────┘           └────────┬────────┘
            │                             │
            │                             │
            └─────────────┬───────────────┘
                          ↓
                  ┌───────────────┐
                  │  Difference   │
                  │    Analysis   │
                  └───────┬───────┘
                          ↓
                  ┌───────────────┐
                  │   Evidence    │
                  └───────┬───────┘
                          ↓
                  ┌───────────────┐
                  │ AI Explanation│
                  └───────┬───────┘
                          ↓
                  ┌───────────────┐
                  │  Improvement  │
                  └───────────────┘
```

---

# 36. MVP 实施顺序

不要一开始支持所有职业。

推荐：

```text
Phase 1
│
├── WCL Connector
├── Report Resolver
├── Fight Loader
├── Player Loader
└── Combat Normalizer

        ↓

Phase 2
│
├── Combat Facts
├── Cast Analyzer
├── Cooldown Analyzer
├── Resource Analyzer
└── Uptime Analyzer

        ↓

Phase 3
│
├── Spec Knowledge
├── 一个职业
├── 一个专精
└── Skill Priority

        ↓

Phase 4
│
├── Finding
├── Evidence
├── AI Reasoning
└── Analysis Report

        ↓

Phase 5
│
├── 多职业
├── 多专精
├── AOE
├── Encounter Mechanics
└── Ranking Comparison
```

---

# 37. 第一阶段建议

第一阶段只实现：

```text
WCL
 ↓
Report
 ↓
Fight
 ↓
Player
 ↓
Events
 ↓
Combat Facts
```

先保证：

> **数据获取和事实计算绝对正确。**

第二阶段：

```text
Combat Facts
 ↓
Analyzer
 ↓
Finding
```

第三阶段再加入：

```text
Spec Knowledge
```

第四阶段：

```text
Finding
 ↓
AI
 ↓
Report
```

---

# 38. 核心目标

最终系统不是：

> “一个会读 WCL 的聊天机器人。”

而是：

> **一个拥有 WCL 战斗事实模型、职业专精知识模型、规则分析引擎和 AI 推理能力的战斗分析系统。**

核心架构：

```text
WCL
 ↓
Combat Facts
 ↓
Spec Knowledge
 ↓
Analysis Engine
 ↓
Evidence / Finding
 ↓
AI Reasoning
 ↓
Player Coaching
```

其中：

```text
WCL
=
发生了什么

Spec Knowledge
=
应该怎么做

Analysis Engine
=
哪里不同

Evidence
=
证据是什么

AI
=
为什么以及怎么改
```

这五层必须保持清晰边界。

---

# 39. 架构原则总结

最终遵循：

1. **WCL 是事实来源**
2. **Spec Knowledge 是职业知识来源**
3. **Combat Facts 是客观事实**
4. **Analysis Engine 是确定性分析**
5. **Evidence 是所有结论的依据**
6. **AI 是解释和推理层**
7. **MCP 是 AI 的工具接口，不是业务核心**
8. **职业知识必须版本化**
9. **Analyzer 必须版本化**
10. **不能让 AI 猜测基础数据**
11. **不能把简单技能优先级直接当成错误判断**
12. **所有重要结论必须可以追溯到 WCL Evidence**

最终目标：

```text
                 WCL
                  │
                  ▼
          ┌───────────────┐
          │ Combat Facts  │
          └───────┬───────┘
                  │
          ┌───────┴───────┐
          │               │
          ▼               ▼
   Actual Behavior   Spec Knowledge
          │               │
          └───────┬───────┘
                  ▼
          Analysis Engine
                  │
                  ▼
              Evidence
                  │
                  ▼
            AI Reasoning
                  │
                  ▼
          Player Coaching
```

**这就是 WCL AI Analyzer 的核心架构。**

# 架构设计

## 目标

把 WCL 战斗数据经过「WCL Client → 确定性分析引擎 → Findings → MCP → AI」链路
跑通，让 AI 依据结构化证据输出自然语言分析，而非直接读取几十万条原始事件。

## 分层

| 层              | 职责                                                                    | 包                         |
| --------------- | ----------------------------------------------------------------------- | -------------------------- |
| WCL Client      | GraphQL 传输、OAuth、分页、限流、事件归一化                             | `packages/wcl-client`      |
| Data Layer      | 缓存、Report/Fight/Player 元数据                                        | `packages/storage`         |
| Analysis Engine | GCD / Cooldown / Buff / Resource / Target / Damage / Death 等确定性分析 | `packages/analysis-engine` |
| Domain          | 跨层共享的领域类型                                                      | `packages/domain`          |
| Shared          | 配置、日志、错误、工具函数                                              | `packages/shared`          |
| Application     | 业务编排：WclClient + Analysis Engine + 缓存装配（AppService）          | `packages/application`     |
| MCP             | 面向 AI 的薄 Adapter                                                    | `apps/mcp-server`          |
| Web             | 面向大众的聊天对话（HTTP + SSE + 用户自带 LLM）                         | `apps/web`                 |

## 数据流

```text
Adapter（MCP Tool / Web Chat）
  ↓
Application Service (packages/application)
  ↓
Analysis Engine
  ↓
WCL Client
  ↓
Storage (cache)
```

## 两种前端

- **MCP Server**（`apps/mcp-server`）：需要用户在 Codex / Claude 中配置 `mcpServers`，
  适合技术用户。
- **Web 聊天**（`apps/web`）：浏览器访问即用，用户在页面上填自己的 LLM
  Base URL / Key / Model（存 localStorage），后端持有我方 WCL 凭据做确定性流水线：
  解析 URL → 选 fight → 选玩家 → `analyze_player`，再把结构化结果交给用户配置的
  LLM 流式生成分析。用户不需要 WCL 密钥，也不需要配置 MCP。

## 关键约束

1. **确定性优先**：任何能用代码算出来的问题，不交给 LLM。
2. **Evidence First**：每个重要 Finding 必须能追溯到数据时间点。
3. **Context 控制**：MCP 返回 Summary / Metrics / Findings，而非原始事件；AI 需要时再按需获取（Progressive Disclosure）。
4. **版本化缓存**：分析版本进入 cache key（如 `analysis:v1:{report}:{fight}:{player}`），避免旧结果污染新算法。

## 缓存设计（Phase 2）

- SQLite + Drizzle，单表 `cache_entries(key, value, createdAt, expiresAt)`。
- `WclCache` 提供类型化方法：`getReport / setReport`、`getFights`、`getActors`、`getEvents`（按 queryHash）、`getAnalysis`（带版本）。
- 事件缓存 key：`events:{report}:{fight}:{queryHash}`，queryHash 由 `dataType / sourceId / targetId / abilityId` 稳定哈希得到。
- 分析缓存 key：`analysis:v{ANALYSIS_VERSION}:{report}:{fight}:{player}`。
- `WclClient` 以 cache-aside 模式接入缓存，通过 `WclClientCache` 接口解耦，不直接依赖 `storage`。
- 组合根（如 mcp-server）负责把 `WclClient` 与 `WclCache` 装配起来。

## 事件归一化

```text
Raw WCL Event
  ↓ Event Normalizer (wcl-client/event-normalizer.ts)
Domain CombatEvent
  ↓ Analysis Engine
```

WCL API 字段变化时，只需修改 WCL Client / Normalizer。

## 分析引擎分层

```text
analysis-engine/
  core/
    analyzer.ts        # Analyzer / AnalysisResult 接口
    timeline.ts        # 时间窗口 / 间隔 / 空闲窗口工具
    rule-engine.ts     # 规则聚合（Findings）
  combat/              # 通用确定性分析器
    casts / gcd / cooldowns / buffs / damage /
    targets / deaths / resources / interrupts / dispels
  specs/               # 职业专项分析（Phase 5+）
```

每个分析器输出强类型 metrics，并可通过规则生成带 Evidence 的 Findings。
详细说明见 `docs/analysis-engine.md`。

# MCP Tools

MCP 层位于 `apps/mcp-server`，仅作为 Adapter，不实现业务逻辑。所有用例由
`AppService`（Application Service 层）承载，MCP tools 只做参数校验与结果格式化。

## 分层

```text
MCP Tool (tools/*.ts)
  ↓ 调用
AppService (services/app-service.ts)
  ↓ 协调
WclClient + Analysis Engine + WclCache
```

## 工具清单

| Tool                 | 输入                                                   | 输出                                    |
| -------------------- | ------------------------------------------------------ | --------------------------------------- |
| `parse_wcl_url`      | url                                                    | reportCode / fightId / dataType         |
| `get_report`         | reportCode                                             | Report 元数据                           |
| `get_fights`         | reportCode                                             | Fight[]                                 |
| `get_players`        | reportCode, fightId                                    | Player[]                                |
| `get_player_summary` | reportCode, fightId, playerId                          | 玩家摘要                                |
| `get_player_casts`   | reportCode, fightId, playerId                          | cast 事件                               |
| `get_player_buffs`   | reportCode, fightId, playerId                          | buff/debuff 事件                        |
| `get_player_damage`  | reportCode, fightId, playerId                          | 伤害事件                                |
| `get_player_deaths`  | reportCode, fightId, playerId                          | 死亡事件                                |
| `analyze_player`     | reportCode, fightId, playerId, [analysis], [cooldowns] | summary + metrics + findings + evidence |

## analyze_player

核心工具。内部并行获取玩家在该 Fight 的 casts / buffs / damage / deaths /
resources / interrupts / dispels，归一化后喂给分析引擎，运行所选分析器并聚合
metrics 与 findings。

支持 `analysis` 数组选择模块（summary / rotation / cooldowns / buffs /
resources / damage / deaths），以及 `cooldowns` 数组传入需评估的技能 CD。

匹配到职业专项分析器（当前为兽王猎）时，`result.metrics.spec` 会带上专精名，
专项规则产生的 findings 与通用 findings 合并返回。

## 输出与 AI 消费

`analyze_player` 返回 `summary + result`：

```json
{
  "summary": { "playerId": 123, "name": "Hero", "spec": "Beast Mastery" },
  "result": {
    "score": { "overall": 82 },
    "findings": [
      {
        "severity": "high",
        "category": "cooldown",
        "title": "...",
        "evidence": []
      }
    ],
    "metrics": {}
  }
}
```

- `score.overall`：启发式总分 0–100，由 findings 严重程度与数量推出，仅用于让 AI
  快速判断战斗问题多寡，不代表 DPS 损失。
- `findings`：按严重程度降序（critical → high → medium → low → info）稳定排序，
  便于 AI 按 Impact × Confidence 分配注意力。
- 如何把该结果转成自然语言分析，见 [`docs/ai-prompt.md`](./ai-prompt.md)。

## 上下文控制

`analyze_player` 只返回结构化 metrics 与 findings，不返回原始事件。AI 需要深查
时再调用 `get_player_casts` / `get_player_buffs` 等按需获取（Progressive Disclosure），
避免把海量事件塞进 LLM context。

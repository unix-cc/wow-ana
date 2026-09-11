# Combat Fixtures（Phase J 固定黄金数据）

本目录存放确定性战斗时间线（内部 `CombatEvent` 形状，见
`packages/domain/src/event.ts`），供 integration / sanity 测试跨包复用，
避免每个测试文件手写事件数组（审计 §8 结构性缺陷 1）。

## 文件

| 文件 | 场景 | 预期（作者意图，见 `meta`） |
| --- | --- | --- |
| `hunter-bm-basic.json` | 60s 教学反例：前 30s Cobra 平射 + Kill Command 仅 4 次（0/6/12/18s），后 30s 完全挂机，全程无 Barbed Shot | `bm_hunter.kill_command_usage` / `bm_hunter.gcd_idle` / `bm_hunter.barbed_shot_uptime`（均 high） |
| `mage-arcane-basic.json` | 60s 循环场景：Arcane Salvo 叠至 12 层（t+11s），t+20s 打 Arcane Missiles | rotation mistake，`expectedRuleId: arcane.orb_low_charges`，scenario `st` |

两个战斗的 `fight.startTime` 都落在 2026-06-01（知识生效窗口内），保证
`knowledgeRegistry.resolve` 返回 `meta.knowledgeVersion` 对应的知识版本。

## 维护规则

- **不要手编 JSON**。改场景请编辑 `scripts/generate-combat-fixtures.mjs` 后重跑：
  `node scripts/generate-combat-fixtures.mjs`。
- 若作者意图（可触发 finding）真的变了，同步更新本表、`meta` 与
  `tests/integration` 里的断言；若只是实现细节变化导致断言失败，先确认是
  fixture 漂移还是实现回归，再决定改哪一侧。

## 引用方式

integration 工程通过 `node:fs` 相对路径读 JSON（不参与任何包编译）：

```ts
const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/combat/hunter-bm-basic.json', import.meta.url), 'utf8'),
);
```

`tests/fixtures/wcl/` 仍保留为将来存放真实脱敏 WCL 原始响应（graphql JSON）
的位置；`combat/` 只存归一化后的内部事件。

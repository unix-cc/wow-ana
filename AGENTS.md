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


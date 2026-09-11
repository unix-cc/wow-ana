# 项目长期记忆（wcl-ana）

> 只记**跨会话仍然成立**的硬事实与铁律。日常进展写进 `YYYY-MM-DD.md`。

## 铁律

1. **改变分析结果形状/口径的改动 → 必须 bump `ANALYZER_VERSION`**
   （`packages/analysis-engine/src/types.ts` + 该包 `package.json` 同步）。
   分析缓存 key 只含版本号，不 bump 就会继续吐旧结果，且**症状是"新代码看起来没生效"**。
   已两次踩中：Phase AE（池 100→10）、Phase AF（`top[]` 加 reportCode/fightId）。
2. **结构来自引擎，文字来自模型。** 数字/严重度/时间点/链接一律由确定性引擎产出；
   artifact / comparison 都是从引擎结果**投影**出来的渲染模型，不含模型输出。
3. **每个喂给前端的数组都必须有 cap。**
4. **诚实性优先于好看**：拿不到就说拿不到（`status` + 一句人话），
   绝不画半张空表、不编造名次、不把 `unknown` 渲染成问题。

## WCL API 硬事实（实测，别再试错）

- **事件里没有技能名。** casts 事件只有 `abilityGameID`，没有嵌套 ability 对象
  → 归一化后 `abilityName` 恒空，`abilityId` 是唯一身份。
- **技能名的正解**：`report.masterData.abilities { gameID name }` ——
  **一次请求拿整份报告的技能表，cn 站返回官方中文名**。另两类走不通：
  `gameData.ability(id)` 是一次一个（N 次请求）；`gameData.abilities(ids:[...])` **不存在**
  （`Unknown argument "ids"`）。过滤 `gameID: 0`（WCL 的 `Unknown Ability` 占位符）。
- **`characterRankings` 没有行数参数**：`limit` 不在字段参数表里，每页固定 100 条；
  `count`/`hasMorePages` 描述**分页**而非总体量（page1/page2 都回 100）。
  「取前 N」只能是客户端截断，省不了网络字节。
- **`characterRankings` 不能按钥石层过滤**：`hardModeLevel` 枚举里没有钥石等级值。
  池子恒为「该本最高层前 N 名」→ **禁止**「同层分位 / 同层排名 / 超过 X% 玩家」措辞。
- **榜单条目带 `report { code, fightID }`** → 这是能定位并重跑「榜首那一场」的唯一途径。
- **`events` 只回 `abilityGameID`**；deaths 的死者是 `targetID`；`getActors` / `getFights` 会间歇性
  回 `masterData: null` / `fights: null`（有重试）。

## 两种时间坐标系（踩过）

`report.startTime` 是 epoch；`fight.startTime` 与**事件/证据时间戳**是报告相对偏移。
- 解析 spec knowledge 的版本时要用 `report.startTime + fight.startTime`；
- UI 渲染钟表前要把证据时间**归一到战斗相对**（早于开打的宁可丢掉时间，也不显示乱码）。

## 环境限制

- **本机 Chromium / agent-browser 的 CDP 通道不可靠**：`open` 能成功，但后续命令看到的页面
  是 `about:blank`，`eval` 报 SecurityError。**别再在这台机器上硬磕截图**。
  替代：`pnpm preview <sessionId> [outFile]`（真实组件 + 真实 CSS + 会话 API 真实载荷
  → 静态 HTML，见 `docs/ui-architecture.md` §9）；视觉正确性最终靠组件测试，不靠截图。
- PowerShell 里 `pnpm` 正常；Git Bash 里要走
  `node "C:/develop/env/nvm/nodejs/node_modules/corepack/dist/pnpm.js" <args>`。
- PowerShell 的 `Start-Process` 在本机报 `Dictionary key 'Path'/'PATH'` 冲突 →
  起服务用 Git Bash `nohup node dist/index.js &`（日志进 `apps/web/.server.log`，`*.log` 已忽略）。

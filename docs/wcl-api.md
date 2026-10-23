# WCL API

> 本文只讲**端点、查询字段和已知坑**。
> 「只许用 v2、失败怎么升级、凭据纪律」属于硬约束，见 `CONSTRAINTS.md` §3，不在此重复。

## 认证

使用 WCL OAuth2 `client_credentials` 流程获取 Access Token。

- Token URL：`<WCL_API_URL 的 origin>/oauth/token`
  （`https://www.warcraftlogs.com/oauth/token`，CN 为 `https://cn.warcraftlogs.com/oauth/token`）
- 请求体：`grant_type=client_credentials&client_id=...&client_secret=...`
- 实现位于 `packages/wcl-client/src/auth.ts`，Token 带过期时间并缓存。

## GraphQL 端点

`https://www.warcraftlogs.com/api/v2/client`

查询以 `reportData.report(code: $code)` 为根，依次获取 Report、Fight、Actor 与 Events。

## 查询

- `GetReport`：Report 元数据（标题、Owner、时间范围、Zone）。
- `GetFights`：Report 内所有 Fight。
- `GetActors`：Report 内所有 Actor（含 Player / NPC / Boss / Pet）。
- `GetAbilityNames`：Report 的**全量技能表** `masterData.abilities { gameID name }`（见下）。
- `GetEncounterRankings`：同副本同专精排行榜（见下）。
- `GetEvents`：按 `fightIDs` / `startTime` / `endTime` / `sourceID` / `abilityID` / `dataType` 过滤事件，支持 `limit` 与 `nextPageTimestamp` 分页。

## 技能名从哪来（重要）

**事件里没有技能名。** `events(dataType: Casts)` 返回的 JSON 只有 `abilityGameID`，
没有嵌套的 ability 对象，所以归一化后的事件 `abilityName` 是空的——
`abilityId` 是唯一可靠的身份。

要**显示**技能名（而不是匹配），用 `report.masterData.abilities { gameID name }`：
**一次请求拿到整份报告的技能表**，且在 `cn.warcraftlogs.com` 上返回的是**官方中文名**
（2026-09-10 实测）。这比逐个调 `gameData.ability(id)`（N 次请求）好得多。

注意：

- `gameID: 0` 是 WCL 的 `Unknown Ability` 占位符，不是真技能，必须过滤。
- 表是**报告级**的：只包含该报告里出现过的技能。跨报告比较时，两边各自取自己的表。
- `gameData.abilities(ids: [...])` **不存在**（`Unknown argument "ids"`，实测），别试。

## 排行榜（`characterRankings`）

- 返回 `rankings[].report { code, fightID, startTime }` —— 这是**定位到那一场**的唯一途径，
  也是「逐场对标榜首」能实现的原因（`RankingReference.top[].reportCode/fightId`）。
- **没有行数参数**：`limit` 不在字段参数表里，每页固定 100 条；`count` / `hasMorePages`
  描述的是分页而非总体量（page 1 与 page 2 都回 `count: 100`）。所以「取前 N」只能是
  **客户端截断**，省不了网络字节。
- **不能按钥石层过滤**：`hardModeLevel` 枚举里没有钥石等级值，池子恒为「该本最高层前 N 名」。
  对外措辞必须写成「池内实际层级区间」，不能说「同层分位」。


## 事件字段的两个坑（2026-10-23 实测）

**1. `amount` 会被钳成 1。** 目标濒死（训练假人日志的常态）时，WCL 把实际伤害钳到
`amount: 1`，差值塞进 `overkill`，真实数值只在 `unmitigatedAmount`。
归一化层已保留 `unmitigatedAmount` / `overkill`（`CombatEvent`）—— 做任何伤害对比都用前者，
否则整场看起来像"每发 1 点伤害"。实测样本：`mnNQW16gjB9azRYx` 全部 fight。

**2. buff 层数只在部分事件上。** `stack` 字段仅出现在 `applybuffstack` /
`removebuffstack` / `refreshbuff`；普通 `applybuff` 不带（应视为 1 层）。
另外 `applybuffstack` / `removebuffstack` **不在** `TYPE_MAP` 里，归一化后 `type` 是 `other`
（`rawType` 仍保留）。想重建资源曲线（如虚落 3 层）必须按 `rawType` 判断；
把它们并入 `buff` 会改变覆盖率类统计的口径，需单独评估后再动。

## 分页

`GetEvents` 返回 `nextPageTimestamp`；客户端通过 `startTime` 作为游标持续拉取，直到没有下一页。见 `WclClient.getEvents`。

## 限流

WCL 响应头携带 `x-ratelimit-*` 信息。`RateLimitManager` 记录 limit / pointsSpent / pointsResetIn，接近阈值时抛 `WclRateLimitError` 暂停请求。

## 错误

统一错误类型见 `packages/shared/src/errors.ts`，MCP 层仅向 AI 返回安全、可恢复的提示。

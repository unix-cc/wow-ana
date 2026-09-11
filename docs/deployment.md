# 部署与操作指南

本文档描述从零部署、启动并操作 WCL AI Analyzer 的完整步骤。

## 1. 前置条件

- Node.js >= 18（建议 20+，已用 Node 22 验证）
- pnpm 12+（通过 corepack 启用）
- WCL API OAuth Client Credentials（Client ID / Client Secret）
  - 在 https://www.warcraftlogs.com/ 开发者页面申请（CN 用户使用 cn 站）

## 2. 安装

```bash
corepack enable
pnpm install
```

## 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```env
WCL_CLIENT_ID=你的ClientID
WCL_CLIENT_SECRET=你的ClientSecret
WCL_API_URL=https://www.warcraftlogs.com/api/v2/client
DATABASE_URL=wcl-cache.db
LOG_LEVEL=info
```

说明：

- `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET`：OAuth 凭据，**不要提交到 Git**。
- `WCL_API_URL`：GraphQL 端点。访问 www 站用 `https://www.warcraftlogs.com/api/v2/client`；
  访问 cn 站用 `https://cn.warcraftlogs.com/api/v2/client`（Token 端点会自动推导为对应
  origin 下的 `/oauth/token`）。
- `DATABASE_URL`：SQLite 缓存文件路径。**建议填写**（如 `wcl-cache.db`），留空则无持久
  缓存，每次查询都会请求 WCL。相对路径以启动目录为基准（`pnpm --filter @wcl/mcp-server start`
  时以 `apps/mcp-server` 为基准）。
- `LOG_LEVEL`：`trace | debug | info | warn | error | fatal`。

> `.env` 已被 `.gitignore` 忽略，但仍要避免把真实 Secret 复制进任何提交的配置。

## 4. 构建

```bash
pnpm build
```

`apps/mcp-server/dist/index.js` 是 MCP Server 的入口。

## 5. 测试（可选）

```bash
pnpm test          # 全部包测试
pnpm typecheck     # 类型检查
pnpm lint          # ESLint
```

## 6. 自检

先验证 MCP Server 能启动、10 个工具注册正常：

```bash
pnpm --filter @wcl/mcp-server verify
```

再验证 WCL OAuth 凭据与网络连通性（会真实请求一次 WCL，但不会打印 token）：

```bash
node scripts/check-connection.mjs
```

带 Report 代码还可顺带验证元数据查询：

```bash
node scripts/check-connection.mjs <reportCode>
```

## 7. 启动 MCP Server

```bash
pnpm --filter @wcl/mcp-server start
```

该进程以 stdio 方式提供 MCP 服务，等待 MCP 客户端连接。启动后保持前台运行。

## 7.1 启动 Web 对话版（面向大众）

```bash
pnpm --filter @wcl/web start
```

浏览器访问 `http://127.0.0.1:8787` 即可使用，无需任何客户端配置。用户只需在页面
右上角「设置」填写自己的 LLM（OpenAI 兼容的 Base URL / API Key / 模型），配置只
存在浏览器 localStorage。

可选环境变量：

```env
HOST=127.0.0.1     # 默认；对外提供服务时设为 0.0.0.0
PORT=8787          # 默认
```

对外公开部署建议：

- `HOST=0.0.0.0` 监听所有网卡，并在前面加 Nginx / Caddy 反向代理 + HTTPS。
- 反向代理示例（Nginx）：

  ```nginx
  server {
    listen 443 ssl;
    server_name wcl.example.com;
    location / {
      proxy_pass http://127.0.0.1:8787;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_buffering off;   # SSE 需要关闭缓冲
      proxy_read_timeout 120s;
    }
  }
  ```

- API Key 只从浏览器直达用户配置的 LLM 服务，不经我方日志。

## 8. 接入 MCP 客户端

在 Codex / Claude / 其他 MCP 客户端配置 `mcpServers`：

```json
{
  "mcpServers": {
    "wcl-analyzer": {
      "command": "node",
      "args": ["C:/code/wcl-ana/apps/mcp-server/dist/index.js"],
      "env": {
        "WCL_CLIENT_ID": "你的ClientID",
        "WCL_CLIENT_SECRET": "你的ClientSecret",
        "WCL_API_URL": "https://www.warcraftlogs.com/api/v2/client",
        "DATABASE_URL": "wcl-cache.db",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

要点：

- `command` 指向 `node`，`args` 指向**构建后的绝对路径** `apps/mcp-server/dist/index.js`。
- 凭据通过 `env` 注入，不要写进任何会提交的文件。
- 若客户端在别的目录启动，`DATABASE_URL` 请用绝对路径。

## 9. 操作流程

### MCP 模式（技术用户）

对 AI 说：**「分析这个 WCL：https://www.warcraftlogs.com/reports/xxxx?fight=8」**。

AI 会按 `docs/ai-prompt.md` 的流程依次调用：

| 步骤 | MCP Tool                                   | 作用                                   |
| ---- | ------------------------------------------ | -------------------------------------- |
| 1    | `parse_wcl_url`                            | 解析 reportCode / fightId              |
| 2    | `get_report`                               | Report 元数据                          |
| 3    | `get_fights`                               | Fight 列表                             |
| 4    | `get_players` / `get_player_summary`       | 找到玩家与专精                         |
| 5    | `analyze_player`                           | 确定性分析：metrics + findings + score |
| 6    | `get_player_casts` / `get_player_buffs` 等 | 需要深查时按需补充                     |
| 7    | —                                          | 基于结构化结果生成自然语言分析         |

也可以手动验证单个玩家：

```
pnpm --filter @wcl/mcp-server verify   # 只检查服务
node scripts/check-connection.mjs <reportCode>  # 检查凭据与一个 Report
```

### Web 模式（大众用户）

用户在浏览器打开页面，右上角「设置」里填 LLM 配置后，直接粘贴 WCL 链接。后端自动：

1. 解析 URL；
2. 若 URL 带 `fight=N`，列出该场战斗的玩家（自动识别专精）；否则先列出战斗让用户选；
3. 用户点选角色名 → 运行 `analyze_player`；
4. 结构化结果交给用户配置的 LLM，流式返回分析报告。

**会话与记忆**：

- 浏览器 `localStorage` 保存一个 `sessionId`，每次请求带上它。
- 服务端按 `sessionId` 维护对话历史，并持久化到同一个 SQLite（`DATABASE_URL` 指定的
  `cache_entries` 表，key 前缀 `chat:session:`）。重启服务后会话仍在。
- 刷新页面：前端调用 `GET /api/sessions/:id` 拉取历史并恢复显示。
- 分析完成后会话保留在 `ready` 状态：可直接追问（LLM 依据对话上下文回答），或再输入
  同场另一名角色名继续分析；贴新链接则重开一个新报告流程。
- 历史长度上限为最近 30 条，避免 LLM 上下文过大。

用户不需要 WCL 密钥，也不需要安装任何东西。

## 10. 缓存

- 文件：`DATABASE_URL` 指定的 SQLite 文件（如 `apps/mcp-server/wcl-cache.db`）。
- 策略：cache-aside。命中缓存不再请求 WCL；未命中则请求并回填。
- 缓存 key 内嵌版本：`analysis:v1:{report}:{fight}:{player}`，修改分析算法后递增版本即可
  避免旧结果污染。
- 清空缓存：删除 db 文件（连同 `-wal` / `-shm`）后重启。

## 11. 日志

默认 `LOG_LEVEL=info`，结构化 JSON 输出到 stdout：

```text
INFO WCL auth: token acquired
INFO WCL request {"queryName":"GetReport"}
INFO WCL cache hit
```

Secret / Token 永远不会写入日志。

## 12. 常见问题

| 现象                                             | 原因与处理                                                  |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `WCL token request rejected with status 404`     | 旧版本 token URL 拼错；请重新 `pnpm build` 后再试           |
| `WCL token request rejected with status 401/403` | Client ID / Secret 有误或无权限，检查 `.env`                |
| `WCL client credentials are not configured`      | `.env` 未填或启动目录不对（dotenv 读取 cwd 的 `.env`）      |
| `Report XXX 不存在或无权访问`                    | reportCode 填错，或当前 token 无权访问该私有 Report         |
| `WCL rate limit`                                 | 请求过频，等待 `pointsResetIn` 后再试（缓存可减少重复请求） |
| MCP 客户端连不上                                 | 确认 `command`/`args` 是绝对路径、服务先 build 过           |

## 13. 目录速览

```text
apps/mcp-server/            MCP Server（入口：dist/index.js）
apps/web/                   Web 聊天版（入口：dist/index.js，静态页在 public/）
packages/wcl-client/        WCL GraphQL 客户端（OAuth / 查询 / 分页 / 限流）
packages/analysis-engine/   确定性分析引擎（通用分析器 + BM 专项规则 + 评分）
packages/application/       业务编排层（AppService / WCL 客户端装配 / 缓存装配）
packages/storage/           SQLite 缓存
packages/domain/            领域类型
packages/shared/            配置 / 日志 / 错误
docs/ai-prompt.md           AI 消费结构化输出的指引与模板
docs/deployment.md          本文档
scripts/check-connection.mjs 连通性自检脚本
```

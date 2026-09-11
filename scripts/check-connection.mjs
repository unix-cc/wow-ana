#!/usr/bin/env node
/**
 * WCL 连通性自检脚本。
 *
 * 用法（在仓库根目录）：
 *   node scripts/check-connection.mjs
 *   node scripts/check-connection.mjs <reportCode>
 *
 * 不带参数：只校验 WCL OAuth 凭据能否取得 access token。
 * 带 reportCode：额外获取 Report 元数据并打印标题与区域。
 *
 * 不会打印 token / secret。
 */
import {
  AuthManager,
  WclClient,
  GraphqlClient,
  RateLimitManager,
} from '../packages/wcl-client/dist/index.js';

const reportCode = process.argv[2];

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`WCL connectivity check FAILED: ${message}`);
  process.exit(1);
}

try {
  const auth = new AuthManager();
  await auth.getAccessToken();
  console.log('WCL auth: OK (access token acquired)');

  if (reportCode) {
    const client = new WclClient({
      graphql: new GraphqlClient({
        tokenProvider: auth,
        rateLimiter: new RateLimitManager(),
      }),
    });
    const report = await client.getReport(reportCode);
    const zone = report.zone
      ? (report.zone.name ?? report.zone.id)
      : '(unknown)';
    console.log(
      `Report ${report.code}: ${report.title ?? '(no title)'} | zone: ${zone}`,
    );
  }

  console.log('WCL connectivity: OK');
} catch (error) {
  fail(error);
}

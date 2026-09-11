// 一次性 SSR 冒烟脚本（历史调试用；正式路径见 scripts/ssr-smoke.mjs + docs/ui-architecture.md §9）。
// 注意：./.ssr-build/App.js 是 esbuild 产物，已加入 .gitignore、**不在仓库里**。
// 需要重跑时先手动 bundle（入口必须放在 apps/web-ui 内，React 必须 external）：
//   cd apps/web-ui && node ../node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild \
//     .ssr-entry.tsx --bundle --platform=node --format=esm --jsx=automatic \
//     --external:react --external:react-dom --external:react-dom/server \
//     --outfile=.ssr-build/App.js
// 其中 .ssr-entry.tsx 形如：export { App } from './src/App';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './.ssr-build/App.js';

const html = renderToString(createElement(App));
console.log('HTML_LENGTH=' + html.length);
const checks = ['WCL AI', '战斗分析', '团灭复盘', '报告总览', '自由对话', '设置'];
for (const c of checks) {
  console.log(`HAS[${c}]=` + html.includes(c));
}

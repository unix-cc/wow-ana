import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './.ssr-build/App.js';

const html = renderToString(createElement(App));
console.log('HTML_LENGTH=' + html.length);
const checks = ['WCL AI', '战斗分析', '团灭复盘', '报告总览', '自由对话', '设置'];
for (const c of checks) {
  console.log(`HAS[${c}]=` + html.includes(c));
}

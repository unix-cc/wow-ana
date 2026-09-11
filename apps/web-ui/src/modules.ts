import type { ModuleDef, ModuleId } from './types';

/**
 * User-facing "modules". Each maps to an intent handled by the shared
 * deterministic pipeline (apps/web/src/pipeline.ts) using the same SSE chat
 * API — the modules are a navigation / onboarding layer on top of the
 * existing chat core, so no backend contract changes.
 */
export const MODULES: ModuleDef[] = [
  {
    id: 'combat',
    label: '战斗分析',
    description: '分析单个玩家的战斗表现与输出手法',
    guide: '粘贴一场战斗的 WCL 链接，选择要分析的角色，系统会拉取日志生成结构化分析。',
    placeholder: '粘贴 WCL 链接（如 https://www.warcraftlogs.com/reports/xxxx?fight=8）…',
    sample: 'https://www.warcraftlogs.com/reports/xxxx?fight=8',
    needsLlm: true,
  },
  {
    id: 'wipe',
    label: '团灭复盘',
    description: '复盘死亡 / 团灭 / 引怪(ADD)原因',
    guide: '先分析一场战斗，然后切到回调进入复盘；系统会结合死亡时间窗口给出归因。',
    placeholder: '例如：复盘一下这场为什么灭 / 谁的责任…',
    sample: '复盘一下这场战斗的死亡原因',
    needsLlm: true,
  },
  {
    id: 'report',
    label: '报告总览',
    description: '解析报告、列出战斗与参战玩家',
    guide: '粘贴报告链接，不指定 fight 时会先列出战斗列表供你选择，再选玩家。',
    placeholder: '粘贴 WCL 报告链接…',
    sample: 'https://www.warcraftlogs.com/reports/xxxx',
    needsLlm: false,
  },
  {
    id: 'chat',
    label: '自由对话',
    description: '关于报告、玩法、操作的一般讨论',
    guide: '已经完成分析后，可以继续追问任何战斗细节，AI 会结合对话上下文回答。',
    placeholder: '随便聊聊，或粘贴 WCL 链接开始分析…',
    sample: '怎么判断一个玩家打得是否合格？',
    needsLlm: true,
  },
];

export function getModule(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id) ?? (MODULES[0] as ModuleDef);
}

/** The default module shown when no explicit navigation has happened. */
export const DEFAULT_MODULE: ModuleId = 'combat';
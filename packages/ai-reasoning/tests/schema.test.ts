import { describe, it, expect } from 'vitest';
import {
  parseAiReport,
  checkProvenance,
  AI_JSON_ERROR_PREFIX,
  CATEGORY_VALUES,
} from '../src/index.js';

const VALID = {
  summary: '爆发节奏偏慢，资源利用良好。',
  performance: { score: 82 },
  findings: [
    {
      priority: 1,
      category: 'cooldown',
      title: '爆发技能使用延迟',
      reason: '第二次 AP 比理想槽位晚了 4.2s（source f_ap）。',
      impact: '爆发窗口被压缩',
      solution: '冷却就绪后立即使用',
      sourceId: 'f_ap',
    },
  ],
  recommendations: ['盯好冷却计时', '预留 GCD 打爆发'],
};

describe('parseAiReport', () => {
  it('parses plain JSON', () => {
    const result = parseAiReport(JSON.stringify(VALID));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.summary).toContain('爆发');
      expect(result.report.findings[0]?.sourceId).toBe('f_ap');
    }
  });

  it('parses JSON wrapped in a code fence', () => {
    const result = parseAiReport(`好的，分析如下：\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``);
    expect(result.ok).toBe(true);
  });

  it('extracts JSON embedded in prose', () => {
    const result = parseAiReport(`开头文字 ${JSON.stringify(VALID)} 结尾文字`);
    expect(result.ok).toBe(true);
  });

  it('rejects invalid JSON with a readable error', () => {
    const result = parseAiReport('{"summary": "断尾');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不是合法 JSON');
  });

  it('rejects schema violations with a field path', () => {
    const broken = { ...VALID, findings: [{ ...VALID.findings[0], category: 'bogus' }] };
    const result = parseAiReport(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('findings.0.category');
    }
  });

  it('rejects more than MAX_AI_FINDINGS findings', () => {
    const many = {
      ...VALID,
      findings: Array.from({ length: 7 }, (_, i) => ({
        priority: i + 1,
        category: 'rotation',
        title: `t${i}`,
        reason: 'r',
        sourceId: `s${i}`,
      })),
    };
    expect(parseAiReport(JSON.stringify(many)).ok).toBe(false);
  });

  it('honours the degraded marker as an explicit non-JSON exit', () => {
    const result = parseAiReport(`${AI_JSON_ERROR_PREFIX} 输入无法解析，以下是文字版…`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('降级标记');
  });
});

describe('checkProvenance', () => {
  it('accepts a report whose sources all exist with unique priorities', () => {
    const result = parseAiReport(JSON.stringify(VALID));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(checkProvenance(result.report, ['f_ap'])).toEqual([]);
    }
  });

  it('flags unknown source ids', () => {
    const result = parseAiReport(JSON.stringify(VALID));
    if (result.ok) {
      const problems = checkProvenance(result.report, ['f_other']);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('f_ap');
    }
  });

  it('flags duplicate priorities', () => {
    const dup = {
      ...VALID,
      findings: [
        { ...VALID.findings[0] },
        { ...VALID.findings[0], title: '另一条', sourceId: 'f_other', priority: 1 },
      ],
    };
    const result = parseAiReport(JSON.stringify(dup));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(checkProvenance(result.report, ['f_ap', 'f_other'])).toContain(
        'priority 1 重复',
      );
    }
  });

  it('flags the same sourceId cited by multiple findings', () => {
    const dup = {
      ...VALID,
      findings: [
        { ...VALID.findings[0] },
        { ...VALID.findings[0], title: '重复引用同一条来源', priority: 2 },
      ],
    };
    const result = parseAiReport(JSON.stringify(dup));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(checkProvenance(result.report, ['f_ap'])).toContain(
        'sourceId "f_ap" 被多个 finding 重复引用',
      );
    }
  });

  it('accepts an empty findings list', () => {
    const minimal = parseAiReport(JSON.stringify({ summary: '没有足够依据。' }));
    expect(minimal.ok).toBe(true);
    if (minimal.ok) expect(checkProvenance(minimal.report, [])).toEqual([]);
  });
});

describe('CATEGORY_VALUES', () => {
  it('matches the domain FindingCategory union exactly', () => {
    expect([...CATEGORY_VALUES].sort()).toEqual(
      [
        'rotation',
        'cooldown',
        'buff',
        'resource',
        'target',
        'damage',
        'mechanic',
        'death',
        'uptime',
        'movement',
      ].sort(),
    );
  });
});

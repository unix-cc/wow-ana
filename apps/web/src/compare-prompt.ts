import type { ComparisonView } from './compare.js';

/**
 * Prompt assembly for the head-to-head comparison (Phase AF + AI).
 *
 * Everything is deterministic projection of `ComparisonView` — the model
 * narrates engine numbers, it never computes them. The single-target message
 * is what it has always been; the multi-target variant (Phase AI) renders one
 * section per compared player with the player's own name in the columns
 * instead of the misleading "榜首" placeholder.
 */

/** What the comparison target is called in the prompt (single-target default). */
const TARGET_NOUN = '榜首';

/** Body shared by both variants: rates, abilities, verdicts, phases, rules. */
function comparisonBodyLines(
  comparison: ComparisonView,
  targetName: string,
): string[] {
  const lines: string[] = [];
  if (comparison.status !== 'ok') return lines;
  lines.push('【速率指标对照（已是可比口径，直接引用，不要重算）】');
  for (const row of comparison.rows) {
    const unit = row.unit === 'pct' ? '%' : row.unit === 'perMin' ? '/分钟' : '';
    lines.push(
      `- ${row.label}：我 ${row.mine ?? '—'}${unit} / ${targetName} ${row.theirs ?? '—'}${unit}` +
        `（差 ${row.deltaPct !== undefined ? (row.deltaPct > 0 ? '+' : '') + row.deltaPct + '%' : ''}）` +
        `；越${row.better === 'higher' ? '高' : row.better === 'lower' ? '低' : '—'}越好` +
        `${row.note !== undefined ? `｜注意：${row.note}` : ''}`,
    );
  }
  if (comparison.abilities.length > 0) {
    lines.push('', '【技能使用频率对照（次/分钟）】');
    for (const a of comparison.abilities) {
      lines.push(
        `- ${a.name}：我 ${a.minePerMin} / ${targetName} ${a.theirsPerMin}` +
          `（${a.deltaPct !== undefined ? (a.deltaPct > 0 ? '+' : '') + a.deltaPct + '%' : ''}）`,
      );
    }
  }
  if (comparison.rotation !== undefined) {
    const r = comparison.rotation;
    lines.push('', '【逐决策判定档分布（引擎按 Condition→Action 逐次判定）】');
    if (!r.comparable) {
      lines.push(
        `- 两边场景不同（我 ${r.scenarioMine} / ${targetName} ${r.scenarioTheirs}），` +
          '判定档**不可直接横比**：不同的场景会期望不同的动作。必须明确说明这一点，只能做定性参考。',
      );
    }
    lines.push(
      `- 决策数：我 ${r.decisionCountMine} / ${targetName} ${r.decisionCountTheirs}`,
      `- 分布（我）：${JSON.stringify(r.breakdownMine)}`,
      `- 分布（${targetName}）：${JSON.stringify(r.breakdownTheirs)}`,
      r.correctRateMine !== undefined && r.correctRateTheirs !== undefined
        ? `- 正确率（剔除 unknown）：我 ${r.correctRateMine}% / ${targetName} ${r.correctRateTheirs}%` +
          (r.comparable ? '' : '（场景不同，仅供定性参考）')
        : '- （正确率无法计算）',
    );
  }
  if (comparison.phase !== undefined) {
    const p = comparison.phase;
    lines.push('', '【爆发期 vs 非爆发期手法（爆发窗口按施放时刻+知识时长切分，只分桶不定责）】');
    if (!p.comparable) {
      lines.push(
        `- ${targetName}本场没有施放任何爆发技能（可能未点对应天赋）——爆发期无法横比，` +
          '这是天赋构型差异，不是手法定责。不要就此指责玩家手法。',
      );
    }
    lines.push(
      `- 爆发技能（我）：${p.anchorsMine.map((a) => `${a.name} ×${a.castCount}`).join('、') || '—'}`,
      `- 爆发技能（${targetName}）：${p.anchorsTheirs.map((a) => `${a.name} ×${a.castCount}`).join('、') || '—'}`,
    );
    if (p.perWindowDecisionsMine !== undefined && p.perWindowDecisionsTheirs !== undefined) {
      lines.push(
        `- 每次爆发窗口的决策数（GCD 密度，含开爆发那一下）：我 ${p.perWindowDecisionsMine} / ${targetName} ${p.perWindowDecisionsTheirs}`,
      );
    }
    if (p.inBurstCorrectRateMine !== undefined && p.inBurstCorrectRateTheirs !== undefined) {
      lines.push(
        `- 爆发期内正确率：我 ${p.inBurstCorrectRateMine}% / ${targetName} ${p.inBurstCorrectRateTheirs}%`,
      );
    }
    if (p.fillerCorrectRateMine !== undefined && p.fillerCorrectRateTheirs !== undefined) {
      lines.push(
        `- 非爆发期正确率：我 ${p.fillerCorrectRateMine}% / ${targetName} ${p.fillerCorrectRateTheirs}%`,
      );
    }
    lines.push(
      `- 爆发期/非爆发期决策数：我 ${p.inBurstDecisionsMine}/${p.fillerDecisionsMine}，` +
        `${targetName} ${p.inBurstDecisionsTheirs}/${p.fillerDecisionsTheirs}`,
      '- 若爆发期正确率明显低于非爆发期：先说「差距集中在爆发期」并给出窗口内最该改的动作；' +
        '若两边爆发期正确率都高而密度差距大：指向窗口内空转（决策数少）。' +
        '爆发时长是知识近似值，不要把窗口边界当精确时刻引用。',
    );
  }
  if (comparison.rules !== undefined && comparison.rules.rules.length > 0) {
    lines.push('', '【规则遵守度（条件出现时是否打了该打的技能）】');
    for (const r of comparison.rules.rules) {
      const delta =
        r.deltaPp !== undefined
          ? `（差距 ${r.deltaPp > 0 ? '+' : ''}${r.deltaPp}pp）`
          : r.comparable
            ? ''
            : '（样本少，不标差距）';
      lines.push(
        `- ${r.label}：我 ${r.mineAdherenceRate ?? '—'}%（${r.mineDecisions} 次条件出现）` +
          ` / ${targetName} ${r.theirsAdherenceRate ?? '—'}%（${r.theirsDecisions} 次）${delta}` +
          `${
            r.mineMistakes + r.theirsMistakes > 0
              ? `（失误 我 ${r.mineMistakes} / ${targetName} ${r.theirsMistakes}）`
              : ''
          }`,
      );
    }
    lines.push(
      '- 这是手法差异最细的一层：优先解释「差距最大的规则」——条件出现时该打什么没打什么，' +
        '给出具体情景和改正动作。样本 <3 的规则不可下结论；低置信度规则（<0.6）只解释不定责。',
    );
  }
  lines.push(
    '',
    '【问题（finding）差异】',
    comparison.findingsOnlyMine.length === 0
      ? `- 引擎规则命中的问题里，没有「只有我有、${targetName}没有」的条目（说明这些规则对两边都会触发，差异不在是否触发，而在频率与占比）。`
      : `- 只有我有（=差异点）：${comparison.findingsOnlyMine.join('；')}`,
    comparison.findingsShared.length > 0
      ? `- 双方都有（不构成差异）：${comparison.findingsShared.join('；')}`
      : '',
  );
  return lines.filter((line) => line !== '');
}

export function buildComparisonUserMessage(
  comparison: ComparisonView,
  originalMessage: string,
  targetName = TARGET_NOUN,
): string {
  const lines: string[] = [
    `请做「与同副本同专精${targetName}逐场对标」。用户原话：「${originalMessage}」`,
    '',
    `【对标对象】${
      comparison.target
        ? `第 ${comparison.target.rank} 名 ${comparison.target.name}` +
          `${comparison.target.keyLevel !== undefined ? `（+${comparison.target.keyLevel}）` : ''}` +
          ` ${Math.round(comparison.target.amount)} DPS` +
          `${comparison.target.runUrl !== undefined ? ` — ${comparison.target.runUrl}` : ''}`
        : '（未取到）'
    }`,
    `【我】${comparison.mine.playerName}` +
      `${comparison.mine.keyLevel !== undefined ? `（+${comparison.mine.keyLevel}）` : ''}`,
    `【引擎给出的对照前提】${comparison.notice}`,
    '',
  ];

  if (comparison.status !== 'ok') {
    lines.push(
      '本次对标未能完成（原因见上）。请如实说明缺什么、玩家可以点哪里自己看，不要编造任何对照数字。',
    );
    return lines.join('\n');
  }

  lines.push(...comparisonBodyLines(comparison, targetName));
  lines.push(
    '',
    '请用中文回答，结构：① 一句话结论（我最该改的一件事）→ ② 差距最明显的 2-3 项，每项引用上面的具体数字 → ③ 建议怎么练。',
    '铁律：不得把差值说成「超过/落后 X% 玩家」或「同层分位」；层数不同时不得把 DPS 差额整体归因为手法；场景不同时不得直接横比判定档分布。不要编造上面没有的数字。',
  );

  return lines.filter((line) => line !== '').join('\n');
}

/** Multi-target variant: one section per comparison, one combined ask. */
export function buildMultiComparisonUserMessage(
  comparisons: ComparisonView[],
  originalMessage: string,
): string {
  const sections = comparisons.map((comparison, i) => {
    const rank = comparison.target?.rank ?? i + 1;
    const name = comparison.target?.name ?? `第 ${rank} 名`;
    const label =
      comparison.target?.keyLevel !== undefined
        ? `${name}（+${comparison.target.keyLevel}）`
        : name;
    return (
      `【第 ${i + 1} 位：${label}】\n` +
      buildComparisonUserMessage(comparison, originalMessage, label)
    );
  });
  return (
    sections.join('\n\n==========\n\n') +
    `\n\n【最后要求】上面是同一场战斗分别对 ${comparisons.length} 位顶尖玩家的对照。` +
    '请分别简述每位的关键差距（各 2-3 行），然后：① 指出差距最大、最值得学习的一位；' +
    '② 综合所有对照给出你最该改的第一件事（引用具体数字）。遵守上面各节的铁律，不编造数字。'
  );
}

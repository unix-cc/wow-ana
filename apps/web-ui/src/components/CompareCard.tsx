import { useState, type JSX } from 'react';
import type { ComparisonView } from '../types';
import { formatAmount } from '../format';

/** Ability rows shown before the table needs an explicit expand. */
const INLINE_ABILITIES = 5;

const SCENARIO_LABEL: Record<string, string> = {
  st: '单目标',
  aoe: '多目标',
  unknown: '未判定',
};

/**
 * Head-to-head comparison against the ranked run of the same dungeon & spec
 * (Phase AF: 榜首逐场对标).
 *
 * This card answers a different question from `ReferenceCard`: the baseline
 * says *how far* behind the player is, this says *where*. It is deliberately
 * built around the three honest caveats baked into the model:
 *
 *  1. `notice` is always shown — the two runs are not a controlled experiment
 *     (different key levels, gear and routes), so a DPS gap is not a verdict.
 *  2. Only rate-normalised numbers are compared (per-minute casts, idle share),
 *     because the fights have different lengths.
 *  3. The verdict distribution is only presented as a head-to-head when the
 *     engine evaluated both runs in the same scenario; otherwise the card says
 *     so instead of drawing a misleading comparison.
 *
 * Numbers are shown as the engine produced them — no recomputation here.
 */
export function CompareCard({
  comparison,
}: {
  comparison: ComparisonView;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  if (comparison.status !== 'ok') {
    return (
      <div className="compare-card">
        <div className="compare-head">
          <div className="compare-head-main">
            <span className="compare-title">榜首逐场对标</span>
            <span className="compare-status">未能完成</span>
          </div>
          {comparison.target?.runUrl !== undefined && (
            <a
              className="compare-run-link"
              href={comparison.target.runUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              打开榜首那一场 ↗
            </a>
          )}
        </div>
        <div className="compare-notice">{comparison.notice}</div>
      </div>
    );
  }

  const { target, mine, rows, abilities, rotation, phase, rules } = comparison;
  const visibleAbilities = expanded ? abilities : abilities.slice(0, INLINE_ABILITIES);
  const hiddenAbilities = abilities.length - visibleAbilities.length;

  return (
    <div className="compare-card">
      <div className="compare-head">
        <div className="compare-head-main">
          <span className="compare-title">榜首逐场对标</span>
          {target !== undefined && (
            <span className="compare-target">
              第 {target.rank} 名 {target.name}
              {target.keyLevel !== undefined ? ` · +${target.keyLevel}` : ''} ·{' '}
              {formatAmount(target.amount)} DPS
            </span>
          )}
        </div>
        {/* The permalink to the opponent's log lives in the header, right
            beside the name it refers to — not buried at the bottom of a long
            card, where it is effectively invisible. */}
        {target?.runUrl !== undefined && (
          <a
            className="compare-run-link"
            href={target.runUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            打开榜首那一场 ↗
          </a>
        )}
      </div>

      <div className="compare-pair">
        <span className="compare-side">我：{mine.playerName}
          {mine.keyLevel !== undefined ? ` +${mine.keyLevel}` : ''}
        </span>
        <span className="compare-side">
          榜首：{target?.name ?? '—'}
          {target?.keyLevel !== undefined ? ` +${target.keyLevel}` : ''}
        </span>
      </div>

      <table className="compare-table">
        <thead>
          <tr>
            <th>指标</th>
            <th>我</th>
            <th>榜首</th>
            <th>差距</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const favourable =
              row.better === 'neutral' || row.deltaPct === undefined
                ? undefined
                : row.better === 'higher'
                  ? row.deltaPct >= 0
                  : row.deltaPct <= 0;
            const unit = row.unit === 'pct' ? '%' : '';
            return (
              <tr key={row.key}>
                <td className="compare-label">
                  {row.label}
                  {row.note !== undefined && (
                    <span className="compare-note" title={row.note}>
                      {' '}
                      *
                    </span>
                  )}
                </td>
                <td>{row.mine !== undefined ? `${row.mine}${unit}` : '—'}</td>
                <td>{row.theirs !== undefined ? `${row.theirs}${unit}` : '—'}</td>
                <td
                  className={
                    favourable === undefined
                      ? ''
                      : favourable
                        ? 'compare-gain'
                        : 'compare-loss'
                  }
                >
                  {row.deltaPct !== undefined
                    ? `${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%`
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.some((row) => row.note !== undefined) && (
        <ul className="compare-notes">
          {rows
            .filter((row) => row.note !== undefined)
            .map((row) => (
              <li key={`note-${row.key}`}>
                ＊ {row.label}：{row.note}
              </li>
            ))}
        </ul>
      )}

      {rotation !== undefined && (
        <div className="compare-rotation">
          <div className="compare-subhead">
            逐决策判定档（引擎按 Condition→Action 逐次判定）
          </div>
          {!rotation.comparable && (
            <div className="compare-warn">
              两边场景不同（我 {SCENARIO_LABEL[rotation.scenarioMine] ?? rotation.scenarioMine} /
              榜首 {SCENARIO_LABEL[rotation.scenarioTheirs] ?? rotation.scenarioTheirs}），
              判定档不可直接横比，仅供参考。
            </div>
          )}
          <div className="compare-verdicts">
            {(
              [
                ['correct', '正确', 'compare-gain'],
                ['suboptimal', '次优', 'compare-warn-text'],
                ['mistake', '失误', 'compare-loss'],
                ['unknown', '未判定', 'compare-muted'],
              ] as const
            ).map(([key, label, className]) => {
              const mineCount = rotation.breakdownMine[key] ?? 0;
              const theirsCount = rotation.breakdownTheirs[key] ?? 0;
              return (
                <div key={key} className="compare-verdict">
                  <span className="compare-verdict-label">{label}</span>
                  <span className={`compare-verdict-value ${className}`}>{mineCount}</span>
                  <span className="compare-verdict-sep">/</span>
                  <span className="compare-verdict-value">{theirsCount}</span>
                </div>
              );
            })}
          </div>
          {rotation.correctRateMine !== undefined &&
            rotation.correctRateTheirs !== undefined && (
              <div className="compare-rates">
                正确率（剔除未判定）：我 {rotation.correctRateMine}% / 榜首{' '}
                {rotation.correctRateTheirs}%
                {!rotation.comparable && '（场景不同，仅定性参考）'}
              </div>
            )}
        </div>
      )}

      {phase !== undefined && (
        <div className="compare-phase">
          <div className="compare-subhead">爆发期 vs 非爆发期手法</div>
          {!phase.comparable && (
            <div className="compare-warn">
              榜首本场没有施放任何爆发技能（可能未点对应天赋），两边爆发期无可横比——
              这是天赋构型差异，不是手法定责。
            </div>
          )}
          <table className="compare-table">
            <thead>
              <tr>
                <th>爆发阶段指标</th>
                <th>我</th>
                <th>榜首</th>
              </tr>
            </thead>
            <tbody>
              {phase.anchorsMine.length > 0 && (
                <tr>
                  <td className="compare-label">爆发技能</td>
                  <td>
                    {phase.anchorsMine.map((a) => (
                      <span key={a.name} className="compare-chip">
                        {a.name} ×{a.castCount}
                      </span>
                    ))}
                  </td>
                  <td>
                    {phase.anchorsTheirs.map((a) => (
                      <span key={a.name} className="compare-chip">
                        {a.name} ×{a.castCount}
                      </span>
                    ))}
                  </td>
                </tr>
              )}
              {phase.perWindowDecisionsMine !== undefined &&
                phase.perWindowDecisionsTheirs !== undefined && (
                  <tr>
                    <td className="compare-label">每次爆发窗口的决策数（GCD 密度）</td>
                    <td>{phase.perWindowDecisionsMine}</td>
                    <td>{phase.perWindowDecisionsTheirs}</td>
                  </tr>
                )}
              {phase.inBurstCorrectRateMine !== undefined &&
                phase.inBurstCorrectRateTheirs !== undefined && (
                  <tr>
                    <td className="compare-label">爆发期内正确率</td>
                    <td
                      className={
                        phase.inBurstCorrectRateMine >= phase.inBurstCorrectRateTheirs
                          ? 'compare-gain'
                          : 'compare-loss'
                      }
                    >
                      {phase.inBurstCorrectRateMine}%
                    </td>
                    <td>{phase.inBurstCorrectRateTheirs}%</td>
                  </tr>
                )}
              {phase.fillerCorrectRateMine !== undefined &&
                phase.fillerCorrectRateTheirs !== undefined && (
                  <tr>
                    <td className="compare-label">非爆发期正确率</td>
                    <td
                      className={
                        phase.fillerCorrectRateMine >= phase.fillerCorrectRateTheirs
                          ? 'compare-gain'
                          : 'compare-loss'
                      }
                    >
                      {phase.fillerCorrectRateMine}%
                    </td>
                    <td>{phase.fillerCorrectRateTheirs}%</td>
                  </tr>
                )}
              <tr>
                <td className="compare-label">爆发期 / 非爆发期决策数</td>
                <td>
                  {phase.inBurstDecisionsMine} / {phase.fillerDecisionsMine}
                </td>
                <td>
                  {phase.inBurstDecisionsTheirs} / {phase.fillerDecisionsTheirs}
                </td>
              </tr>
            </tbody>
          </table>
          <ul className="compare-notes">
            <li>
              ＊ 爆发窗口按技能施放时刻 + 知识声明的时长切分（WCL 不返回爆发 aura
              事件，见探针结论）；窗口只用于分桶，不参与定责。
            </li>
          </ul>
        </div>
      )}

      {rules !== undefined && rules.rules.length > 0 && (
        <div className="compare-rules">
          <div className="compare-subhead">规则遵守度（条件出现时，是否打了该打的技能）</div>
          <table className="compare-table">
            <thead>
              <tr>
                <th>规则（条件 → 动作）</th>
                <th>我</th>
                <th>榜首</th>
                <th>差距</th>
              </tr>
            </thead>
            <tbody>
              {rules.rules.map((r) => (
                <tr key={r.ruleId}>
                  <td className="compare-label">
                    {r.label}
                    {r.mineMistakes + r.theirsMistakes > 0 && (
                      <span className="compare-chip-mistake" title={`失误次数 我 ${r.mineMistakes} / 榜首 ${r.theirsMistakes}`}>
                        失误 {r.mineMistakes}/{r.theirsMistakes}
                      </span>
                    )}
                    {r.confidence !== undefined && r.confidence < 0.6 && (
                      <span className="compare-muted" title="低置信度知识，只解释不定责">
                        低置信
                      </span>
                    )}
                  </td>
                  <td>
                    {r.mineAdherenceRate !== undefined
                      ? `${r.mineAdherenceRate}%`
                      : '—'}
                    <span className="compare-muted"> (n={r.mineDecisions})</span>
                  </td>
                  <td>
                    {r.theirsAdherenceRate !== undefined
                      ? `${r.theirsAdherenceRate}%`
                      : '—'}
                    <span className="compare-muted"> (n={r.theirsDecisions})</span>
                  </td>
                  <td
                    className={
                      r.deltaPp === undefined
                        ? 'compare-muted'
                        : r.deltaPp >= 0
                          ? 'compare-gain'
                          : 'compare-loss'
                    }
                  >
                    {r.deltaPp !== undefined
                      ? `${r.deltaPp > 0 ? '+' : ''}${r.deltaPp}pp`
                      : r.comparable
                        ? '—'
                        : '样本少'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="compare-notes">
            <li>
              ＊ 遵守率 = 该条件出现时实际打出对应技能的比例；任一边样本 &lt; 3
              次不标差距（样本少）。低置信度规则（&lt; 0.6）只作解释、不作定责。
            </li>
          </ul>
        </div>
      )}

      {abilities.length > 0 && (
        <div className="compare-abilities">
          <div className="compare-subhead">技能使用频率（次/分钟）</div>
          <table className="compare-table">
            <thead>
              <tr>
                <th>技能</th>
                <th>我</th>
                <th>榜首</th>
                <th>差距</th>
              </tr>
            </thead>
            <tbody>
              {visibleAbilities.map((ability) => (
                <tr key={ability.name}>
                  <td className="compare-label">{ability.name}</td>
                  <td>{ability.minePerMin}</td>
                  <td>{ability.theirsPerMin}</td>
                  <td
                    className={
                      ability.deltaPct === undefined
                        ? ''
                        : ability.deltaPct >= 0
                          ? 'compare-gain'
                          : 'compare-loss'
                    }
                  >
                    {ability.deltaPct !== undefined
                      ? `${ability.deltaPct > 0 ? '+' : ''}${ability.deltaPct}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hiddenAbilities > 0 && (
            <button
              type="button"
              className="reference-more"
              onClick={() => setExpanded(true)}
            >
              展开剩余 {hiddenAbilities} 个技能
            </button>
          )}
          {expanded && abilities.length > INLINE_ABILITIES && (
            <button
              type="button"
              className="reference-more"
              onClick={() => setExpanded(false)}
            >
              收起
            </button>
          )}
        </div>
      )}

      {(comparison.findingsOnlyMine.length > 0 ||
        comparison.findingsShared.length > 0) && (
        <div className="compare-findings">
          {comparison.findingsOnlyMine.length > 0 && (
            <>
              <div className="compare-subhead">只有我犯的问题（差异点）</div>
              <ul className="compare-finding-list">
                {comparison.findingsOnlyMine.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </>
          )}
          {comparison.findingsOnlyMine.length === 0 && (
            <div className="compare-warn">
              引擎规则命中的问题里没有「只有我有」的条目——两边都会触发同样的规则，
              所以差异不在是否触发，而在上面的频率与占比。
            </div>
          )}
          {comparison.findingsShared.length > 0 && (
            <details className="compare-details">
              <summary>两边都命中的问题（{comparison.findingsShared.length}）</summary>
              <ul className="compare-finding-list">
                {comparison.findingsShared.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="compare-notice">{comparison.notice}</div>
    </div>
  );
}

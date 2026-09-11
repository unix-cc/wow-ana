import type { JSX } from 'react';
import type { AnalysisArtifact, ArtifactFinding, ArtifactRotation } from '../types';
import { FindingCard } from './FindingCard';
import { ReferenceCard } from './ReferenceCard';
import { formatDuration, verdictLabel } from '../format';

/**
 * The structured analysis, rendered inline in the conversation.
 *
 * Progressive disclosure is the whole point: the stream shows the run header,
 * the score, and a scannable list of findings. Anything deeper (evidence,
 * expected-vs-actual, per-decision verdicts) is one click away in the drawer —
 * so the answer stays readable and nothing important is buried under a table.
 */
export function ArtifactView({
  artifact,
  onOpenFinding,
  onCompare,
}: {
  artifact: AnalysisArtifact;
  onOpenFinding: (finding: ArtifactFinding) => void;
  /**
   * Ask for a head-to-head comparison against the ranked run. Only offered
   * when the artifact actually carries a baseline — there is nothing to
   * compare against otherwise.
   */
  onCompare?: (() => void) | undefined;
}): JSX.Element {
  const { run, findings, reference, rotation, score } = artifact;

  return (
    <div className="artifact">
      <div className="artifact-head">
        <div className="artifact-run">
          <span className="artifact-fight">{run.fightName ?? `Fight ${run.fightId}`}</span>
          <span className="artifact-sub">
            {run.playerName}
            {run.specName !== undefined ? ` · ${run.specName}` : ''}
            {' · '}
            {formatDuration(run.durationMs)}
          </span>
        </div>
        {score !== undefined && (
          <div className="artifact-score">
            <span className="artifact-score-value">{score}</span>
            <span className="artifact-score-unit">/ 100</span>
          </div>
        )}
      </div>

      {artifact.reportUrl !== undefined && (
        <div className="artifact-links">
          <a href={artifact.reportUrl} target="_blank" rel="noopener noreferrer">
            查看本场原始日志 ↗
          </a>
        </div>
      )}

      {findings.length === 0 ? (
        <div className="artifact-empty">
          这一步没查出明确问题（可能是知识未覆盖，或这场的表现确实平稳）。
        </div>
      ) : (
        <div className="artifact-findings">
          <div className="artifact-section-title">
            问题清单
            <span className="artifact-count">{findings.length}</span>
          </div>
          {findings.map((finding, index) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              index={index}
              onOpen={onOpenFinding}
            />
          ))}
          {artifact.findingsCapped === true && (
            <div className="artifact-note">仅显示最严重的前若干条。</div>
          )}
        </div>
      )}

      {reference !== undefined && (
        <ReferenceCard reference={reference} onCompare={onCompare} />
      )}

      {rotation !== undefined && <RotationStrip rotation={rotation} />}
    </div>
  );
}

/** One-line verdict distribution — the rotation digest, not a chart. */
function RotationStrip({ rotation }: { rotation: ArtifactRotation }): JSX.Element {
  const order = ['correct', 'acceptable', 'suboptimal', 'mistake', 'unknown'] as const;
  const total = rotation.decisionCount || 1;
  return (
    <div className="rotation-strip">
      <div className="rotation-head">
        <span>技能循环判定</span>
        <span className="rotation-meta">
          {rotation.scenario === 'aoe' ? '多目标' : rotation.scenario === 'st' ? '单目标' : '场景未知'}
          {' · '}
          {rotation.decisionCount} 次决策
        </span>
      </div>
      <div className="rotation-bar">
        {order.map((verdict) => {
          const count = rotation.breakdown[verdict] ?? 0;
          if (count === 0) return null;
          return (
            <span
              key={verdict}
              className={`rotation-seg verdict-${verdict}`}
              style={{ flexGrow: count }}
              title={`${verdictLabel(verdict)} ${count} 次`}
            />
          );
        })}
      </div>
      <div className="rotation-legend">
        {order.map((verdict) => {
          const count = rotation.breakdown[verdict] ?? 0;
          if (count === 0) return null;
          return (
            <span key={verdict} className={`rotation-legend-item verdict-${verdict}`}>
              {verdictLabel(verdict)} {Math.round((count / total) * 100)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

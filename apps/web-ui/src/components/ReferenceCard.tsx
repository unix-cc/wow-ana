import { useState, type JSX } from 'react';
import type { ArtifactReference } from '../types';
import { formatAmount } from '../format';

/** Runs shown before the list needs an explicit expand. */
const INLINE_RUNS = 3;

/**
 * The reference baseline, stated plainly — and **linked**.
 *
 * This is the part the user asked to be clearer, and to keep small: the pool is
 * the top 10 runs (not 100), so the card can show the *whole* pool rather than a
 * slice of it. For a Mythic+ run the pool is *not* a same-key-level cohort (the
 * rankings API cannot filter by keystone level), so the card always shows three
 * things together: the player's own key level, the level range the pool
 * actually contains, and the gap to the pool median.
 *
 * Progressive disclosure still applies — three runs inline, the rest behind a
 * toggle — so the card stays scannable without hiding data we already fetched.
 */
export function ReferenceCard({
  reference,
  onCompare,
  onCompareRun,
}: {
  reference: ArtifactReference;
  /**
   * Trigger the head-to-head comparison (Phase AF). The engine has to
   * re-analyse the ranked run to build it, so it is an explicit action rather
   * than something every analysis does.
   */
  onCompare?: (() => void) | undefined;
  /**
   * Compare against a specific pool entry (1-based rank, Phase AI). The
   * button sends a normal user message like "…对比一下 #3" so the turn is
   * reproducible in the transcript.
   */
  onCompareRun?: ((rank: number) => void) | undefined;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const { stats, player, poolLevels, keyLevel, topRuns } = reference;
  const gap = player?.gapVsP50Pct;
  const visibleRuns = expanded ? topRuns : topRuns.slice(0, INLINE_RUNS);
  const hiddenCount = topRuns.length - visibleRuns.length;

  return (
    <div className="reference-card">
      <div className="reference-head">
        <span className="reference-title">与高分玩家对比</span>
        <span className="reference-encounter">
          {reference.encounterName} · {reference.specName} · 前 {reference.count} 名
        </span>
      </div>

      <div className="reference-facts">
        <div className="reference-fact">
          <span className="reference-fact-label">本场层级</span>
          <span className="reference-fact-value">
            {keyLevel !== undefined ? `+${keyLevel}` : '—'}
          </span>
        </div>
        <div className="reference-fact">
          <span className="reference-fact-label">基线池层级</span>
          <span className="reference-fact-value">
            {poolLevels !== undefined
              ? `+${poolLevels.min}~+${poolLevels.max}`
              : '—'}
          </span>
        </div>
        <div className="reference-fact">
          <span className="reference-fact-label">池中位 DPS</span>
          <span className="reference-fact-value">{formatAmount(stats.p50)}</span>
        </div>
        <div className="reference-fact">
          <span className="reference-fact-label">与池中位差距</span>
          <span
            className={`reference-fact-value ${
              typeof gap === 'number' ? (gap >= 0 ? 'up' : 'down') : ''
            }`}
          >
            {typeof gap === 'number'
              ? `${gap > 0 ? '+' : ''}${gap.toFixed(1)}%`
              : '—'}
          </span>
        </div>
      </div>

      {reference.pool !== undefined && (
        <div className="reference-pool">{reference.pool}</div>
      )}

      <div className="reference-links">
        {reference.rankingsUrl !== undefined && (
          <a
            className="reference-link"
            href={reference.rankingsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            榜单总览 ↗
          </a>
        )}
        {onCompare !== undefined && topRuns.length > 0 && (
          <button type="button" className="reference-compare" onClick={onCompare}>
            与榜首逐场对比（会读取榜首那一场日志）
          </button>
        )}
      </div>

      {topRuns.length > 0 && (
        <div className="reference-runs">
          <div className="reference-runs-head">榜首实况（可点开看打法）</div>
          <ol className="reference-run-list">
            {visibleRuns.map((run, index) => (
              <li key={`${run.name}-${index}`} className="reference-run">
                <span className="reference-run-rank">{index + 1}</span>
                <span className="reference-run-name">{run.name}</span>
                {run.keyLevel !== undefined && (
                  <span className="reference-run-level">+{run.keyLevel}</span>
                )}
                <span className="reference-run-amount">{formatAmount(run.amount)}</span>
                {run.runUrl !== undefined ? (
                  <a
                    className="reference-run-link"
                    href={run.runUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    日志 ↗
                  </a>
                ) : (
                  <span className="reference-run-nolink">无日志</span>
                )}
                {onCompareRun !== undefined && (
                  <button
                    type="button"
                    className="reference-run-compare"
                    onClick={() => onCompareRun(index + 1)}
                  >
                    对比此人
                  </button>
                )}
              </li>
            ))}
          </ol>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="reference-more"
              onClick={() => setExpanded(true)}
            >
              展开剩余 {hiddenCount} 条
            </button>
          )}
          {expanded && topRuns.length > INLINE_RUNS && (
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
    </div>
  );
}

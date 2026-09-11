import { useEffect, type JSX } from 'react';
import type { ArtifactEvidence, ArtifactFinding } from '../types';
import {
  categoryLabel,
  formatClock,
  formatEvidenceValue,
  formatRecord,
  severityMeta,
  verdictLabel,
} from '../format';

/**
 * Right-hand detail drawer: the "Inspector" half of the Agent pattern.
 *
 * The conversation stays a single readable column; clicking a finding opens
 * this panel with everything the engine knows about it — evidence timepoints,
 * expected vs actual, the model's recommendation — without pushing the prose
 * off screen. Closes on Escape or backdrop click.
 */
export function DetailDrawer({
  finding,
  onClose,
}: {
  finding: ArtifactFinding | undefined;
  onClose: () => void;
}): JSX.Element | null {
  useEffect(() => {
    if (finding === undefined) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finding, onClose]);

  if (finding === undefined) return null;

  const severity = severityMeta(finding.severity);
  const expected = formatRecord(finding.expected);
  const actual = formatRecord(finding.actual);

  return (
    <div className="drawer-layer">
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={finding.title}>
        <header className="drawer-head">
          <div className="drawer-head-top">
            <span className={`finding-sev sev-${severity.modifier}`}>
              {severity.label}
            </span>
            <span className="finding-cat">{categoryLabel(finding.category)}</span>
            {finding.verdict !== undefined && (
              <span className={`finding-verdict verdict-${finding.verdict}`}>
                {verdictLabel(finding.verdict)}
              </span>
            )}
            <button
              type="button"
              className="drawer-close"
              onClick={onClose}
              aria-label="关闭"
            >
              关闭
            </button>
          </div>
          <h3 className="drawer-title">{finding.title}</h3>
          <div className="drawer-id">
            {finding.id}
            {finding.confidence !== undefined && (
              <>
                {' · '}置信度 {(finding.confidence * 100).toFixed(0)}%
              </>
            )}
          </div>
        </header>

        {finding.description !== undefined && (
          <section className="drawer-section">
            <h4>现象</h4>
            <p>{finding.description}</p>
          </section>
        )}

        {(expected.length > 0 || actual.length > 0) && (
          <section className="drawer-section">
            <h4>期望 vs 实际</h4>
            <div className="drawer-compare">
              <div className="drawer-compare-col">
                <span className="drawer-compare-label">理论</span>
                {expected.length === 0 ? (
                  <span className="drawer-compare-empty">—</span>
                ) : (
                  expected.map((row) => (
                    <span key={row.key} className="drawer-kv">
                      <em>{row.key}</em>
                      {row.value}
                    </span>
                  ))
                )}
              </div>
              <div className="drawer-compare-col">
                <span className="drawer-compare-label">实际</span>
                {actual.length === 0 ? (
                  <span className="drawer-compare-empty">—</span>
                ) : (
                  actual.map((row) => (
                    <span key={row.key} className="drawer-kv">
                      <em>{row.key}</em>
                      {row.value}
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        <section className="drawer-section">
          <h4>
            证据
            <span className="drawer-count">{finding.evidence.length}</span>
          </h4>
          {finding.evidence.length === 0 ? (
            <p className="drawer-empty">这条没有附带证据点。</p>
          ) : (
            <ol className="drawer-evidence">
              {finding.evidence.map((point, index) => (
                <EvidenceRow key={index} point={point} />
              ))}
            </ol>
          )}
          {finding.evidenceCapped === true && (
            <p className="drawer-empty">仅显示前若干条证据。</p>
          )}
        </section>

        {finding.recommendation !== undefined && (
          <section className="drawer-section">
            <h4>建议</h4>
            <p>{finding.recommendation}</p>
          </section>
        )}
      </aside>
    </div>
  );
}

function EvidenceRow({ point }: { point: ArtifactEvidence }): JSX.Element {
  const value = formatEvidenceValue(point.value, point.unit);
  return (
    <li className="evidence-row">
      {point.timestamp !== undefined && (
        <span className="evidence-time">{formatClock(point.timestamp)}</span>
      )}
      {point.expectedAt !== undefined && (
        <span className="evidence-expected">
          理论 {formatClock(point.expectedAt)}
        </span>
      )}
      {point.ability !== undefined && (
        <span className="evidence-ability">{point.ability}</span>
      )}
      {value !== undefined && <span className="evidence-value">{value}</span>}
      {point.note !== undefined && <span className="evidence-note">{point.note}</span>}
    </li>
  );
}

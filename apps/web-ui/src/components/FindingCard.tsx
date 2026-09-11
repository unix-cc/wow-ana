import type { JSX } from 'react';
import type { ArtifactFinding } from '../types';
import {
  categoryLabel,
  formatClock,
  severityMeta,
  verdictLabel,
} from '../format';

/**
 * A finding rendered as a Linear **issue** rather than a paragraph: severity
 * badge, category, timestamp, and a one-line impact — dense, scannable, and
 * clickable. The detail (evidence, expected vs actual, the model's reasoning)
 * lives in the drawer so the chat stream stays readable.
 */
export function FindingCard({
  finding,
  index,
  onOpen,
}: {
  finding: ArtifactFinding;
  index: number;
  onOpen: (finding: ArtifactFinding) => void;
}): JSX.Element {
  const severity = severityMeta(finding.severity);
  const firstEvidence = finding.evidence[0];

  return (
    <button
      type="button"
      className={`finding-card sev-${severity.modifier}`}
      onClick={() => onOpen(finding)}
      title="查看证据与详细分析"
    >
      <span className="finding-rank">{String(index + 1).padStart(2, '0')}</span>

      <span className="finding-main">
        <span className="finding-top">
          <span className={`finding-sev sev-${severity.modifier}`}>
            {severity.label}
          </span>
          <span className="finding-cat">{categoryLabel(finding.category)}</span>
          {finding.verdict !== undefined && (
            <span className={`finding-verdict verdict-${finding.verdict}`}>
              {verdictLabel(finding.verdict)}
            </span>
          )}
          {firstEvidence?.timestamp !== undefined && (
            <span className="finding-time">{formatClock(firstEvidence.timestamp)}</span>
          )}
        </span>
        <span className="finding-title">{finding.title}</span>
      </span>

      <span className="finding-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}

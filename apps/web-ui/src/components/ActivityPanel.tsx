import { useState, type JSX } from 'react';
import type { ActivityStep } from '../types';

/**
 * Codex-style activity panel: *what the pipeline actually did*.
 *
 * The distinction that matters is conversation vs activity — the prose answer
 * is the conversation; report parsing, event paging and analyzer runs are
 * activity. Activity is collapsed by default and only surfaces a one-line
 * summary, because the user cares that it worked, not how many GraphQL calls
 * it took.
 */
export function ActivityPanel({ steps }: { steps: ActivityStep[] }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  const running = steps.find((step) => step.status === 'running');
  const failed = steps.some((step) => step.status === 'failed');
  const summary = running
    ? running.label
    : failed
      ? '分析中断'
      : `已完成 ${steps.length} 个分析步骤`;

  return (
    <div className={`activity ${open ? 'open' : ''} ${failed ? 'failed' : ''}`}>
      <button
        type="button"
        className="activity-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`activity-dot ${running ? 'running' : failed ? 'failed' : 'done'}`} />
        <span className="activity-title">{summary}</span>
        {!open && !running && (
          <span className="activity-hint">查看 {steps.length} 步</span>
        )}
        <span className={`activity-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <ol className="activity-steps">
          {steps.map((step) => (
            <li key={step.id} className={`activity-step ${step.status}`}>
              <span className={`activity-mark ${step.status}`} aria-hidden="true" />
              <span className="activity-label">{step.label}</span>
              {step.detail !== undefined && (
                <span className="activity-detail">{step.detail}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

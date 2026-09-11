// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailDrawer } from '../../src/components/DetailDrawer';
import type { ArtifactFinding } from '../../src/types';

const finding: ArtifactFinding = {
  id: 'bm_hunter.cooldown_delay',
  category: 'cooldown',
  severity: 'high',
  title: '狂野怒火 使用存在延迟',
  description: '平均延迟 4.2s，最大延迟 4.2s（共使用 3 次）。',
  verdict: 'suboptimal',
  confidence: 0.9,
  recommendation: '冷却就绪后尽快使用 狂野怒火 (Bestial Wrath)。',
  expected: { ability: '狂野怒火 (Bestial Wrath)', cooldownMs: 90_000 },
  actual: { casts: 3, avgDelayMs: 4200 },
  evidence: [
    {
      timestamp: 92_300,
      expectedAt: 88_100,
      ability: '狂野怒火 (Bestial Wrath)',
      abilityId: 19574,
      value: 4200,
      unit: 'ms',
      note: 'actual cast vs ideal cooldown slot',
    },
  ],
};

describe('DetailDrawer', () => {
  it('renders nothing when no finding is selected', () => {
    const { container } = render(<DetailDrawer finding={undefined} onClose={() => {}} />);
    expect(container.querySelector('.drawer')).toBeNull();
  });

  it('shows the finding as a Linear-style issue detail', () => {
    render(<DetailDrawer finding={finding} onClose={() => {}} />);

    expect(screen.getByText('狂野怒火 使用存在延迟')).toBeDefined();
    expect(screen.getByText('高')).toBeDefined();
    expect(screen.getByText('爆发 / CD')).toBeDefined();
    expect(screen.getByText('次优')).toBeDefined();
    expect(screen.getByText(/置信度 90%/)).toBeDefined();
  });

  it('shows expected vs actual side by side', () => {
    render(<DetailDrawer finding={finding} onClose={() => {}} />);

    expect(screen.getByText('期望 vs 实际')).toBeDefined();
    expect(screen.getByText('理论')).toBeDefined();
    expect(screen.getByText('实际')).toBeDefined();
    expect(screen.getByText('cooldownMs')).toBeDefined();
    expect(screen.getByText('avgDelayMs')).toBeDefined();
  });

  it('formats evidence timepoints and the delay value', () => {
    render(<DetailDrawer finding={finding} onClose={() => {}} />);

    expect(screen.getByText('01:32.3')).toBeDefined();
    expect(screen.getByText('理论 01:28.1')).toBeDefined();
    expect(screen.getByText('4.2s')).toBeDefined();
    // The ability name appears both in the evidence row and in the expected
    // column; the evidence row is the one carrying the id-carrying note.
    expect(document.querySelector('.evidence-ability')?.textContent).toBe(
      '狂野怒火 (Bestial Wrath)',
    );
  });

  it('closes on the close button, the backdrop, and Escape', () => {
    const onClose = vi.fn();
    const { unmount } = render(<DetailDrawer finding={finding} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(document.querySelector('.drawer-backdrop') as Element);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);

    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3); // listener detached on unmount
  });

  it('says so plainly when a finding carries no evidence', () => {
    render(
      <DetailDrawer finding={{ ...finding, evidence: [] }} onClose={() => {}} />,
    );
    expect(screen.getByText('这条没有附带证据点。')).toBeDefined();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../src/components/Sidebar';
import { MODULES } from '../../src/modules';

const sessions = [
  { sessionId: 's1', title: 'WCL 分析 ABC123' },
  { sessionId: 's2', title: 'WCL 分析 XYZ9' },
];

function baseProps() {
  return {
    modules: MODULES,
    activeModule: 'combat' as const,
    sessions,
    currentSessionId: 's1',
    onSelectModule: vi.fn(),
    onNewChat: vi.fn(),
    onSwitchSession: vi.fn(),
    onRemoveSession: vi.fn(),
    onOpenSettings: vi.fn(),
    llmReady: true,
  };
}

describe('Sidebar', () => {
  it('renders every module and marks the active one', () => {
    render(<Sidebar {...baseProps()} />);

    for (const module of MODULES) {
      expect(screen.getByText(module.label)).toBeDefined();
    }
    const active = screen.getByTitle(MODULES[0]!.description);
    expect(active.className).toContain('active');
  });

  it('switches modules via the nav buttons', () => {
    const props = baseProps();
    render(<Sidebar {...props} />);

    fireEvent.click(screen.getByText('团灭复盘'));
    expect(props.onSelectModule).toHaveBeenCalledWith('wipe');
  });

  it('shows an empty state without sessions and lists them otherwise', () => {
    const props = baseProps();
    const { rerender } = render(<Sidebar {...props} />);
    expect(screen.getByText('WCL 分析 ABC123')).toBeDefined();

    rerender(<Sidebar {...props} sessions={[]} />);
    expect(screen.getByText('暂无历史对话')).toBeDefined();
  });

  it('switches to a session on click and deletes without switching', () => {
    const props = baseProps();
    render(<Sidebar {...props} />);

    fireEvent.click(screen.getByText('WCL 分析 XYZ9'));
    expect(props.onSwitchSession).toHaveBeenCalledWith('s2');

    // The first delete button belongs to the current session (s1).
    fireEvent.click(screen.getAllByTitle('删除')[0]!);
    expect(props.onRemoveSession).toHaveBeenCalledWith('s1');
    // stopPropagation: deleting must not trigger a switch.
    expect(props.onSwitchSession).toHaveBeenCalledTimes(1);
  });

  it('opens settings from the footer', () => {
    const props = baseProps();
    render(<Sidebar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /设置/ }));
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

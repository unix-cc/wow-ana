// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from '../../src/App';

/**
 * App-level smoke: the SPA must actually render. Component tests can all pass
 * while a module-level or first-render crash leaves `#root` empty, which is
 * exactly the failure a browser screenshot would show — so this guards it in
 * CI instead.
 */
function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/sessions/')) {
      return new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/sessions')) {
      return new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the shell: sidebar, module heading and welcome screen', async () => {
    const { container } = render(<App />);

    // The shell exists — an empty #root would fail right here.
    expect(container.querySelector('.app')).not.toBeNull();
    expect(container.querySelector('.sidebar')).not.toBeNull();
    expect(container.querySelector('.topbar')).not.toBeNull();

    await waitFor(() => {
      expect(screen.getByText('WCL AI 战斗分析')).toBeDefined();
    });
    expect(screen.getByText('暂无历史对话')).toBeDefined();
  });

  it('probes the backend and reports it as online', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('服务在线')).toBeDefined();
    });
  });

  it('keeps the detail drawer closed until a finding is opened', async () => {
    const { container } = render(<App />);
    await waitFor(() => {
      expect(screen.getByText('WCL AI 战斗分析')).toBeDefined();
    });
    expect(container.querySelector('.drawer')).toBeNull();
  });

  it('opens and closes the settings panel', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('WCL AI 战斗分析')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /设置/ }));
    expect(screen.getByText('LLM 配置')).toBeDefined();
  });
});

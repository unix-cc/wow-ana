import { useCallback, useEffect, useState, type JSX } from 'react';
import type { ArtifactFinding, LlmConfig, ModuleId } from './types';
import { MODULES, DEFAULT_MODULE, getModule } from './modules';
import { isLlmReady, loadSettings, saveSettings } from './api';
import { useChat } from './hooks/useChat';
import { Sidebar } from './components/Sidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { ChatCore } from './components/ChatCore';
import { DetailDrawer } from './components/DetailDrawer';
import { moduleIcon } from './components/Icons';

/** Lightweight probe: is the Node backend reachable? */
function useBackendOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/sessions')
      .then((r) => {
        if (!cancelled) setOnline(r.ok);
      })
      .catch(() => {
        if (!cancelled) setOnline(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return online;
}

export function App(): JSX.Element {
  const [moduleId, setModuleId] = useState<ModuleId>(DEFAULT_MODULE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llm, setLlm] = useState<LlmConfig>(() => loadSettings());
  /** Finding currently open in the detail drawer (undefined = closed). */
  const [openFinding, setOpenFinding] = useState<ArtifactFinding | undefined>(undefined);
  const online = useBackendOnline();

  const chat = useChat();
  const module = getModule(moduleId);

  const handleSend = useCallback(
    (text: string) => {
      chat.send(text, llm);
    },
    [chat.send, llm],
  );
  const handlePick = useCallback(
    (value: string) => {
      chat.pick(value, llm);
    },
    [chat.pick, llm],
  );
  const handleSaveSettings = useCallback((next: LlmConfig) => {
    saveSettings(next);
    setLlm(next);
  }, []);
  const handleOpenFinding = useCallback((finding: ArtifactFinding) => {
    setOpenFinding(finding);
  }, []);
  const handleCloseDrawer = useCallback(() => {
    setOpenFinding(undefined);
  }, []);

  const Icon = moduleIcon(module.id);

  return (
    <div className="app">
      <Sidebar
        modules={MODULES}
        activeModule={moduleId}
        onSelectModule={setModuleId}
        sessions={chat.sessions}
        currentSessionId={chat.sessionId}
        onNewChat={chat.newChat}
        onSwitchSession={chat.switchSession}
        onRemoveSession={chat.removeSession}
        onOpenSettings={() => setSettingsOpen(true)}
        llmReady={isLlmReady(llm)}
      />

      <div className="main">
        <div className="topbar">
          <span className="module-pill">
            <Icon size={14} />
            {module.label}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="subtitle">{module.description}</div>
          </div>
          <div className={`host-status ${online ? 'online' : 'offline'}`}>
            <span className="dot" />
            {online ? '服务在线' : '后端未连接'}
          </div>
        </div>

        {settingsOpen && (
          <SettingsPanel
            config={llm}
            onSave={handleSaveSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {/* Module guide banner — contextual, non-blocking */}
        <div className="module-guide">
          <div className="guide-text">
            <strong>{module.label}</strong> · {module.guide}
          </div>
        </div>

        <ChatCore
          module={module}
          view={chat.view}
          llm={llm}
          onSend={handleSend}
          onPick={handlePick}
          onOpenFinding={handleOpenFinding}
        />
      </div>

      {/* Detail inspector — the "Agent + Inspector" half of the layout. The
          conversation stays one readable column; evidence opens beside it. */}
      <DetailDrawer finding={openFinding} onClose={handleCloseDrawer} />
    </div>
  );
}
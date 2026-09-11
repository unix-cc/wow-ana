import type { JSX } from 'react';
import type { ModuleDef, ModuleId } from '../types';
import { moduleIcon, IconPlus, IconSettings } from './Icons';

export interface SidebarProps {
  modules: ModuleDef[];
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  sessions: Array<{ sessionId: string; title: string }>;
  currentSessionId: string;
  onNewChat: () => void;
  onSwitchSession: (id: string) => void;
  onRemoveSession: (id: string) => void;
  onOpenSettings: () => void;
  llmReady: boolean;
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const {
    modules,
    activeModule,
    onSelectModule,
    sessions,
    currentSessionId,
    onNewChat,
    onSwitchSession,
    onRemoveSession,
    onOpenSettings,
    llmReady,
  } = props;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">W</div>
        <div>
          <div className="brand-name">WCL AI</div>
          <div className="brand-sub">战斗分析平台</div>
        </div>
      </div>

      <div className="sidebar-section">模块</div>
      <nav className="nav">
        {modules.map((m) => {
          const Icon = moduleIcon(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className={`nav-item${activeModule === m.id ? ' active' : ''}`}
              onClick={() => onSelectModule(m.id)}
              title={m.description}
            >
              <span className="nav-icon">
                <Icon size={17} />
              </span>
              {m.label}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-section">历史对话</div>
      <button className="nav-item" type="button" onClick={onNewChat} title="新建对话">
        <span className="nav-icon">
          <IconPlus size={17} />
        </span>
        新建对话
      </button>

      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="session-empty">暂无历史对话</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.sessionId}
              className={`session-item${s.sessionId === currentSessionId ? ' active' : ''}`}
              onClick={() => onSwitchSession(s.sessionId)}
            >
              <span className="title" title={s.title}>
                {s.title}
              </span>
              <button
                className="del"
                type="button"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSession(s.sessionId);
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <button className="btn-settings" type="button" onClick={onOpenSettings}>
          <IconSettings size={16} />
          设置
          <span className={`status-dot${llmReady ? ' ready' : ' miss'}`} key="dot" />
        </button>
      </div>
    </aside>
  );
}
import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import type { ArtifactFinding, LlmConfig, ModuleDef } from '../types';
import { isLlmReady } from '../api';
import { renderMarkdown } from '../markdown';
import { moduleIcon } from './Icons';
import { IconSend } from './Icons';
import { ActivityPanel } from './ActivityPanel';
import { ArtifactView } from './ArtifactView';
import { CompareCard } from './CompareCard';
import type { ChatViewState, ReplyOption, ViewMessage } from '../hooks/useChat';

function UserMessage({ text }: { text: string }): JSX.Element {
  return <div className="message user">{text}</div>;
}

/**
 * The exact wording the compare button sends. It has to match one of the
 * pipeline's compare intents, and it stays a plain user message (rather than a
 * hidden API call) so the conversation reads honestly — the turn really did
 * happen, and it is replayable from history.
 */
export const COMPARE_PROMPT = '和榜首逐场对比一下，我到底差在哪';

/**
 * An assistant message = the parts the turn actually produced, in order.
 * Currently: activity (collapsed) → structured artifact → prose. The prose is
 * the *last* part on purpose — the cards answer "what's wrong", the text
 * explains "why", and anything deeper opens in the drawer.
 */
function AssistantMessage({
  message,
  onOpenFinding,
  onCompare,
}: {
  message: ViewMessage;
  onOpenFinding: (finding: ArtifactFinding) => void;
  onCompare: () => void;
}): JSX.Element {
  const hasError = message.parts.some(
    (part) => part.type === 'text' && part.isError,
  );
  return (
    <div className={`message assistant ${hasError ? 'error' : ''}`}>
      {message.parts.map((part, index) => {
        switch (part.type) {
          case 'activity':
            return <ActivityPanel key={index} steps={part.steps} />;
          case 'artifact':
            return (
              <ArtifactView
                key={index}
                artifact={part.artifact}
                onOpenFinding={onOpenFinding}
                onCompare={onCompare}
              />
            );
          case 'comparison':
            return <CompareCard key={index} comparison={part.comparison} />;
          case 'text':
            return (
              <div
                key={index}
                className={`msg-body ${part.isError ? 'is-error' : ''}`}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }}
              />
            );
        }
      })}
    </div>
  );
}

function TypingIndicator(): JSX.Element {
  return (
    <div className="message assistant">
      <div className="typing">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function Options({
  options,
  onPick,
}: {
  options: ReplyOption[];
  onPick: (value: string) => void;
}): JSX.Element {
  return (
    <div className="options">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ChatCoreProps {
  module: ModuleDef;
  view: ChatViewState;
  llm: LlmConfig;
  onSend: (text: string) => void;
  onPick: (value: string) => void;
  onOpenFinding: (finding: ArtifactFinding) => void;
}

/** Welcome empty state with a module quick-start chip. */
function Welcome({
  module,
  onSend,
}: {
  module: ModuleDef;
  onSend: (text: string) => void;
}): JSX.Element {
  const Icon = moduleIcon(module.id);
  return (
    <div className="welcome">
      <div className="welcome-title">WCL AI 战斗分析</div>
      <div>粘贴 WCL 战斗日志链接开始分析，例如：</div>
      <div className="welcome-code">https://www.warcraftlogs.com/reports/xxxx?fight=8</div>
      <div className="module-chips">
        <button className="module-chip" type="button" onClick={() => onSend(module.sample)}>
          <Icon size={15} /> {module.sample}
        </button>
      </div>
    </div>
  );
}

export function ChatCore({
  module,
  view,
  llm,
  onSend,
  onPick,
  onOpenFinding,
}: ChatCoreProps): JSX.Element {
  const [composer, setComposer] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMessages = view.messages.length > 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.messages, view.options, view.isStreaming]);

  const submit = (): void => {
    if (view.isStreaming) return;
    onSend(composer);
    setComposer('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <div className="chat" ref={scrollRef}>
        {!hasMessages ? (
          <Welcome module={module} onSend={onSend} />
        ) : (
          view.messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessage
                key={`${i}-user`}
                text={m.parts.find((p) => p.type === 'text')?.text ?? ''}
              />
            ) : (
              <AssistantMessage
                key={`${i}-assistant`}
                message={m}
                onOpenFinding={onOpenFinding}
                onCompare={() => onSend(COMPARE_PROMPT)}
              />
            ),
          )
        )}
        {view.isStreaming && <TypingIndicator />}
        {!view.isStreaming && view.options.length > 0 && (
          <Options options={view.options} onPick={onPick} />
        )}
      </div>

      <div className="composer">
        <textarea
          rows={1}
          value={composer}
          placeholder={
            isLlmReady(llm)
              ? module.placeholder
              : '请先在「设置」中填写 LLM Base URL / API Key / 模型'
          }
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={view.isStreaming}
        />
        <button
          className="btn cyan send-btn"
          type="button"
          onClick={submit}
          disabled={view.isStreaming || composer.trim() === ''}
          title="发送"
        >
          <IconSend size={18} />
        </button>
      </div>
    </>
  );
}

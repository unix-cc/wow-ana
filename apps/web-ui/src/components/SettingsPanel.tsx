import { useState, type JSX } from 'react';
import type { LlmConfig } from '../types';

export interface SettingsPanelProps {
  config: LlmConfig;
  onSave: (config: LlmConfig) => void;
  onClose: () => void;
}

export function SettingsPanel({
  config,
  onSave,
  onClose,
}: SettingsPanelProps): JSX.Element {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [saved, setSaved] = useState(false);

  const save = (): void => {
    onSave({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="settings-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>LLM 配置</h3>
        <button className="btn ghost" type="button" onClick={onClose}>
          收起
        </button>
      </div>
      <p className="hint">
        填入你自己的模型接口（OpenAI 兼容）。配置只保存在当前浏览器，不会上传。
      </p>
      <label className="settings-field">
        Base URL
        <input
          type="text"
          value={baseUrl}
          placeholder="https://api.openai.com/v1"
          autoComplete="off"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>
      <label className="settings-field">
        API Key
        <input
          type="password"
          value={apiKey}
          placeholder="sk-..."
          autoComplete="off"
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <label className="settings-field">
        模型
        <input
          type="text"
          value={model}
          placeholder="gpt-4o-mini"
          autoComplete="off"
          onChange={(e) => setModel(e.target.value)}
        />
      </label>
      <div className="settings-actions">
        <button className="btn" type="button" onClick={save}>
          保存
        </button>
        <span className="settings-status">{saved ? '已保存' : ''}</span>
      </div>
    </div>
  );
}
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../../src/components/SettingsPanel';

const config = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-old', model: 'gpt-test' };

describe('SettingsPanel', () => {
  it('prefills inputs from the current config', () => {
    render(
      <SettingsPanel config={config} onSave={() => {}} onClose={() => {}} />,
    );

    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      config.baseUrl,
    );
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe(
      config.apiKey,
    );
    expect((screen.getByLabelText('模型') as HTMLInputElement).value).toBe(
      config.model,
    );
  });

  it('trims values before saving and shows the saved indicator', () => {
    const onSave = vi.fn();
    render(
      <SettingsPanel config={config} onSave={onSave} onClose={() => {}} />,
    );

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: '  https://new.example.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSave).toHaveBeenCalledWith({
      baseUrl: 'https://new.example.com',
      apiKey: 'sk-old',
      model: 'gpt-test',
    });
    expect(screen.getByText('已保存')).toBeDefined();
  });

  it('invokes onClose from the collapse button', () => {
    const onClose = vi.fn();
    render(
      <SettingsPanel config={config} onSave={() => {}} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

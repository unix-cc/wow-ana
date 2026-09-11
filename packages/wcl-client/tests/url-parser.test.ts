import { describe, it, expect } from 'vitest';
import { parseWclUrl } from '../src/url-parser.js';

describe('parseWclUrl', () => {
  it('parses a bare report URL', () => {
    expect(parseWclUrl('https://www.warcraftlogs.com/reports/ABC123')).toEqual({
      reportCode: 'ABC123',
    });
  });

  it('parses a cn report URL', () => {
    expect(parseWclUrl('https://cn.warcraftlogs.com/reports/ABC123')).toEqual({
      reportCode: 'ABC123',
    });
  });

  it('parses a URL with a fight id', () => {
    expect(
      parseWclUrl('https://www.warcraftlogs.com/reports/ABC123?fight=8'),
    ).toEqual({ reportCode: 'ABC123', fightId: 8 });
  });

  it('parses a URL with fight and data type', () => {
    expect(
      parseWclUrl(
        'https://cn.warcraftlogs.com/reports/ABC123?fight=8&type=damage-done',
      ),
    ).toEqual({ reportCode: 'ABC123', fightId: 8, dataType: 'damage-done' });
  });

  it('parses source and target query params', () => {
    expect(
      parseWclUrl(
        'https://www.warcraftlogs.com/reports/ABC123?source=22&target=10',
      ),
    ).toEqual({ reportCode: 'ABC123', source: '22', target: '10' });
  });

  it('throws on empty input', () => {
    expect(() => parseWclUrl('  ')).toThrow('WCL URL is empty');
  });

  it('throws on a non-report URL', () => {
    expect(() => parseWclUrl('https://example.com/foo')).toThrow(
      'Not a valid WCL report URL',
    );
  });

  it('throws on malformed URL', () => {
    expect(() => parseWclUrl('not a url')).toThrow('Invalid WCL URL');
  });
});

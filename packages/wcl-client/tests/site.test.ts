import { describe, it, expect } from 'vitest';
import {
  wclSiteOrigin,
  buildReportUrl,
  buildRankingsUrl,
} from '../src/site.js';

/**
 * The analysis is meant to be *verifiable*: every reference claim should end
 * in a link the player can open. These helpers are the only place URLs are
 * built, so they must follow the host the client actually talks to.
 */
describe('wcl site links', () => {
  it('derives the site origin from the API url (cn deployment stays cn)', () => {
    expect(wclSiteOrigin('https://cn.warcraftlogs.com/api/v2/client')).toBe(
      'https://cn.warcraftlogs.com',
    );
    expect(wclSiteOrigin('https://www.warcraftlogs.com/api/v2/client')).toBe(
      'https://www.warcraftlogs.com',
    );
  });

  it('falls back to the global site on an unparseable API url', () => {
    expect(wclSiteOrigin('not a url')).toBe('https://www.warcraftlogs.com');
  });

  it('builds report permalinks, fight-focused when a fight id is known', () => {
    const origin = 'https://cn.warcraftlogs.com';
    expect(buildReportUrl('abc123', 13, origin)).toBe(
      'https://cn.warcraftlogs.com/reports/abc123#fight=13',
    );
    expect(buildReportUrl('abc123', undefined, origin)).toBe(
      'https://cn.warcraftlogs.com/reports/abc123',
    );
  });

  it('addresses a Mythic+ dungeon by #dungeon= and a raid boss by #boss=', () => {
    const origin = 'https://cn.warcraftlogs.com';
    expect(
      buildRankingsUrl({
        zoneId: 55,
        encounterId: 61762,
        className: 'Shaman',
        specName: 'Elemental',
        dungeon: true,
        origin,
      }),
    ).toBe(
      'https://cn.warcraftlogs.com/zone/rankings/55#dungeon=61762&class=Shaman&spec=Elemental',
    );
    expect(
      buildRankingsUrl({
        zoneId: 38,
        encounterId: 2902,
        className: 'Mage',
        specName: 'Arcane',
        origin,
      }),
    ).toBe(
      'https://cn.warcraftlogs.com/zone/rankings/38#boss=2902&class=Mage&spec=Arcane',
    );
  });

  it('encodes class/spec values so a space never breaks the hash', () => {
    const url = buildRankingsUrl({
      zoneId: 55,
      encounterId: 1,
      className: 'Death Knight',
      specName: 'Blood',
      dungeon: true,
      origin: 'https://cn.warcraftlogs.com',
    });
    expect(url).toContain('class=Death%20Knight');
  });
});

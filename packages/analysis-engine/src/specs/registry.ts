import type { Player } from '@wcl/domain';
import type { SpecAnalyzer } from './types.js';
import { BeastMasteryAnalyzer } from './hunter/beast-mastery/analyzer.js';
import { ArcaneMageAnalyzer } from './mage/arcane/analyzer.js';
import { ElementalShamanAnalyzer } from './shaman/elemental/analyzer.js';
import { BloodDeathKnightAnalyzer } from './death-knight/blood/analyzer.js';
import { RetributionPaladinAnalyzer } from './paladin/retribution/analyzer.js';
import { ArmsWarriorAnalyzer } from './warrior/arms/analyzer.js';

/**
 * Registry mapping a player's spec to a specialization analyzer.
 * Matches primarily by specId (WCL class/spec ids) and falls back to the
 * spec name so reports without ids still work.
 */
export class SpecRegistry {
  private readonly bySpecId = new Map<number, SpecAnalyzer>();
  private readonly bySpecName = new Map<string, SpecAnalyzer>();
  private readonly defaultAnalyzers: SpecAnalyzer[];

  constructor() {
    const bm = new BeastMasteryAnalyzer();
    const arcane = new ArcaneMageAnalyzer();
    const elemental = new ElementalShamanAnalyzer();
    const blood = new BloodDeathKnightAnalyzer();
    const retribution = new RetributionPaladinAnalyzer();
    const arms = new ArmsWarriorAnalyzer();

    // WCL spec ids: Beast Mastery 253, Arcane 62, Elemental 262, Blood 250,
    // Retribution 70, Arms 71.
    this.bySpecId.set(253, bm);
    this.bySpecId.set(62, arcane);
    this.bySpecId.set(262, elemental);
    this.bySpecId.set(250, blood);
    this.bySpecId.set(70, retribution);
    this.bySpecId.set(71, arms);

    this.bySpecName.set('Beast Mastery', bm);
    this.bySpecName.set('Arcane', arcane);
    this.bySpecName.set('Elemental', elemental);
    this.bySpecName.set('Blood', blood);
    this.bySpecName.set('Retribution', retribution);
    this.bySpecName.set('Arms', arms);

    this.defaultAnalyzers = [bm, arcane, elemental, blood, retribution, arms];
  }

  findForPlayer(player: Player): SpecAnalyzer | undefined {
    if (player.specId !== undefined) {
      const byId = this.bySpecId.get(player.specId);
      if (byId) return byId;
    }
    if (player.specName !== undefined) {
      return this.bySpecName.get(player.specName);
    }
    return undefined;
  }
}

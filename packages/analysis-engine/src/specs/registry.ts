import type { Player } from '@wcl/domain';
import type { SpecAnalyzer } from './types.js';
import { BeastMasteryAnalyzer } from './hunter/beast-mastery/analyzer.js';
import { ArcaneMageAnalyzer } from './mage/arcane/analyzer.js';
import { ElementalShamanAnalyzer } from './shaman/elemental/analyzer.js';
import { BloodDeathKnightAnalyzer } from './death-knight/blood/analyzer.js';
import { RetributionPaladinAnalyzer } from './paladin/retribution/analyzer.js';
import { ArmsWarriorAnalyzer } from './warrior/arms/analyzer.js';
import { VengeanceDemonHunterAnalyzer } from './demon-hunter/vengeance/analyzer.js';

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
    const vengeance = new VengeanceDemonHunterAnalyzer();

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
    // 复仇 DH：WCL 的 actor 数据只给 specName、不给 spec id（2026-10-23 实测），
    // 所以按名字注册。等日志里真的出现 specId 再补 581。
    this.bySpecName.set('Vengeance', vengeance);

    this.defaultAnalyzers = [bm, arcane, elemental, blood, retribution, arms, vengeance];
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

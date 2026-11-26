import { RAW_LEVY_DRILL } from './cityAspects.js';
import { ACTION_COSTS } from './data.js';
import type { City, CitySpecialtyId, LocalizedText } from './types.js';

export type SpecialtyDistrictId = 'hall' | 'market' | 'fields' | 'barracks' | 'walls';

export interface CitySpecialtyDef {
  id: CitySpecialtyId;
  seal: LocalizedText;
  district: SpecialtyDistrictId;
  name: LocalizedText;
  summary: LocalizedText;
  lore: LocalizedText;
}

export interface CityLandmarkDef {
  id: string;
  cityId: string;
  seal: LocalizedText;
  district: SpecialtyDistrictId;
  name: LocalizedText;
  summary: LocalizedText;
  lore: LocalizedText;
  goldMult?: number;
  foodMult?: number;
  extraGateHp?: number;
  extraRampartDef?: number;
  riverDefBonus?: number;
  raidBombardFactor?: number;
  cavalryAtkBonus?: number;
  riverStrikeAtkBonus?: number;
  freeRiverStrikeFood?: boolean;
  recruitFoodFactor?: number;
  worksMult?: number;
  drillFloor?: number;
  weatherImmune?: boolean;
  seasonalLoyaltyGain?: number;
  seasonalTrustGain?: number;
}

export const CITY_SPECIALTY_IDS: CitySpecialtyId[] = [
  'granary',
  'emporium',
  'armory',
  'academy',
  'bastion',
];

/** Minimum farming + trade sum required to charter non-bastion commandery wards. */
export const SPECIALTY_PROSPERITY_MIN = 4;

export const CITY_SPECIALTIES: Record<CitySpecialtyId, CitySpecialtyDef> = {
  granary: {
    id: 'granary',
    seal: { en: 'GRN', zh: '屯' },
    district: 'fields',
    name: { en: 'Tuntian Granary', zh: '屯田都尉府' },
    summary: {
      en: '+25% Grain · -30% local garrison upkeep · halves Flood/Drought grain loss',
      zh: '本城粮入 +25% · 驻军耗粮 -30% · 水旱灾害减产折半',
    },
    lore: {
      en: 'State agricultural colonies and stone-lined silos keep whole field armies fed through lean years.',
      zh: '设典农校尉督垦官田、广筑石仓，兵农合一以资大军远征。',
    },
  },
  emporium: {
    id: 'emporium',
    seal: { en: 'TRD', zh: '商' },
    district: 'market',
    name: { en: 'Merchant Guildhall', zh: '市舶商行' },
    summary: {
      en: '+25% Gold · +3% seasonal Fair chance · -20% Farm/Trade development Gold cost',
      zh: '本城金入 +25% · 商旅大集概率 +3% · 垦田兴商耗金 -20%',
    },
    lore: {
      en: 'Chartered guildhalls draw silk, salt, and river caravans from across the nine provinces.',
      zh: '官督商办、通济舟车，四方盐铁丝绸云集，岁入倍增。',
    },
  },
  armory: {
    id: 'armory',
    seal: { en: 'ARM', zh: '武' },
    district: 'barracks',
    name: { en: 'Warhorse Stud & Armory', zh: '牧苑武库' },
    summary: {
      en: '+15% Levy size · new recruits enter at Drill 40 · armies marching from here gain +10% ATK',
      zh: '募兵人数 +15% · 新兵初始训练升至 40 · 自此出征部队战力 +10%',
    },
    lore: {
      en: 'Blast furnaces and warhorse paddocks outfit outgoing regiments with tempered steel and remounts.',
      zh: '蓄养战马、百炼甲兵，自此誓师出征之卒皆披坚执锐。',
    },
  },
  academy: {
    id: 'academy',
    seal: { en: 'ACD', zh: '学' },
    district: 'hall',
    name: { en: 'Chrono-Academy', zh: '太学格物院' },
    summary: {
      en: '+15% Governor works speed · faster hero wound recovery · +1 Innovation every 2 seasons',
      zh: '太守工程效率 +15% · 伤将加速痊愈 · 每两季产出 +1 科技灵感',
    },
    lore: {
      en: 'Classical scholars and your modern artisans collaborate around bronze armillary spheres.',
      zh: '聚大儒与巧匠同参经史格物，既佐地方吏治，亦源源催生奇器灵感。',
    },
  },
  bastion: {
    id: 'bastion',
    seal: { en: 'BST', zh: '戍' },
    district: 'walls',
    name: { en: 'Citadel Bastion', zh: '瓮城军镇' },
    summary: {
      en: '+900 Siege Gate HP · +10% Rampart DEF · -50% Raid/Bombard losses · Drill floor 60',
      zh: '守城门耐久 +900 · 据墙防御 +10% · 夜袭火攻战损减半 · 训练保底 60',
    },
    lore: {
      en: 'Concentric barbican gates, counterweight trebuchets, and permanent watch-shifts turn the city into an anvil.',
      zh: '重筑瓮城、架设发石机，戌卒枕戈待旦，纵强敌叩关亦难撼分毫。',
    },
  },
};

export const CITY_LANDMARKS: Record<string, CityLandmarkDef> = {
  luoyang: {
    id: 'imperial_que',
    cityId: 'luoyang',
    seal: { en: 'IMP', zh: '阙' },
    district: 'hall',
    name: { en: 'Imperial Twin Que & Taixue', zh: '洛阳皇城双阙' },
    summary: {
      en: '+15% Gold & Grain · +2 Lord Trust each season while held (up to 85)',
      zh: '金粮岁入 +15% · 据有此都每季主公信任 +2（上限 85）',
    },
    lore: {
      en: 'The ancient Eastern Han capital; holding its vermilion Twin Que legitimizes your counsel before the court.',
      zh: '东汉故都、天下之中，执掌皇城双阙与石经太学，朝野莫不钦服。',
    },
    goldMult: 1.15,
    foodMult: 1.15,
    seasonalTrustGain: 2,
  },
  changan: {
    id: 'weiyang_arsenal',
    cityId: 'changan',
    seal: { en: 'WYG', zh: '央' },
    district: 'walls',
    name: { en: 'Weiyang Bell-Tower Arsenal', zh: '长安未央武库' },
    summary: {
      en: '+600 Siege Gate HP · garrison Drill never decays below 58',
      zh: '守城门耐久 +600 · 驻军训练度自然回落保底 58',
    },
    lore: {
      en: 'Western Han’s monumental imperial armory within the Guanzhong passes.',
      zh: '四塞之固、未央旧武库犹存，关中甲士操演不辍。',
    },
    extraGateHp: 600,
    drillFloor: 58,
  },
  ye: {
    id: 'bronze_sparrow',
    cityId: 'ye',
    seal: { en: 'SPR', zh: '雀' },
    district: 'hall',
    name: { en: 'Bronze Sparrow Terrace', zh: '邺城铜雀三台' },
    summary: {
      en: 'Stationed officers gain +2 Loyalty/season · +15% Governor works speed',
      zh: '驻城武将每季忠诚 +2 · 太守工程效率 +15%',
    },
    lore: {
      en: 'Three soaring terraces overlooking the Zhang River where poets, generals, and statesmen feast.',
      zh: '临漳水而筑铜雀、金虎、冰井三台，文武风云际会，群贤归心。',
    },
    worksMult: 1.15,
    seasonalLoyaltyGain: 2,
  },
  xuchang: {
    id: 'yingchuan_granary',
    cityId: 'xuchang',
    seal: { en: 'YGC', zh: '颍' },
    district: 'fields',
    name: { en: 'Yingchuan Imperial Tuntian', zh: '许昌颍川大仓' },
    summary: {
      en: '+20% City Grain · -20% Recruit food cost in Xuchang',
      zh: '本城粮入 +20% · 在此募兵耗粮 -20%',
    },
    lore: {
      en: 'Heartland agricultural colonies that turned central Henan into an inexhaustible granary.',
      zh: '中原屯田首善之区，阡陌纵横、仓廪盈溢。',
    },
    foodMult: 1.2,
    recruitFoodFactor: 0.8,
  },
  chengdu: {
    id: 'dujiangyan',
    cityId: 'chengdu',
    seal: { en: 'DJY', zh: '堰' },
    district: 'fields',
    name: { en: 'Dujiangyan Weir & Brocade Ward', zh: '都江堰 · 锦官城' },
    summary: {
      en: 'Immune to Flood & Drought · +15% Governor works speed',
      zh: '永免水患与大旱 · 太守兴筑工程效率 +15%',
    },
    lore: {
      en: 'Li Bing’s ancient bamboo-gabion weir tames the Min River while Shu brocade looms enrich the realm.',
      zh: '水旱从人、不知饥馑，兼有蜀锦机杼之利，号为天府之国。',
    },
    weatherImmune: true,
    worksMult: 1.15,
  },
  jiange: {
    id: 'sword_gate',
    cityId: 'jiange',
    seal: { en: 'SWD', zh: '剑' },
    district: 'walls',
    name: { en: 'Sword Gate Plank Cliffs', zh: '剑门绝壁栈道' },
    summary: {
      en: '+900 Siege Gate HP · +15% Defender Rampart Cover',
      zh: '守城门耐久 +900 · 守军据墙防御额外 +15%',
    },
    lore: {
      en: 'Sheer dagger-like peaks linked by cliffside plank roads — one man at the pass bars ten thousand.',
      zh: '壁立千仞、飞阁通衢，真乃一夫当关、万夫莫开之天险。',
    },
    extraGateHp: 900,
    extraRampartDef: 0.15,
  },
  jianye: {
    id: 'stone_citadel',
    cityId: 'jianye',
    seal: { en: 'STN', zh: '石' },
    district: 'walls',
    name: { en: 'Shitoucheng River Bluff', zh: '建业石头城' },
    summary: {
      en: '+15% City Gold · +12% Defender DEF on the 8×8 grid',
      zh: '本城金入 +15% · 守城部队战场防御额外 +12%',
    },
    lore: {
      en: 'Crouching tiger and coiling dragon: red sandstone ramparts command the Yangtze渡口.',
      zh: '钟山龙蟠、石城虎踞，凭江峭壁以为天堑水关。',
    },
    goldMult: 1.15,
    riverDefBonus: 0.12,
  },
  chaisang: {
    id: 'red_cliffs_yard',
    cityId: 'chaisang',
    seal: { en: 'FLT', zh: '寨' },
    district: 'barracks',
    name: { en: 'Chaisang Naval Stockade', zh: '柴桑赤壁水寨' },
    summary: {
      en: 'River Fleet strikes from Chaisang cost 0 Grain & gain +12% ATK',
      zh: '自此发水师奔袭免耗粮草，且水师奇袭战力 +12%',
    },
    lore: {
      en: 'Sheltered river coves and towering樓船 slipways where Jiangdong’s fleets drill for fire war.',
      zh: '艨艟斗舰连营数十里，顺流扬帆瞬息千里。',
    },
    riverStrikeAtkBonus: 0.12,
    freeRiverStrikeFood: true,
  },
  xiangyang: {
    id: 'han_citadel',
    cityId: 'xiangyang',
    seal: { en: 'HAN', zh: '汉' },
    district: 'walls',
    name: { en: 'Han River Bastion & Customs', zh: '襄阳汉水重镇' },
    summary: {
      en: '+12% Defender Rampart Cover · -25% Raid/Bombard losses · +15% Gold',
      zh: '守军据墙防御 +12% · 夜袭火攻战损 -25% · 商税金入 +15%',
    },
    lore: {
      en: 'Surrounded on three sides by the Han River with a moat like a lake — the throat of Jingzhou.',
      zh: '跨连荆豫、三面环水，池深城固而舟车辐辏。',
    },
    goldMult: 1.15,
    extraRampartDef: 0.12,
    raidBombardFactor: 0.75,
  },
  wuwei: {
    id: 'hexi_pastures',
    cityId: 'wuwei',
    seal: { en: 'HRS', zh: '骏' },
    district: 'barracks',
    name: { en: 'Hexi Silk Road Pastures', zh: '武威河西马苑' },
    summary: {
      en: 'Cavalry squads marching from Wuwei gain +12% ATK · +15% City Gold',
      zh: '自此出征骑兵战力 +12% · 西域丝路商税使金入 +15%',
    },
    lore: {
      en: 'Snowmelt pastures beneath the Qilian peaks breed swift Liangzhou chargers alongside Silk Road caravans.',
      zh: '祁连雪水牧养凉州健马，兼通西域胡商驼队。',
    },
    goldMult: 1.15,
    cavalryAtkBonus: 0.12,
  },
};

export function getCityLandmark(cityId: string): CityLandmarkDef | undefined {
  return CITY_LANDMARKS[cityId];
}

export function canCharterSpecialty(
  city: Pick<City, 'farming' | 'trade' | 'defense' | 'terrain'>,
  specialty: CitySpecialtyId
): boolean {
  if (specialty === 'bastion') {
    return (
      city.terrain === 'fortress' ||
      city.defense >= 4 ||
      city.farming + city.trade >= SPECIALTY_PROSPERITY_MIN
    );
  }
  return city.farming + city.trade >= SPECIALTY_PROSPERITY_MIN;
}

export function isCityEligibleForAnySpecialty(
  city: Pick<City, 'farming' | 'trade' | 'defense' | 'terrain'>
): boolean {
  return CITY_SPECIALTY_IDS.some((sp) => canCharterSpecialty(city, sp));
}

export function cityIncomeMultipliers(city: Pick<City, 'id' | 'specialty'>): {
  gold: number;
  food: number;
} {
  const landmark = CITY_LANDMARKS[city.id];
  let gold = landmark?.goldMult ?? 1;
  let food = landmark?.foodMult ?? 1;
  if (city.specialty === 'emporium') gold *= 1.25;
  if (city.specialty === 'granary') food *= 1.25;
  return { gold, food };
}

export function cityUpkeepFactor(city: Pick<City, 'id' | 'specialty'>): number {
  return city.specialty === 'granary' ? 0.7 : 1;
}

export function cityEconomyOrderGoldCost(
  city: Pick<City, 'id' | 'specialty'>,
  aspect: 'farming' | 'trade'
): number {
  const base = aspect === 'farming' ? ACTION_COSTS.farmGold : ACTION_COSTS.tradeGold;
  return city.specialty === 'emporium' ? Math.round(base * 0.8) : base;
}

export function cityRecruitFoodCost(city: Pick<City, 'id' | 'specialty'>): number {
  const factor = CITY_LANDMARKS[city.id]?.recruitFoodFactor ?? 1;
  return Math.round(ACTION_COSTS.recruitFood * factor);
}

export function cityLevyMultiplier(city: Pick<City, 'id' | 'specialty'>): number {
  return city.specialty === 'armory' ? 1.15 : 1;
}

export function cityRawLevyDrill(city: Pick<City, 'id' | 'specialty'>): number {
  return city.specialty === 'armory' ? 40 : RAW_LEVY_DRILL;
}

export function cityWorksRateMultiplier(city: Pick<City, 'id' | 'specialty'>): number {
  let mult = 1;
  if (city.specialty === 'academy') mult *= 1.15;
  if (CITY_LANDMARKS[city.id]?.worksMult) mult *= CITY_LANDMARKS[city.id].worksMult!;
  return mult;
}

export function cityDrillFloor(city: Pick<City, 'id' | 'specialty'>): number {
  const specFloor = city.specialty === 'bastion' ? 60 : 0;
  const landFloor = CITY_LANDMARKS[city.id]?.drillFloor ?? 0;
  return Math.max(specFloor, landFloor);
}

export function cityExtraGateHp(city: Pick<City, 'id' | 'specialty'>): number {
  return (
    (city.specialty === 'bastion' ? 900 : 0) + (CITY_LANDMARKS[city.id]?.extraGateHp ?? 0)
  );
}

export function cityExtraRampartDef(city: Pick<City, 'id' | 'specialty'>): number {
  return (
    (city.specialty === 'bastion' ? 0.1 : 0) + (CITY_LANDMARKS[city.id]?.extraRampartDef ?? 0)
  );
}

export function cityRiverDefenseBonus(city: Pick<City, 'id' | 'specialty'>): number {
  return CITY_LANDMARKS[city.id]?.riverDefBonus ?? 0;
}

export function cityStagingAtkBonuses(city: Pick<City, 'id' | 'specialty'> | undefined): {
  allAtk: number;
  cavalryAtk: number;
  riverStrikeAtk: number;
} {
  if (!city) return { allAtk: 0, cavalryAtk: 0, riverStrikeAtk: 0 };
  const landmark = CITY_LANDMARKS[city.id];
  return {
    allAtk: city.specialty === 'armory' ? 0.1 : 0,
    cavalryAtk: landmark?.cavalryAtkBonus ?? 0,
    riverStrikeAtk: landmark?.riverStrikeAtkBonus ?? 0,
  };
}

export function cityRiverStrikeFoodCost(city: Pick<City, 'id' | 'specialty'> | undefined): number {
  if (city && CITY_LANDMARKS[city.id]?.freeRiverStrikeFood) return 0;
  return ACTION_COSTS.riverStrikeFood;
}

export function cityRaidBombardLossFactor(city: Pick<City, 'id' | 'specialty'>): number {
  const spec = city.specialty === 'bastion' ? 0.5 : 1;
  const land = CITY_LANDMARKS[city.id]?.raidBombardFactor ?? 1;
  return spec * land;
}

export function isCityImmuneToWeather(city: Pick<City, 'id' | 'specialty'>): boolean {
  return Boolean(CITY_LANDMARKS[city.id]?.weatherImmune);
}

/**
 * Seasonal Innovation Points produced by a realm's Chrono-Academies (`academy` specialty):
 * 1 Academy -> +1 on even turns; 2 Academies -> +1 every turn; 4+ Academies -> +2 every turn (cap +2).
 */
export function seasonAcademyInnovationGain(cities: Array<Pick<City, 'specialty'>>, nextTurn: number): number {
  const count = cities.filter((c) => c.specialty === 'academy').length;
  if (count <= 0) return 0;
  const guaranteed = Math.floor(count / 2);
  const alternating = count % 2 === 1 && nextTurn % 2 === 0 ? 1 : 0;
  return Math.min(2, guaranteed + alternating);
}

import { DRILL_START, SUPPORT_START } from './cityAspects.js';
import { createInitialHeroes } from './heroes.js';
import type {
  City,
  DiplomacyRelation,
  FactionId,
  FactionState,
  General,
  LocalizedText,
  PlayableFactionId,
  Province,
  ProvinceId,
  TacticId,
  TerrainType,
} from './types.js';

/** Cities a realm must hold to unify the land: about two thirds of the 32 on the map. */
export const VICTORY_CITY_TARGET = 22;
/** Orders every realm may give in a season, however small it is. */
export const MAX_ACTION_POINTS = 3;
/** A larger realm has more officials to carry orders: one more for every this many cities. */
export const CITIES_PER_EXTRA_ORDER = 6;
/** Realm size never adds more than this many orders. */
export const MAX_REALM_BONUS_ORDERS = 2;
/** Holding this many cities alarms the other two realms into a coalition against the player. */
export const COALITION_CITY_THRESHOLD = 15;
/** Unclaimed cities slowly refill their garrison up to this many men. */
export const NEUTRAL_GARRISON_CAP = 7000;

/** Orders per season that come from the size of a realm alone. */
export function ordersForRealmSize(cityCount: number): number {
  return (
    MAX_ACTION_POINTS +
    Math.min(MAX_REALM_BONUS_ORDERS, Math.floor(cityCount / CITIES_PER_EXTRA_ORDER))
  );
}

/** Orders a rival realm carries out in one season: one for every five cities, at most three. */
export function rivalOrdersForRealmSize(cityCount: number): number {
  return Math.max(1, Math.min(3, Math.ceil(cityCount / 5)));
}

export const ACTION_COSTS = {
  /** Opening new fields or enlarging the market: one level of farming or of trade. */
  farmGold: 120,
  tradeGold: 120,
  drillGold: 80,
  reliefFood: 160,
  fortifyGold: 200,
  mendBreachGold: 80,
  specializeGold: 240,
  recruitGold: 180,
  recruitFood: 140,
  recruitTroops: 3500,
  giftGold: 250,
  rewardHeroGold: 100,
  recruitHeroGiftGold: 200,
  ransomGold: 350,
  bombardGold: 150,
  discordGold: 180,
  riverStrikeFood: 150,
} as const;

/**
 * Ports a fleet can sail between: the Yangtze from Ba down to the sea, the Han from Xiangyang to
 * its mouth at Jiangxia, and the short coast from the estuary to Kuaiji.
 */
export const RIVER_LINKS: Array<[string, string]> = [
  ['jiangzhou', 'yongan'],
  ['yongan', 'jiangling'],
  ['jiangling', 'jiangxia'],
  ['xiangyang', 'jiangxia'],
  ['jiangxia', 'chaisang'],
  ['chaisang', 'lujiang'],
  ['lujiang', 'jianye'],
  ['jianye', 'wu'],
  ['wu', 'kuaiji'],
];

/** A fleet strikes at most this many ports up or down the river from where it sails. */
export const RIVER_STRIKE_REACH = 2;

export const YANGTZE_PORT_IDS: readonly string[] = Array.from(new Set(RIVER_LINKS.flat()));

const RIVER_NEIGHBORS: Record<string, string[]> = {};
for (const [a, b] of RIVER_LINKS) {
  (RIVER_NEIGHBORS[a] ??= []).push(b);
  (RIVER_NEIGHBORS[b] ??= []).push(a);
}

/** Ports between two ports along the water, or Infinity when no fleet can sail between them. */
export function riverDistance(fromId: string, toId: string): number {
  if (!RIVER_NEIGHBORS[fromId] || !RIVER_NEIGHBORS[toId]) return Infinity;
  if (fromId === toId) return 0;
  const seen = new Set([fromId]);
  let frontier = [fromId];
  for (let steps = 1; frontier.length > 0; steps++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nid of RIVER_NEIGHBORS[id]) {
        if (nid === toId) return steps;
        if (!seen.has(nid)) {
          seen.add(nid);
          next.push(nid);
        }
      }
    }
    frontier = next;
  }
  return Infinity;
}

export function isWithinRiverStrike(fromId: string, toId: string): boolean {
  const d = riverDistance(fromId, toId);
  return d >= 1 && d <= RIVER_STRIKE_REACH;
}

/**
 * The eleven provinces of the Later Han that fall on the map, in the order the Book of Later Han
 * lists them. You province lies north of the map and Jiao province south of it.
 */
export const PROVINCES: Record<ProvinceId, Province> = {
  sili: { id: 'sili', name: { en: 'Sili', zh: '司隶' }, seatCityId: 'luoyang', label: { x: 400, y: 264 } },
  yu: { id: 'yu', name: { en: 'Yuzhou', zh: '豫州' }, seatCityId: 'xuchang', label: { x: 622, y: 300 } },
  ji: { id: 'ji', name: { en: 'Jizhou', zh: '冀州' }, seatCityId: 'ye', label: { x: 668, y: 66 } },
  yan: { id: 'yan', name: { en: 'Yanzhou', zh: '兖州' }, seatCityId: 'puyang', label: { x: 672, y: 196 } },
  xu: { id: 'xu', name: { en: 'Xuzhou', zh: '徐州' }, seatCityId: 'xiapi', label: { x: 690, y: 268 } },
  qing: { id: 'qing', name: { en: 'Qingzhou', zh: '青州' }, seatCityId: 'beihai', label: { x: 716, y: 152 } },
  jing: { id: 'jing', name: { en: 'Jingzhou', zh: '荆州' }, seatCityId: 'xiangyang', label: { x: 532, y: 378 } },
  yang: { id: 'yang', name: { en: 'Yangzhou', zh: '扬州' }, seatCityId: 'jianye', label: { x: 752, y: 478 } },
  yi: { id: 'yi', name: { en: 'Yizhou', zh: '益州' }, seatCityId: 'chengdu', label: { x: 232, y: 402 } },
  liang: { id: 'liang', name: { en: 'Liangzhou', zh: '凉州' }, seatCityId: 'tianshui', label: { x: 118, y: 124 } },
  bing: { id: 'bing', name: { en: 'Bingzhou', zh: '并州' }, seatCityId: 'jinyang', label: { x: 436, y: 98 } },
};

export const PROVINCE_ORDER = Object.keys(PROVINCES) as ProvinceId[];

export const TACTICS: Record<
  TacticId,
  {
    id: TacticId;
    name: LocalizedText;
    desc: LocalizedText;
    statKey: 'war' | 'intellect' | 'command';
  }
> = {
  assault: {
    id: 'assault',
    name: { en: 'Frontal Assault', zh: '正面强攻' },
    desc: {
      en: 'High momentum shock charge. Strong on plains; powered by War.',
      zh: '铁骑突阵，平野作战威力倍增，受武力加成。',
    },
    statKey: 'war',
  },
  fire: {
    id: 'fire',
    name: { en: 'Fire Attack', zh: '火攻连营' },
    desc: {
      en: 'Devastates river & dense garrisons. Powered by Intellect.',
      zh: '借风纵火，水战与破大军奇效，受智力加成。',
    },
    statKey: 'intellect',
  },
  ambush: {
    id: 'ambush',
    name: { en: 'Mountain Ambush', zh: '伏兵奇袭' },
    desc: {
      en: 'Cuts attacker casualties & excels in mountains. Powered by Intellect.',
      zh: '险道设伏，山地攻防损耗锐减，受智力加成。',
    },
    statKey: 'intellect',
  },
  siege: {
    id: 'siege',
    name: { en: 'Siege Engines', zh: '围城器械' },
    desc: {
      en: 'Breaches fortified city walls & fortresses. Powered by Command.',
      zh: '云梯冲车，破坚城与高城防利器，受统率加成。',
    },
    statKey: 'command',
  },
};

export function createInitialFactions(): Record<PlayableFactionId, FactionState> {
  return {
    wei: {
      id: 'wei',
      name: { en: 'Kingdom of Wei', zh: '曹魏' },
      shortName: { en: 'Wei', zh: '魏' },
      rulerName: { en: 'Cao Cao', zh: '曹操' },
      rulerTitle: { en: 'Chancellor of the Han', zh: '汉丞相 · 魏王' },
      advisorName: { en: 'Sima Yi', zh: '司马懿' },
      advisorTitle: { en: 'Grand Strategist', zh: '大军师' },
      color: '#4c78a8',
      accent: '#b9d0e6',
      bannerChar: '魏',
      traitName: { en: 'Tuntian Agronomy', zh: '屯田强兵' },
      traitDesc: {
        en: '+20% Gold & Food tax income each season; cheaper recruitment.',
        zh: '每季粮饷税收 +20%，中原兵源雄厚。',
      },
      difficulty: 'normal',
      gold: 1150,
      food: 1300,
      isEliminated: false,
    },
    shu: {
      id: 'shu',
      name: { en: 'Kingdom of Shu-Han', zh: '蜀汉' },
      shortName: { en: 'Shu', zh: '蜀' },
      rulerName: { en: 'Liu Bei', zh: '刘备' },
      rulerTitle: { en: 'Prince of Hanzhong', zh: '汉中王 · 昭烈帝' },
      advisorName: { en: 'Zhuge Liang', zh: '诸葛亮' },
      advisorTitle: { en: 'Sleeping Dragon', zh: '卧龙军师' },
      color: '#438554',
      accent: '#add4b6',
      bannerChar: '蜀',
      traitName: { en: 'Benevolent Valor', zh: '仁德精兵' },
      traitDesc: {
        en: '+15% combat power led by generals & stronger mountain defense.',
        zh: '名将统军战力 +15%，蜀道山地防守如铁。',
      },
      difficulty: 'challenging',
      gold: 880,
      food: 1050,
      isEliminated: false,
    },
    wu: {
      id: 'wu',
      name: { en: 'Kingdom of Eastern Wu', zh: '东吴' },
      shortName: { en: 'Wu', zh: '吴' },
      rulerName: { en: 'Sun Quan', zh: '孙权' },
      rulerTitle: { en: 'Lord of Jiangdong', zh: '江东之主 · 吴王' },
      advisorName: { en: 'Lu Xun', zh: '陆逊' },
      advisorTitle: { en: 'Grand Commander', zh: '大都督' },
      color: '#c2432f',
      accent: '#edb3a5',
      bannerChar: '吴',
      traitName: { en: 'Yangtze Fleet', zh: '长江水师' },
      traitDesc: {
        en: '+22% Fire Attack & river combat power; prosperous southern trade.',
        zh: '水战与火攻威力 +22%，江南商贸富庶。',
      },
      difficulty: 'hard',
      gold: 980,
      food: 1020,
      isEliminated: false,
    },
  };
}

/**
 * Roads between cities. A march, a raid or a relief column only ever moves along one of these.
 * They follow the routes the campaigns of the period used: the Three Gorges, the plank roads
 * into Shu, the passes west of Luoyang, the Huai and the lower Yangtze.
 */
export const ROADS: Array<[string, string]> = [
  // North China plain
  ['ye', 'luoyang'],
  ['ye', 'xuchang'],
  ['ye', 'puyang'],
  ['ye', 'jinyang'],
  ['jinyang', 'luoyang'],
  ['luoyang', 'xuchang'],
  ['puyang', 'xuchang'],
  ['puyang', 'xiapi'],
  ['puyang', 'beihai'],
  ['beihai', 'xiapi'],
  ['xuchang', 'xiapi'],
  ['xuchang', 'hefei'],
  ['xiapi', 'hefei'],
  // The passes and the north-west
  ['luoyang', 'tongguan'],
  ['tongguan', 'changan'],
  ['changan', 'chencang'],
  ['chencang', 'tianshui'],
  ['tianshui', 'wuwei'],
  // Three roads out of Hanzhong: Qishan, the Chencang road and the Ziwu valley
  ['tianshui', 'hanzhong'],
  ['chencang', 'hanzhong'],
  ['changan', 'hanzhong'],
  // Nanyang and the Han river
  ['luoyang', 'wan'],
  ['changan', 'wan'],
  ['xuchang', 'wan'],
  ['wan', 'xiangyang'],
  ['xiangyang', 'shangyong'],
  ['shangyong', 'hanzhong'],
  ['xiangyang', 'jiangling'],
  ['xiangyang', 'jiangxia'],
  // Into Shu
  ['hanzhong', 'jiange'],
  ['jiange', 'chengdu'],
  ['chengdu', 'jiangzhou'],
  ['chengdu', 'jianning'],
  ['jiangzhou', 'jianning'],
  // The Three Gorges
  ['jiangzhou', 'yongan'],
  ['yongan', 'jiangling'],
  // Jing province south of the river
  ['jiangling', 'wuling'],
  ['jiangling', 'changsha'],
  ['jiangling', 'jiangxia'],
  ['wuling', 'changsha'],
  ['changsha', 'jiangxia'],
  ['changsha', 'chaisang'],
  ['jiangxia', 'chaisang'],
  // The lower Yangtze and the Huai
  ['chaisang', 'lujiang'],
  ['lujiang', 'jianye'],
  ['chaisang', 'jianan'],
  ['lujiang', 'hefei'],
  ['hefei', 'jianye'],
  ['xiapi', 'jianye'],
  ['jianye', 'wu'],
  ['wu', 'kuaiji'],
  ['kuaiji', 'jianan'],
];

type CitySeed = [
  id: string,
  en: string,
  zh: string,
  regionEn: string,
  regionZh: string,
  province: ProvinceId,
  x: number,
  y: number,
  owner: FactionId,
  troops: number,
  defense: number,
  development: number,
  baseGold: number,
  baseFood: number,
  terrain: TerrainType,
];

/**
 * Cities stand at their real positions under the map's projection. Ownership follows the three
 * realms as they stood around 219. Frontier forts are strongly held and poor; the rear provinces
 * of Wei are thinly garrisoned, so its fourteen cities do not outweigh the other two realms by
 * more than they did when the map had thirteen.
 */
const CITY_SEEDS: CitySeed[] = [
  // --- Sili
  ['luoyang', 'Luoyang', '洛阳', 'Henan', '河南', 'sili', 498, 213, 'wei', 12500, 4, 4, 250, 230, 'fortress'],
  ['changan', "Chang'an", '长安', 'Guanzhong', '关中', 'sili', 348, 230, 'wei', 11000, 4, 3, 200, 210, 'fortress'],
  ['tongguan', 'Tong Pass', '潼关', 'Hongnong', '弘农', 'sili', 405, 215, 'wei', 5000, 4, 1, 70, 90, 'fortress'],
  ['chencang', 'Chencang', '陈仓', 'Fufeng', '扶风', 'sili', 278, 226, 'wei', 7000, 4, 1, 80, 110, 'fortress'],
  // --- Liang
  ['tianshui', 'Tianshui', '天水', 'Longyou', '陇右', 'liang', 197, 209, 'wei', 6000, 3, 2, 110, 140, 'mountain'],
  ['wuwei', 'Wuwei', '武威', 'Hexi', '河西', 'liang', 79, 52, 'neutral', 5500, 2, 2, 110, 120, 'plains'],
  // --- Bing, Ji, Yan, Qing, Xu, Yu
  ['jinyang', 'Jinyang', '晋阳', 'Taiyuan', '太原', 'bing', 499, 62, 'wei', 4000, 3, 2, 120, 150, 'mountain'],
  ['ye', 'Ye', '邺城', 'Wei Commandery', '魏郡', 'ji', 585, 130, 'wei', 11500, 3, 4, 220, 260, 'plains'],
  ['puyang', 'Puyang', '濮阳', 'Dong Commandery', '东郡', 'yan', 626, 168, 'wei', 5500, 3, 2, 150, 200, 'plains'],
  ['beihai', 'Beihai', '北海', 'Beihai', '北海', 'qing', 769, 112, 'wei', 4000, 2, 2, 140, 170, 'plains'],
  ['xiapi', 'Xiapi', '下邳', 'Xiapi', '下邳', 'xu', 733, 237, 'wei', 8500, 4, 2, 150, 180, 'river'],
  ['xuchang', 'Xuchang', '许昌', 'Yingchuan', '颍川', 'yu', 575, 250, 'wei', 13000, 3, 4, 240, 250, 'plains'],
  // --- Jing
  ['wan', 'Wan', '宛城', 'Nanyang', '南阳', 'jing', 506, 285, 'wei', 7500, 3, 2, 190, 220, 'plains'],
  ['xiangyang', 'Xiangyang', '襄阳', 'Northern Jing', '荆北', 'jing', 485, 339, 'wei', 9500, 4, 3, 200, 210, 'river'],
  ['jiangling', 'Jiangling', '江陵', 'Nan Commandery', '南郡', 'jing', 476, 426, 'shu', 12000, 3, 3, 210, 230, 'river'],
  ['wuling', 'Wuling', '武陵', 'Wuling', '武陵', 'jing', 465, 484, 'shu', 6000, 2, 2, 120, 160, 'mountain'],
  ['jiangxia', 'Jiangxia', '江夏', 'Jiangxia', '江夏', 'jing', 577, 410, 'wu', 8500, 3, 3, 160, 190, 'river'],
  ['changsha', 'Changsha', '长沙', 'Jingnan', '荆南', 'jing', 519, 523, 'wu', 10200, 3, 3, 195, 220, 'plains'],
  // --- Yang
  ['hefei', 'Hefei', '合肥', 'Huainan', '淮南', 'yang', 694, 337, 'wei', 10500, 4, 2, 160, 180, 'fortress'],
  ['jianye', 'Jianye', '建业', 'Danyang', '丹阳', 'yang', 780, 341, 'wu', 13500, 4, 5, 290, 250, 'river'],
  ['lujiang', 'Lujiang', '庐江', 'Wan City', '皖城', 'yang', 680, 400, 'wu', 7000, 3, 2, 120, 160, 'plains'],
  ['chaisang', 'Chaisang', '柴桑', 'Yuzhang', '豫章', 'yang', 649, 451, 'wu', 11800, 3, 3, 210, 220, 'river'],
  ['wu', 'Wu', '吴郡', 'Wu Commandery', '吴县', 'yang', 847, 374, 'wu', 6000, 2, 4, 230, 220, 'river'],
  ['kuaiji', 'Kuaiji', '会稽', 'Shanyin', '山阴', 'yang', 845, 437, 'wu', 6500, 2, 3, 210, 200, 'river'],
  ['jianan', "Jian'an", '建安', 'Min Hills', '闽中', 'yang', 749, 580, 'neutral', 5000, 2, 2, 100, 130, 'mountain'],
  // --- Yi
  ['hanzhong', 'Hanzhong', '汉中', 'Hanzhong', '汉中', 'yi', 266, 288, 'shu', 11500, 4, 3, 180, 200, 'mountain'],
  ['shangyong', 'Shangyong', '上庸', 'Eastern Commanderies', '东三郡', 'yi', 397, 330, 'neutral', 5000, 3, 2, 90, 120, 'mountain'],
  ['jiange', 'Jiange', '剑阁', 'Jiameng', '葭萌', 'yi', 203, 330, 'shu', 6000, 5, 1, 60, 80, 'fortress'],
  ['chengdu', 'Chengdu', '成都', 'Shu Commandery', '蜀郡', 'yi', 139, 405, 'shu', 13500, 4, 4, 260, 280, 'mountain'],
  ['jiangzhou', 'Jiangzhou', '江州', 'Ba Commandery', '巴郡', 'yi', 246, 458, 'shu', 7500, 3, 3, 170, 210, 'river'],
  ['yongan', "Yong'an", '永安', 'Baidi', '白帝', 'yi', 375, 386, 'shu', 6500, 4, 2, 100, 130, 'mountain'],
  ['jianning', 'Jianning', '建宁', 'Nanzhong', '南中', 'yi', 128, 628, 'neutral', 6000, 2, 2, 110, 150, 'mountain'],
];

const CAPITAL_IDS = new Set(['luoyang', 'chengdu', 'jianye']);

export function createInitialCities(): Record<string, City> {
  const cities: Record<string, City> = {};
  for (const seed of CITY_SEEDS) {
    const [id, en, zh, regionEn, regionZh, province, x, y, owner, troops, defense, development, baseGold, baseFood, terrain] = seed;
    cities[id] = {
      id,
      name: { en, zh },
      region: { en: regionEn, zh: regionZh },
      province,
      x,
      y,
      owner,
      troops,
      defense,
      // Farming and trade start level with each other, so a city's income is what it always was.
      farming: development,
      trade: development,
      drill: DRILL_START,
      support: SUPPORT_START,
      baseGold,
      baseFood,
      terrain,
      neighbors: [],
      ...(CAPITAL_IDS.has(id) ? { isCapital: true } : {}),
    };
  }
  for (const [a, b] of ROADS) {
    cities[a].neighbors.push(b);
    cities[b].neighbors.push(a);
  }
  return cities;
}

/** Cities of a province in the order they are listed in the city table. */
export function getProvinceCityIds(cities: Record<string, City>, province: ProvinceId): string[] {
  return Object.values(cities)
    .filter((c) => c.province === province)
    .map((c) => c.id);
}

export function createInitialGenerals(): Record<string, General> {
  return createInitialHeroes();
}

export function getDiplomacyKey(a: PlayableFactionId, b: PlayableFactionId): string {
  return [a, b].sort().join('-');
}

export function createInitialDiplomacy(): Record<string, DiplomacyRelation> {
  return {
    'shu-wei': {
      pair: 'shu-wei',
      factions: ['shu', 'wei'],
      score: -55,
      status: 'war',
      truceTurnsLeft: 0,
    },
    'shu-wu': {
      pair: 'shu-wu',
      factions: ['shu', 'wu'],
      score: 25,
      status: 'truce',
      truceTurnsLeft: 2,
    },
    'wei-wu': {
      pair: 'wei-wu',
      factions: ['wei', 'wu'],
      score: -35,
      status: 'hostile',
      truceTurnsLeft: 0,
    },
  };
}

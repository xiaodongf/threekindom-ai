import type { TechDefinition, TechId } from './types.js';

export const MODERN_TECHS: Record<TechId, TechDefinition> = {
  stirrups: {
    id: 'stirrups',
    tier: 1,
    name: { en: 'Steel Stirrups & Horseshoes', zh: '双边马镫 · 铁蹄' },
    desc: {
      en: '+18% Frontal Assault power. Unlocks heavy shock cavalry a century ahead of schedule.',
      zh: '正面强攻战力 +18%，提前百年打造重装铁骑冲锋体系。',
    },
    historicalNote: {
      en: 'Historically not widespread until the Jin Dynasty — transforms Han cavalry overnight.',
      zh: '双边铁镫原盛于两晋，提前问世令骑兵战力倍增。',
    },
    goldCost: 300,
    innovationCost: 1,
    divergenceGain: 10,
    suspicionGain: 10,
    copyableByRivals: true,
  },
  medicine: {
    id: 'medicine',
    tier: 1,
    name: { en: 'Field Antiseptics & Triage', zh: '战地消毒医术 · 蒸馏酒精' },
    desc: {
      en: '-25% army casualties; wounded heroes recover immediately; cures historically ill geniuses!',
      zh: '全军战损 -25%，负伤武将立即痊愈，且可在历史劫难中救活郭嘉、吕蒙等病逝英才！',
    },
    historicalNote: {
      en: 'Simple distilled ethanol, boiled bandages, and quarantine halt camp plagues.',
      zh: '以高纯度蒸馏酒消毒、沸水煮布与隔离检疫，立止军中瘟疫与刀伤感染。',
    },
    goldCost: 280,
    innovationCost: 1,
    divergenceGain: 10,
    suspicionGain: 8,
    copyableByRivals: true,
  },
  agriculture: {
    id: 'agriculture',
    tier: 1,
    name: { en: 'Crop Rotation & Composting', zh: '现代轮作农法 · 堆肥育种' },
    desc: {
      en: '+35% seasonal Food income across all owned commanderies.',
      zh: '治下全境每季粮草产出 +35%，彻底化解北伐粮道之忧。',
    },
    historicalNote: {
      en: 'Nitrogen-fixing legumes and scientific seed selection multiply Han harvests.',
      zh: '豆科轮作固氮与良种选育，亩产激增，屯田效率倍翻。',
    },
    goldCost: 260,
    innovationCost: 1,
    divergenceGain: 8,
    suspicionGain: 6,
    copyableByRivals: false,
  },
  gunpowder: {
    id: 'gunpowder',
    tier: 2,
    name: { en: 'Black Powder & Thunder Bombs', zh: '黑火药 · 震天雷' },
    desc: {
      en: '+30% Siege & Fire Attack power; blasts enemy city fortifications.',
      zh: '围城器械与火攻威力 +30%，轰塌敌军高墙，震慑天下！',
    },
    historicalNote: {
      en: 'Saltpeter, charcoal & sulfur in 75:15:10 ratio — enemies mistake it for heavenly sorcery!',
      zh: '硝七五、炭十五、硫十配比制雷火，敌军骇为天雷妖术！',
    },
    goldCost: 480,
    innovationCost: 2,
    divergenceGain: 16,
    suspicionGain: 18,
    copyableByRivals: true,
  },
  spyglass: {
    id: 'spyglass',
    tier: 2,
    name: { en: 'Optical Spyglasses & Semaphore', zh: '光学望远镜 · 旗语电讯' },
    desc: {
      en: '+20% Ambush combat & restores enemy hero Flaw Intel even during a Shattered Timeline!',
      zh: '伏兵奇袭战力 +20%，即便历史偏移超过 60% 仍能刺探敌将弱点！',
    },
    historicalNote: {
      en: 'Ground quartz lenses + hilltop flag codes give real-time battlefield telemetry.',
      zh: '打磨水晶凹凸镜片配高山旗语，千里军情瞬息传至中军。',
    },
    goldCost: 420,
    innovationCost: 2,
    divergenceGain: 12,
    suspicionGain: 12,
    copyableByRivals: true,
  },
  printing: {
    id: 'printing',
    tier: 2,
    name: { en: 'Movable-Type Printing & Leaflets', zh: '活字印刷 · 攻心传单' },
    desc: {
      en: '+20% Hero Recruitment & Persuasion success; +10% Gold income across the realm.',
      zh: '招贤与劝降成功率 +20%，国库税收 +10%，舆论攻心无往不利！',
    },
    historicalNote: {
      en: 'Clay & wood movable type floods rival cities with pro-Han manifestos overnight.',
      zh: '一夜印制万卷讨贼檄文与招贤榜，瓦解敌军军心。',
    },
    goldCost: 400,
    innovationCost: 2,
    divergenceGain: 12,
    suspicionGain: 14,
    copyableByRivals: false,
  },
  balloon: {
    id: 'balloon',
    tier: 3,
    name: { en: 'Manned Recon Hot-Air Balloon', zh: '孔明载人热气球' },
    desc: {
      en: '+1 Action Point every season & +10% universal combat foresight.',
      zh: '每季行动力永久 +1，高空俯瞰全局，全军战力 +10%！',
    },
    historicalNote: {
      en: 'Scaling up Zhuge Liang’s Kongming lantern with oiled silk for aerial reconnaissance.',
      zh: '改良孔明灯为桐油巨囊载人升空，敌军动向一览无遗。',
    },
    goldCost: 680,
    innovationCost: 3,
    divergenceGain: 18,
    suspicionGain: 20,
    copyableByRivals: false,
  },
  steamship: {
    id: 'steamship',
    tier: 3,
    name: { en: 'Steam Paddle Warships', zh: '蒸汽明轮战船' },
    desc: {
      en: '+35% combat power in River territories — sail upstream against any wind!',
      zh: '水泽江防战力 +35%，逆风逆水横渡长江天险如履平地！',
    },
    historicalNote: {
      en: 'Crude boiler-driven paddlewheels terrify Yangtze fleets and shatter naval stalemates.',
      zh: '铜锅蒸汽明轮破浪前行，长江天堑从此不复天险！',
    },
    goldCost: 720,
    innovationCost: 3,
    divergenceGain: 20,
    suspicionGain: 22,
    copyableByRivals: true,
  },
};

export const TECH_ORDER: TechId[] = [
  'stirrups',
  'medicine',
  'agriculture',
  'gunpowder',
  'spyglass',
  'printing',
  'balloon',
  'steamship',
];

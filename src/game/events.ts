import type { GameState, StoryEvent } from './types.js';

export function pickSeasonalStoryEvent(state: GameState): StoryEvent | null {
  if (state.activeEvent) return null;

  const { chrono, turn, playerFaction } = state;

  // 1. PRIORITY: Hardcore Court Suspicion Trial whenever Suspicion exceeds Lord's Trust!
  if (
    chrono.suspicion > chrono.trust &&
    chrono.suspicion >= 35 &&
    !chrono.triggeredEventIds.includes(`trial-${turn}`)
  ) {
    const ruler = state.factions[playerFaction].rulerName;
    return {
      id: `trial-${turn}`,
      kind: 'suspicion_trial',
      title: {
        en: 'Court Accusation: "Sorcerer from Beyond!"',
        zh: '朝堂弹劾：「妖言惑众之徒！」',
      },
      subtitle: {
        en: `Court Suspicion (${chrono.suspicion}) has exceeded ${ruler.en}'s Trust (${chrono.trust})!`,
        zh: `朝堂猜忌（${chrono.suspicion}）已超过${ruler.zh}对你的信任（${chrono.trust}）！`,
      },
      body: {
        en: `Conservative elders kneel before ${ruler.en}, accusing your eerie prophecies and "unnatural devices" of being Yellow Turban sorcery. Your position hangs by a thread!`,
        zh: `守旧老臣伏阙泣谏，指责你的超前预言与奇技淫巧乃黄巾妖术，恐祸乱社稷！${ruler.zh}神色凝重，命你当堂自辩。`,
      },
      choices: [
        {
          id: 'demonstrate_science',
          label: { en: 'Publicly Demonstrate Practical Value (-220 Gold)', zh: '当庭演示格物实效（耗 220 金）' },
          desc: {
            en: 'Fund a public display proving your methods are natural craft, not sorcery: Suspicion -25, Trust +10.',
            zh: '出资公开演示格物造福军民之理：猜忌 -25，主公信任 +10。',
          },
          goldCost: 220,
        },
        {
          id: 'halt_workshop',
          label: { en: 'Suspend Modern Workshop for 1 Season', zh: '暂封格物工坊一季以息众议' },
          desc: {
            en: 'Freeze Tech Lab for 1 turn to appease conservatives: Suspicion -20, Trust +4.',
            zh: '暂缓研发一季以安朝臣之心：猜忌 -20，主公信任 +4。',
          },
        },
        {
          id: 'defy_court',
          label: { en: 'Defy the Conservatives Boldly', zh: '舌战守旧老臣，寸步不让' },
          desc: {
            en: 'Keep full workshop access, but Hero Loyalty -6 across faction & Divergence +8%.',
            zh: '工坊照常运转，但麾下众将忠诚 -6，历史偏移 +8%。',
          },
        },
      ],
    };
  }

  // 2. Fated Crisis: Fallen Phoenix Slope (Turn 3, if Pang Tong is still wandering)
  if (
    turn === 3 &&
    !chrono.triggeredEventIds.includes('fallen_phoenix') &&
    state.generals.pangtong?.status === 'wandering'
  ) {
    return {
      id: 'fallen_phoenix',
      kind: 'fated_crisis',
      heroId: 'pangtong',
      title: {
        en: 'Prophecy Alert: Fallen Phoenix Slope (落凤坡)',
        zh: '历史天机预警：落凤坡之劫',
      },
      subtitle: {
        en: 'Historical Foresight · 214 AD Turning Point',
        zh: '穿越者先知 · 建安十九年关键节点',
      },
      body: {
        en: 'Your memory flashes: in 214 AD, the genius strategist Pang Tong ("Young Phoenix") rides into a fatal arrow ambush at Fallen Phoenix Slope! Right now, scouts spot him traveling near Xiangyang.',
        zh: '你猛然想起史书定论：建安十九年，与卧龙齐名的「凤雏」庞统将于落凤坡遭乱箭伏击殒命！此刻细作密报，庞统正现身襄阳古道。',
      },
      choices: [
        {
          id: 'save_pangtong',
          label: { en: 'Dispatch Secret Courier to Warn Him (-200 Gold)', zh: '重金遣死士飞骑示警（耗 200 金）' },
          desc: {
            en: 'Avert his doom! Pang Tong joins your faction in awe! (+14% Divergence, +12 Trust, +10 Suspicion).',
            zh: '逆天改命救下凤雏！庞统惊为天人直接归顺我军！（历史偏移 +14%，信任 +12，猜忌 +10）。',
          },
          goldCost: 200,
        },
        {
          id: 'observe_history',
          label: { en: 'Let History Run Its Course', zh: '暂不干涉天机，保全低调' },
          desc: {
            en: 'Avoid Butterfly Effect backlash: Suspicion -8, Innovation +1 (Pang Tong remains wandering).',
            zh: '避免引发蝴蝶效应与朝臣猜忌：猜忌 -8，获得 +1 科技灵感（庞统仍留在野）。',
          },
        },
      ],
    };
  }

  // 3. Fated Crisis: A Genius Strikes Ill (Turn 5)
  const illHeroId =
    playerFaction === 'wei' ? 'guojia' : playerFaction === 'wu' ? 'lumeng' : 'zhugeliang';
  const illHero = state.generals[illHeroId];
  if (
    turn === 5 &&
    illHero &&
    illHero.faction === playerFaction &&
    illHero.status === 'active' &&
    !chrono.triggeredEventIds.includes('genius_illness')
  ) {
    return {
      id: 'genius_illness',
      kind: 'fated_crisis',
      heroId: illHeroId,
      title: {
        en: `Prophecy Alert: ${illHero.name.en} Stricken by Fever!`,
        zh: `历史天机预警：${illHero.name.zh}突发重疾！`,
      },
      subtitle: {
        en: 'Historical Fate Strikes · Medicine Opportunity',
        zh: '天妒英才 · 现代医术显威之机',
      },
      body: {
        en: `Just as history dreaded, ${illHero.name.en} collapses with a burning camp fever. Imperial physicians shake their heads in despair.`,
        zh: `正应史书所忧，${illHero.name.zh}因劳疾并发骤然病倒，军中名医束手无策，满营惶恐！`,
      },
      choices: [
        {
          id: 'cure_with_medicine',
          label: { en: 'Treat with Modern Field Medicine', zh: '动用「战地消毒医术」全力救治' },
          desc: {
            en: 'Requires Field Medicine tech. Saves hero instantly, +3 Intellect, +15 Trust, +12% Divergence!',
            zh: '需已解锁【战地消毒医术】。妙手回春，该将智力 +3、忠诚满值，主公信任 +15，偏移 +12%！',
          },
          requiresTech: 'medicine',
        },
        {
          id: 'rest_convalesce',
          label: { en: 'Order Strict Rest & Quarantine (-150 Gold)', zh: '严令隔离静养调理（耗 150 金）' },
          desc: {
            en: 'Hero is wounded for 1 season instead of worsening; Trust +4.',
            zh: '虽未能立愈，保其无虞（休养 1 季后复出），信任 +4。',
          },
          goldCost: 150,
        },
      ],
    };
  }

  // 4. Shattered Timeline What-If Crisis (when Divergence >= 60%)
  if (
    chrono.divergence >= 60 &&
    !chrono.triggeredEventIds.includes('shattered_what_if')
  ) {
    return {
      id: 'shattered_what_if',
      kind: 'what_if',
      title: {
        en: 'Timeline Shattered: The Unwritten War!',
        zh: '蝴蝶效应爆发：史书彻底改写！',
      },
      subtitle: {
        en: `Timeline Divergence reached ${chrono.divergence}% — Textbook History Invalidated!`,
        zh: `历史偏移度已达 ${chrono.divergence}% —— 史书先知正式失效！`,
      },
      body: {
        en: 'Your inventions and interventions have bent the river of history beyond recognition. Rival warlords abandon ancient grudges, alter their tactics, and whisper of an "Anomaly from Heaven." From now on, enemy weaknesses are shrouded unless pierced by Spyglasses!',
        zh: '你的现代科技与屡次逆天改命已彻底掀翻历史长河！敌国君臣察觉异数，放下旧怨暗中联手，且名将习性已变——此后若无「光学望远镜」，史书软肋将不再可靠！',
      },
      choices: [
        {
          id: 'embrace_chaos',
          label: { en: 'Forge Our Own Destiny (+2 Innovation)', zh: '既破史轨，便亲手书写新史！（+2 灵感）' },
          desc: {
            en: 'Gain +2 Innovation Points and +10 Lord Trust as your King commits fully to your new era.',
            zh: '获得 +2 科技灵感，主公信任 +10，君臣一心共迎乱世巨变！',
          },
        },
        {
          id: 'fortify_morale',
          label: { en: 'Rally the Heroes (+10 Loyalty & +300 Gold)', zh: '大宴三军名将，凝聚军心（全将忠诚 +10，+300 金）' },
          desc: {
            en: 'Raise all active heroes’ loyalty by +10 and collect war bonds (+300 Gold).',
            zh: '麾下全体武将忠诚 +10，并筹措军饷 +300 金以迎合纵强敌。',
          },
        },
      ],
    };
  }

  // 5. Turn 7+ Hero Vignette: Rival Spy Poaching Attempt
  if (
    turn >= 7 &&
    turn % 3 === 1 &&
    !chrono.triggeredEventIds.includes(`poach-${turn}`)
  ) {
    const vulnerable = Object.values(state.generals)
      .filter((g) => g.faction === playerFaction && g.status === 'active' && g.loyalty < 95)
      .sort((a, b) => a.loyalty - b.loyalty)[0];

    if (vulnerable) {
      return {
        id: `poach-${turn}`,
        kind: 'hero_vignette',
        heroId: vulnerable.id,
        title: {
          en: `Espionage Alert: Enemy Agents Court ${vulnerable.name.en}!`,
          zh: `密报预警：敌国细作暗中策反${vulnerable.name.zh}！`,
        },
        subtitle: {
          en: `Hero Loyalty Check · Current Loyalty: ${vulnerable.loyalty}`,
          zh: `武将忠诚考验 · 当前忠诚度：${vulnerable.loyalty}`,
        },
        body: {
          en: `Your intelligence network intercepted gilded letters sent by rival emissaries offering ${vulnerable.name.en} high rank and gold to defect.`,
          zh: `细作截获敌国密信，敌君竟许以高官厚禄暗中招降${vulnerable.name.zh}！主公问你如何处置。`,
        },
        choices: [
          {
            id: 'honor_banquet',
            label: { en: 'Host Sworn Banquet & Reward (-150 Gold)', zh: '推心置腹赐宴重赏（耗 150 金）' },
            desc: {
              en: `${vulnerable.name.en}'s Loyalty +20, Trust +5, Suspicion -5.`,
              zh: `${vulnerable.name.zh}深受感动，忠诚 +20，信任 +5，猜忌 -5。`,
            },
            goldCost: 150,
          },
          {
            id: 'double_agent',
            label: { en: 'Turn the Spy Into a Counter-Trap', zh: '将计就计，反施离间！' },
            desc: {
              en: 'Gain +200 Gold seized from enemy envoys & +1 Innovation, but hero Loyalty -5.',
              zh: '缴获敌使金银 +200 金与 +1 灵感，但该将略有心结（忠诚 -5）。',
            },
          },
        ],
      };
    }
  }

  return null;
}

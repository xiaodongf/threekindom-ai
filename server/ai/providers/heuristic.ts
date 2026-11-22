import type {
  AITurnAction,
  City,
  DiplomacyProposalType,
  GameState,
  Language,
  PlayableFactionId,
  TacticId,
} from '../../../src/game/types.js';

function getRelationBetween(state: GameState, a: PlayableFactionId, b: PlayableFactionId) {
  const key = [a, b].sort().join('-');
  return state.diplomacy[key];
}

function cityName(city: City, lang: Language): string {
  return lang === 'zh' ? city.name.zh : city.name.en;
}

function pickBestTactic(target: City, factionId: PlayableFactionId): TacticId {
  if (target.terrain === 'river') return 'fire';
  if (target.terrain === 'mountain') return 'ambush';
  if (target.terrain === 'fortress' || target.defense >= 4) return 'siege';
  if (factionId === 'wu') return 'fire';
  return 'assault';
}

export function generateHeuristicAdvisorReply(
  state: GameState,
  question: string,
  lang: Language
): string {
  const player = state.playerFaction;
  const faction = state.factions[player];
  const owned = Object.values(state.cities).filter((c) => c.owner === player);

  if (owned.length === 0) {
    return lang === 'zh'
      ? '主公，我军已无立锥之地，当重整旗鼓再图霸业。'
      : 'My Lord, we hold no commanderies left. We must begin anew.';
  }

  // Find best attack opportunity
  let bestAttack: { from: City; to: City; advantage: number } | null = null;
  for (const from of owned) {
    for (const nid of from.neighbors) {
      const to = state.cities[nid];
      if (!to || to.owner === player) continue;
      if (to.owner !== 'neutral') {
        const rel = getRelationBetween(state, player, to.owner);
        if (rel && rel.truceTurnsLeft > 0) continue;
      }
      const advantage = from.troops * 0.7 - to.troops * (1 + to.defense * 0.1);
      if (!bestAttack || advantage > bestAttack.advantage) {
        bestAttack = { from, to, advantage };
      }
    }
  }

  // Find most threatened border city
  let mostThreatened: { city: City; threat: number; enemyCity: City } | null = null;
  for (const city of owned) {
    for (const nid of city.neighbors) {
      const enemy = state.cities[nid];
      if (!enemy || enemy.owner === player || enemy.owner === 'neutral') continue;
      const threat = enemy.troops - city.troops * (1 + city.defense * 0.12);
      if (!mostThreatened || threat > mostThreatened.threat) {
        mostThreatened = { city, threat, enemyCity: enemy };
      }
    }
  }

  // Diplomacy suggestion
  const rivals = (['wei', 'shu', 'wu'] as PlayableFactionId[]).filter(
    (f) => f !== player && !state.factions[f].isEliminated
  );
  const strongestRival = rivals.sort((a, b) => {
    const ta = Object.values(state.cities)
      .filter((c) => c.owner === a)
      .reduce((s, c) => s + c.troops, 0);
    const tb = Object.values(state.cities)
      .filter((c) => c.owner === b)
      .reduce((s, c) => s + c.troops, 0);
    return tb - ta;
  })[0];
  const potentialAlly = rivals.find((r) => r !== strongestRival) ?? strongestRival;

  const qLower = question.toLowerCase();
  const asksDefense = /defen|vulnerab|safe|threat|防|隐忧|守|危/.test(qLower);
  const asksDiplo = /ally|diplom|truce|peace|联|盟|外|和/.test(qLower);

  if (asksDefense && mostThreatened) {
    const cName = cityName(mostThreatened.city, lang);
    const eName = cityName(mostThreatened.enemyCity, lang);
    return lang === 'zh'
      ? `启禀主公：${cName}（守军 ${mostThreatened.city.troops.toLocaleString()}，城防 Lv.${mostThreatened.city.defense}）紧邻敌军重镇${eName}（兵力 ${mostThreatened.enemyCity.troops.toLocaleString()}），实乃心腹之患。建议优先在${cName}征兵或修筑城防，并从后方调兵驰援，方保无虞。`
      : `My Lord, ${cName} (${mostThreatened.city.troops.toLocaleString()} troops, Def Lv.${mostThreatened.city.defense}) faces heavy pressure from ${eName} (${mostThreatened.enemyCity.troops.toLocaleString()} troops). I urge you to fortify ${cName}, levy troops there, or march reinforcements from a safer interior city.`;
  }

  if (asksDiplo && potentialAlly && strongestRival) {
    const allyName = lang === 'zh' ? state.factions[potentialAlly].name.zh : state.factions[potentialAlly].name.en;
    const bossName = lang === 'zh' ? state.factions[strongestRival].name.zh : state.factions[strongestRival].name.en;
    return lang === 'zh'
      ? `主公明鉴：当今${bossName}兵强马壮，势大难制。上策乃是遣使向${allyName}赠金示好并缔结停战盟约，免除两线受敌之忧，集中精锐各个击破！`
      : `My Lord, ${bossName} currently poses the gravest threat on the board. Grand strategy favors sending an envoy or gold gift to ${allyName} to secure a 3-season truce, freeing our armies to strike without risking a two-front war.`;
  }

  if (bestAttack && bestAttack.advantage > -1800) {
    const fromN = cityName(bestAttack.from, lang);
    const toN = cityName(bestAttack.to, lang);
    const tactic = pickBestTactic(bestAttack.to, player);
    const tacticZh: Record<TacticId, string> = {
      assault: '正面强攻',
      fire: '火攻连营',
      ambush: '伏兵奇袭',
      siege: '围城器械',
    };
    return lang === 'zh'
      ? `启禀主公（${faction.advisorName.zh}献策）：良机已至！${fromN}屯兵 ${bestAttack.from.troops.toLocaleString()}，而邻城${toN}仅有守军 ${bestAttack.to.troops.toLocaleString()}（城防 Lv.${bestAttack.to.defense}）。若遣名将率军自${fromN}出击，施以「${tacticZh[tactic]}」，大概率可一战而下！`
      : `My Lord (${faction.advisorName.en}'s Counsel): An opening awaits! ${fromN} holds ${bestAttack.from.troops.toLocaleString()} soldiers while neighboring ${toN} is defended by only ${bestAttack.to.troops.toLocaleString()} (Def Lv.${bestAttack.to.defense}). Launch a campaign from ${fromN} using ${tactic.toUpperCase()} tactics to seize ${toN}!`;
  }

  const richest = [...owned].sort((a, b) => b.baseGold - a.baseGold)[0];
  return lang === 'zh'
    ? `主公暂宜深沟高垒、蓄势待发。当前国库 ${faction.gold} 金、粮草 ${faction.food}，建议先在${cityName(richest, lang)}发展内政或征募精兵，待兵力超过敌方守军三成后再行北伐/东进。`
    : `My Lord, patience wins empires. With ${faction.gold} gold and ${faction.food} food in reserve, strengthen ${cityName(richest, lang)} via Develop or Recruit until our frontline garrison outnumbers neighboring defenders by at least 30%.`;
}

export function generateHeuristicDiplomacy(
  state: GameState,
  targetFaction: PlayableFactionId,
  proposalType: DiplomacyProposalType,
  _message: string,
  lang: Language
): {
  reply: string;
  decision: 'accept' | 'reject' | 'acknowledge';
  relationDelta: number;
  truceTurns: number;
} {
  const player = state.playerFaction;
  const rel = getRelationBetween(state, player, targetFaction);
  const currentScore = rel?.score ?? 0;
  const targetRuler = state.factions[targetFaction].rulerName;
  const playerRuler = state.factions[player].rulerName;

  const playerCities = Object.values(state.cities).filter((c) => c.owner === player).length;
  const targetCities = Object.values(state.cities).filter((c) => c.owner === targetFaction).length;

  if (proposalType === 'war') {
    return {
      decision: 'acknowledge',
      relationDelta: -45,
      truceTurns: 0,
      reply:
        lang === 'zh'
          ? `哼！${playerRuler.zh}既敢下此战书，孤便点齐三军与君决一死战，看看这天下究竟鹿死谁手！`
          : `So ${playerRuler.en} chooses the sword! Sound the war drums — we shall meet upon the battlefield and let Heaven decide who rules China!`,
    };
  }

  if (proposalType === 'gift') {
    return {
      decision: 'accept',
      relationDelta: 22,
      truceTurns: rel?.truceTurnsLeft ?? 0,
      reply:
        lang === 'zh'
          ? `使者远道而来，厚礼孤便收下了。${playerRuler.zh}诚意可嘉，两家之谊当增进三分。`
          : `Your generous tribute is well received. ${playerRuler.en} shows rare courtesy — ${targetRuler.en} shall remember this gesture of goodwill.`,
    };
  }

  if (proposalType === 'alliance') {
    // More willing if relations >= -25 or if target is weaker/equal
    const willingness = currentScore + (targetCities <= playerCities ? 25 : -10);
    if (willingness >= -15) {
      return {
        decision: 'accept',
        relationDelta: 20,
        truceTurns: 3,
        reply:
          lang === 'zh'
            ? `善！当今强敌环伺，正宜休兵息民。孤允准缔结三季停战盟约，望${playerRuler.zh}谨守信义，切勿背盟！`
            : `Agreed. With rival banners crowding the horizon, a 3-season truce serves both our realms. Honor this oath, ${playerRuler.en}, and our borders shall know peace.`,
      };
    }
    return {
      decision: 'reject',
      relationDelta: -5,
      truceTurns: 0,
      reply:
        lang === 'zh'
          ? `哈哈，${playerRuler.zh}未免太过天真！两军积怨尚深，岂是一纸空文所能化解？先以诚意或实力来说话吧！`
          : `A truce now? ${targetRuler.en} is not so easily swayed by sweet words while old grudges burn. Send gold to prove your sincerity—or prepare your walls!`,
    };
  }

  // Free-form envoy message
  const positiveBonus = currentScore >= 0 ? 8 : 5;
  return {
    decision: 'acknowledge',
    relationDelta: positiveBonus,
    truceTurns: rel?.truceTurnsLeft ?? 0,
    reply:
      lang === 'zh'
        ? `使者所言，孤已尽知。天下大势瞬息万变，${targetRuler.zh}自会权衡利弊，再作计较。`
        : `Your envoy's words have been heard in full. The winds of Heaven shift swiftly — ${targetRuler.en} will weigh your counsel carefully.`,
  };
}

export function generateHeuristicAITurn(
  state: GameState,
  factionId: PlayableFactionId,
  lang: Language
): { action: AITurnAction; proclamation: string; reasoning: string } {
  const faction = state.factions[factionId];
  const owned = Object.values(state.cities).filter((c) => c.owner === factionId);

  if (owned.length === 0) {
    return {
      action: { type: 'hold', cityId: '' },
      proclamation: '',
      reasoning: 'No cities remaining.',
    };
  }

  // 1. Evaluate favorable attacks (respecting truces!)
  let bestAttack: { from: City; to: City; score: number } | null = null;
  for (const from of owned) {
    if (from.troops < 5500) continue;
    for (const nid of from.neighbors) {
      const to = state.cities[nid];
      if (!to || to.owner === factionId) continue;

      if (to.owner !== 'neutral') {
        const rel = getRelationBetween(state, factionId, to.owner);
        if (rel && rel.truceTurnsLeft > 0) continue;
      }

      const sendTroops = from.troops * 0.68;
      const defStrength = to.troops * (1 + to.defense * 0.11);
      const ratio = sendTroops / Math.max(1000, defStrength);

      // Neutral cities are slightly more tempting
      const bonus = to.owner === 'neutral' ? 0.18 : 0;
      const score = ratio + bonus;

      if (score >= 1.08 && (!bestAttack || score > bestAttack.score)) {
        bestAttack = { from, to, score };
      }
    }
  }

  if (bestAttack) {
    const tactic = pickBestTactic(bestAttack.to, factionId);
    const toN = cityName(bestAttack.to, lang);
    const fromN = cityName(bestAttack.from, lang);
    return {
      action: {
        type: 'attack',
        cityId: bestAttack.from.id,
        targetCityId: bestAttack.to.id,
        tactic,
        troopsRatio: 0.68,
      },
      proclamation:
        lang === 'zh'
          ? `三军听令！即刻自${fromN}拔营，直取${toN}！`
          : `Sound the horns! March from ${fromN} and claim ${toN} for our banner!`,
      reasoning:
        lang === 'zh'
          ? `${fromN}兵力占优，趁势攻取${toN}。`
          : `${fromN} enjoys a decisive troop advantage over ${toN}.`,
    };
  }

  // 2. Recruit troops at most exposed frontline city if affordable
  const recruitGold = factionId === 'wei' ? 153 : 180;
  const frontline = owned
    .filter((c) => c.neighbors.some((n) => state.cities[n]?.owner !== factionId))
    .sort((a, b) => a.troops - b.troops);

  if (faction.gold >= recruitGold && faction.food >= 140 && frontline.length > 0) {
    const targetCity = frontline[0];
    return {
      action: { type: 'recruit', cityId: targetCity.id },
      proclamation:
        lang === 'zh'
          ? `传令${cityName(targetCity, lang)}广募精锐，厉兵秣马！`
          : `Levy fresh regiments in ${cityName(targetCity, lang)} — war draws near!`,
      reasoning:
        lang === 'zh'
          ? `充实前线重镇${cityName(targetCity, lang)}兵力。`
          : `Bolster frontline garrison in ${cityName(targetCity, lang)}.`,
    };
  }

  // 3. Reinforce frontline from interior city with surplus troops
  const interiorSurplus = owned
    .filter(
      (c) =>
        c.troops >= 9500 &&
        c.neighbors.every((n) => state.cities[n]?.owner === factionId)
    )
    .sort((a, b) => b.troops - a.troops)[0];

  if (interiorSurplus) {
    const needyNeighbor = interiorSurplus.neighbors
      .map((id) => state.cities[id])
      .filter((c): c is City => Boolean(c && c.owner === factionId))
      .sort((a, b) => a.troops - b.troops)[0];
    if (needyNeighbor) {
      return {
        action: {
          type: 'reinforce',
          cityId: interiorSurplus.id,
          targetCityId: needyNeighbor.id,
          troopsRatio: 0.45,
        },
        proclamation:
          lang === 'zh'
            ? `调遣${cityName(interiorSurplus, lang)}偏师星夜驰援${cityName(needyNeighbor, lang)}！`
            : `Dispatch reserves from ${cityName(interiorSurplus, lang)} to reinforce ${cityName(needyNeighbor, lang)}!`,
        reasoning: 'Redistribute rear garrison to forward base.',
      };
    }
  }

  // 4. Develop economy or fortify
  const developable = [...owned].filter((c) => c.development < 5).sort((a, b) => a.development - b.development)[0];
  if (faction.gold >= 220 && developable) {
    return {
      action: { type: 'develop', cityId: developable.id },
      proclamation:
        lang === 'zh'
          ? `兴修${cityName(developable, lang)}屯田水利，富国强兵！`
          : `Invest in ${cityName(developable, lang)}'s granaries and commerce!`,
      reasoning: 'Expand seasonal tax base.',
    };
  }

  const fortifiable = [...owned].filter((c) => c.defense < 5).sort((a, b) => a.defense - b.defense)[0];
  if (faction.gold >= 200 && fortifiable) {
    return {
      action: { type: 'fortify', cityId: fortifiable.id },
      proclamation:
        lang === 'zh'
          ? `加固${cityName(fortifiable, lang)}城垣，严阵以待！`
          : `Raise higher ramparts around ${cityName(fortifiable, lang)}!`,
      reasoning: 'Strengthen defensive walls.',
    };
  }

  return {
    action: { type: 'hold', cityId: owned[0].id },
    proclamation:
      lang === 'zh' ? '按兵不动，静观天下之变。' : 'Hold position and watch the realm.',
    reasoning: 'Conserving treasury.',
  };
}

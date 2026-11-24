import type {
  AITurnAction,
  City,
  DiplomacyProposalType,
  GameState,
  HeroEncounterRequest,
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

/**
 * Roads between each of a realm's cities and its nearest border: 0 for a city that touches
 * ground the realm does not hold, 1 for the city behind it, and so on.
 */
function frontDistances(state: GameState, factionId: PlayableFactionId): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier: string[] = [];
  for (const city of Object.values(state.cities)) {
    if (city.owner !== factionId) continue;
    if (city.neighbors.some((n) => state.cities[n] && state.cities[n].owner !== factionId)) {
      dist.set(city.id, 0);
      frontier.push(city.id);
    }
  }
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nid of state.cities[id].neighbors) {
        const other = state.cities[nid];
        if (!other || other.owner !== factionId || dist.has(nid)) continue;
        dist.set(nid, (dist.get(id) ?? 0) + 1);
        next.push(nid);
      }
    }
    frontier = next;
  }
  return dist;
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
      ? '奇士先生，我军已无立锥之地，当重整旗鼓再图霸业。'
      : 'Chrono-Strategist, we hold no commanderies left. We must begin anew.';
  }

  // Warn about Court Suspicion if dangerously close to Trust!
  if (state.chrono.suspicion >= state.chrono.trust - 8) {
    return lang === 'zh'
      ? `奇士慎之！如今朝堂猜忌已达 ${state.chrono.suspicion}（主公信任 ${state.chrono.trust}），守旧老臣蠢蠢欲动。眼下宜暂缓奇器研发、先以实打实的胜仗或义释俘将稳固主公信任，再图格物大计！`
      : `Careful, Chrono-Strategist! Court Suspicion (${state.chrono.suspicion}) is nearing Lord's Trust (${state.chrono.trust}). Pause radical inventions briefly and win a decisive battle or release a captive honorably before conservatives call a sorcery trial!`;
  }

  // Mention wandering legends if player asks about heroes
  const qLower = question.toLowerCase();
  const asksHero = /hero|recruit|general|wander|将|招|贤|名将/.test(qLower);
  const wandering = Object.values(state.generals).filter((g) => g.status === 'wandering');
  if (asksHero && wandering.length > 0) {
    const topW = [...wandering].sort(
      (a, b) => b.war + b.intellect - (a.war + a.intellect)
    )[0];
    const loc = state.cities[topW.cityId];
    return lang === 'zh'
      ? `探马来报：绝世奇才「${topW.name.zh}」（武 ${topW.war} / 智 ${topW.intellect}）此刻正在${loc ? loc.name.zh : '江湖'}隐居！先生既知其生平命数，何不遣高魅力名将亲往「三顾茅庐」，点破其心中隐秘必能一举收归麾下！`
      : `Scouts report that ${topW.name.en} (War ${topW.war} / Int ${topW.intellect}) is currently wandering near ${loc ? loc.name.en : 'the borderlands'}! Send a high-Charisma envoy from the Hall of Heroes and leverage your historical dossier to bring this legend under our banner!`;
  }

  // Best attack opportunity
  let bestAttack: { from: City; to: City; advantage: number } | null = null;
  for (const from of owned) {
    for (const nid of from.neighbors) {
      const to = state.cities[nid];
      if (!to || to.owner === player) continue;
      if (to.owner !== 'neutral') {
        const rel = getRelationBetween(state, player, to.owner);
        if (rel && rel.truceTurnsLeft > 0) continue;
      }
      const advantage = from.troops * 0.72 - to.troops * (1 + to.defense * 0.1);
      if (!bestAttack || advantage > bestAttack.advantage) {
        bestAttack = { from, to, advantage };
      }
    }
  }

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

  const asksDefense = /defen|vulnerab|safe|threat|防|隐忧|守|危/.test(qLower);
  const asksDiplo = /ally|diplom|truce|peace|联|盟|外|和/.test(qLower);

  if (asksDefense && mostThreatened) {
    const cName = cityName(mostThreatened.city, lang);
    const eName = cityName(mostThreatened.enemyCity, lang);
    return lang === 'zh'
      ? `启禀先生：${cName}（守军 ${mostThreatened.city.troops.toLocaleString()}，城防 Lv.${mostThreatened.city.defense}）紧邻敌镇${eName}（兵力 ${mostThreatened.enemyCity.troops.toLocaleString()}），实乃心腹之患。宜速调一名猛将驻守${cName}并增兵固防。`
      : `Strategist, ${cName} (${mostThreatened.city.troops.toLocaleString()} troops, Def Lv.${mostThreatened.city.defense}) faces heavy pressure from ${eName} (${mostThreatened.enemyCity.troops.toLocaleString()} troops). Relocate a top hero to ${cName}, fortify walls, and levy reinforcements.`;
  }

  if (asksDiplo && potentialAlly && strongestRival) {
    const allyName =
      lang === 'zh' ? state.factions[potentialAlly].name.zh : state.factions[potentialAlly].name.en;
    const bossName =
      lang === 'zh' ? state.factions[strongestRival].name.zh : state.factions[strongestRival].name.en;
    return lang === 'zh'
      ? `当今${bossName}兵强马壮${state.chrono.coalitionActive ? '，且敌国已合纵讨我' : ''}。上策当速遣使向${allyName}示好缓和局势，同时在格物工坊研造「活字印刷」或「望远镜」扭转乾坤！`
      : `${bossName} poses our greatest strategic threat${state.chrono.coalitionActive ? ' — and the Grand Coalition is hunting us' : ''}. Try easing pressure from ${allyName} while leveraging hero bonds and modern engineering wisely!`;
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
      ? `${faction.advisorName.zh}献策：良机已至！${fromN}屯兵 ${bestAttack.from.troops.toLocaleString()}，而邻城${toN}守军仅 ${bestAttack.to.troops.toLocaleString()}。若遣羁绊名将主副联手、发动绝技并施以「${tacticZh[tactic]}」，极有把握阵前斩将夺城！`
      : `${faction.advisorName.en}'s Counsel: Strike while the iron glows! ${fromN} holds ${bestAttack.from.troops.toLocaleString()} troops against ${toN}'s ${bestAttack.to.troops.toLocaleString()}. Deploy bonded heroes with their Signature Skill and challenge their defender to a duel using ${tactic.toUpperCase()} tactics!`;
  }

  const richest = [...owned].sort((a, b) => b.baseGold - a.baseGold)[0];
  return lang === 'zh'
    ? `当前历史偏移度 ${state.chrono.divergence}%，国库 ${faction.gold} 金、灵感 ${state.chrono.innovationPoints} 点。建议先在${cityName(richest, lang)}厉兵秣马，或往「名将录」寻访在野英杰、在「格物工坊」择机研造实用农医科技。`
    : `Timeline Divergence sits at ${state.chrono.divergence}% with ${faction.gold} gold and ${state.chrono.innovationPoints} Innovation. Build strength in ${cityName(richest, lang)}, recruit wandering legends in the Hall of Heroes, or unlock Field Medicine / Stirrups in the Tech Lab.`;
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
  const hasScaryTech =
    state.chrono.unlockedTechs.includes('gunpowder') ||
    state.chrono.unlockedTechs.includes('steamship');

  const playerCities = Object.values(state.cities).filter((c) => c.owner === player).length;
  const targetCities = Object.values(state.cities).filter((c) => c.owner === targetFaction).length;

  if (proposalType === 'war') {
    return {
      decision: 'acknowledge',
      relationDelta: -45,
      truceTurns: 0,
      reply:
        lang === 'zh'
          ? `哼！纵使${playerRuler.zh}麾下有异世奇士相助，孤亦不惧！点齐三军，沙场见真章！`
          : `Even with your uncanny Chrono-Strategist whispering in ${playerRuler.en}'s ear, we will never kneel! Sound the war drums!`,
    };
  }

  if (proposalType === 'gift') {
    return {
      decision: 'accept',
      relationDelta: 22,
      truceTurns: rel?.truceTurnsLeft ?? 0,
      reply:
        lang === 'zh'
          ? `厚礼孤便收下了。听说贵营近日奇技频出，望两家以和为贵。`
          : `Your generous gold is received. Rumors of your camp's strange inventions echo far — ${targetRuler.en} values peace when it serves our realm.`,
    };
  }

  if (proposalType === 'alliance') {
    if (state.chrono.coalitionActive) {
      return {
        decision: 'reject',
        relationDelta: -8,
        truceTurns: 0,
        reply:
          lang === 'zh'
            ? `休想分化联军！你等以妖奇之术搅乱天下，群雄已誓同进退，绝不议和！`
            : `We will not break the Grand Coalition! Your unnatural weapons threaten the entire balance of China — prepare for war!`,
      };
    }
    const willingness = currentScore + (targetCities <= playerCities ? 25 : -10) - (hasScaryTech ? 10 : 0);
    if (willingness >= -15) {
      return {
        decision: 'accept',
        relationDelta: 20,
        truceTurns: 3,
        reply:
          lang === 'zh'
            ? `善！当今强敌环伺，孤允准缔结三季停战盟约，望${playerRuler.zh}与那位奇士谨守信义！`
            : `Agreed. A 3-season truce serves us both well. Honor this oath, ${playerRuler.en} — and keep your strange war machines off our borders.`,
      };
    }
    return {
      decision: 'reject',
      relationDelta: -5,
      truceTurns: 0,
      reply:
        lang === 'zh'
          ? `哈哈，${playerRuler.zh}未免太过天真！两军积怨尚深，先以诚意或实力来说话吧！`
          : `A truce now? ${targetRuler.en} is not so easily swayed while old grudges burn. Send gold to prove your sincerity—or prepare your walls!`,
    };
  }

  const positiveBonus = currentScore >= 0 ? 8 : 5;
  return {
    decision: 'acknowledge',
    relationDelta: positiveBonus,
    truceTurns: rel?.truceTurnsLeft ?? 0,
    reply:
      lang === 'zh'
        ? `奇士之言，孤已尽知。天下大势瞬息万变，${targetRuler.zh}自会权衡利弊。`
        : `Your envoy's words have been heard in full. The winds of Heaven shift swiftly — ${targetRuler.en} will weigh your counsel carefully.`,
  };
}

export function generateHeuristicHeroEncounter(req: HeroEncounterRequest): {
  reply: string;
  outcome: 'join' | 'impressed' | 'refuse' | 'bonded';
  loyaltyDelta: number;
  trustDelta: number;
  divergenceDelta: number;
} {
  const { gameState, heroId, envoyHeroId, mode, approach, message, language: lang } = req;
  const hero = gameState.generals[heroId];
  const envoy = envoyHeroId ? gameState.generals[envoyHeroId] : undefined;
  const player = gameState.playerFaction;
  const ruler = gameState.factions[player].rulerName;

  if (!hero) {
    return {
      reply: lang === 'zh' ? '此将不知所踪。' : 'This hero could not be found.',
      outcome: 'refuse',
      loyaltyDelta: 0,
      trustDelta: 0,
      divergenceDelta: 0,
    };
  }

  // Private Council Chat with owned hero
  if (mode === 'chat') {
    const mentionsTech = /tech|gunpowder|medicine|steam|future|科技|火药|医|未来|穿越/i.test(message);
    return {
      outcome: 'bonded',
      loyaltyDelta: 4,
      trustDelta: 1,
      divergenceDelta: mentionsTech ? 1 : 0,
      reply:
        lang === 'zh'
          ? mentionsTech
            ? `「先生所言格物奇理实令${hero.name.zh}大开眼界！昔日只觉荒诞，如今方知天下之大无奇不有。末将愿与先生并肩辅佐${ruler.zh}！」`
            : `「得先生推心置腹一席话，${hero.name.zh}胸中豁然开朗！但凭主公与先生差遣，万死不辞！」`
          : mentionsTech
            ? `"The strange sciences you describe astonish me, Strategist! At first I doubted them, yet now I see you truly command heaven-sent craft. ${hero.name.en} stands ready beside you!"`
            : `"Your frank counsel warms my spirit, Strategist. ${hero.name.en} pledges blade and mind to ${ruler.en}'s cause!"`,
    };
  }

  // Sworn Vendetta check — NEVER joins the executioner of their sworn brother!
  if (hero.vendettaAgainst.includes(player)) {
    return {
      outcome: 'refuse',
      loyaltyDelta: 0,
      trustDelta: -1,
      divergenceDelta: 0,
      reply:
        lang === 'zh'
          ? `「住口！你等与我有血海深仇，${hero.name.zh}宁可血溅五步，绝不屈膝事贼！」`
          : `"Silence! Blood demands blood — ${hero.name.en} will die standing before ever bowing to your cursed banner!"`,
    };
  }

  // Calculate recruitment / persuasion score
  const envoyCharisma = envoy ? envoy.charisma : 82;
  const trustBonus = gameState.chrono.trust >= 80 ? 15 : gameState.chrono.trust >= 55 ? 5 : -8;
  const printingBonus = gameState.chrono.unlockedTechs.includes('printing') ? 16 : 0;
  const divergencePenalty = gameState.chrono.divergence >= 60 && approach === 'future_intel' ? -18 : 0;

  let approachScore = 0;
  if (approach === 'future_intel') {
    approachScore = 26 + divergencePenalty;
  } else if (approach === 'gold') {
    // High-honor heroes (Guan Yu, Zhao Yun, Zhuge Liang, Diaochan) dislike plain bribes!
    approachScore = ['guanyu', 'zhaoyun', 'zhugeliang', 'diaochan'].includes(hero.id) ? -25 : 18;
  } else if (approach === 'righteous') {
    approachScore = hero.charisma >= 85 || hero.originalFaction === 'shu' ? 22 : 12;
  } else if (approach === 'rank') {
    approachScore = hero.archetype === 'vanguard' || hero.id === 'weiyan' || hero.id === 'pangtong' ? 22 : 12;
  } else {
    approachScore = message.trim().length >= 16 ? 20 : 10;
  }

  const difficulty = mode === 'persuade' ? Math.max(45, hero.loyalty - 8) : 52;
  const totalScore = Math.round(envoyCharisma * 0.48 + approachScore + trustBonus + printingBonus);

  if (totalScore >= difficulty) {
    const usedFuture = approach === 'future_intel';
    return {
      outcome: 'join',
      loyaltyDelta: 0,
      trustDelta: 5,
      divergenceDelta: usedFuture ? 7 : 3,
      reply:
        lang === 'zh'
          ? usedFuture
            ? `「什么？！阁下竟连${hero.name.zh}心中隐秘与未来凶险都一语道破！莫非真是天人降世？既然如此，${hero.name.zh}愿倾心相托，拜见${ruler.zh}！」`
            : `「听君一席话，胜读十年书！${ruler.zh}帐下既有先生这般奇士，${hero.name.zh}愿执鞭坠镫、共图大业！」`
          : usedFuture
            ? `"Impossible!! How could a mortal know ${hero.name.en}'s hidden fate and private burdens?! Heaven itself must have sent you — I swear my sword and counsel to ${ruler.en}!"`
            : `"Your words ring with rare conviction. If ${ruler.en} commands minds such as yours, then ${hero.name.en} gladly joins your banner!"`,
    };
  }

  if (totalScore >= difficulty - 14) {
    return {
      outcome: 'impressed',
      loyaltyDelta: -6,
      trustDelta: 1,
      divergenceDelta: approach === 'future_intel' ? 4 : 0,
      reply:
        lang === 'zh'
          ? `「先生言辞颇有见地，令${hero.name.zh}暗暗称奇……只是兹事体大，容我再观贵军气数与诚意，改日再议！」`
          : `"Your words carry unexpected weight, Strategist... yet ${hero.name.en} does not swear oaths lightly. Prove your realm's virtue and visit me again!"`,
    };
  }

  return {
    outcome: 'refuse',
    loyaltyDelta: 0,
    trustDelta: -1,
    divergenceDelta: 0,
    reply:
      lang === 'zh'
        ? `「哼！区区巧言岂能动摇${hero.name.zh}之志？请回吧！」`
        : `"Hmph! Empty flattery cannot sway ${hero.name.en}'s resolve. Return to your camp!"`,
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

  // 1. March on a neighbour when the odds are good, but never strip a border city bare: enough
  //    men stay behind to hold the walls against the strongest enemy garrison in reach.
  const mayAttack = (owner: City['owner']): boolean => {
    if (owner === factionId) return false;
    if (owner === 'neutral') return true;
    const rel = getRelationBetween(state, factionId, owner);
    return !(rel && rel.truceTurnsLeft > 0);
  };

  let bestAttack: { from: City; to: City; score: number; ratio: number } | null = null;
  for (const from of owned) {
    if (from.troops < 5500) continue;
    for (const nid of from.neighbors) {
      const to = state.cities[nid];
      if (!to || !mayAttack(to.owner)) continue;

      let threat = 0;
      for (const oid of from.neighbors) {
        const other = state.cities[oid];
        if (!other || other.id === to.id || other.owner === 'neutral') continue;
        if (mayAttack(other.owner)) threat = Math.max(threat, other.troops);
      }
      const guard = Math.max(1800, threat * 0.5);
      const ratio = Math.min(0.7, (from.troops - guard) / from.troops);
      if (ratio < 0.45) continue;

      const sendTroops = from.troops * ratio;
      const defStrength = to.troops * (1 + to.defense * 0.11);
      const odds = sendTroops / Math.max(1000, defStrength);

      const neutralBonus = to.owner === 'neutral' ? 0.18 : 0;
      const coalitionFocus =
        state.chrono.coalitionActive && to.owner === state.playerFaction ? 0.28 : 0;
      const score = odds + neutralBonus + coalitionFocus;

      if (score >= 1.04 && (!bestAttack || score > bestAttack.score)) {
        bestAttack = { from, to, score, ratio };
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
        troopsRatio: Number(bestAttack.ratio.toFixed(2)),
      },
      proclamation:
        lang === 'zh'
          ? state.chrono.coalitionActive && bestAttack.to.owner === state.playerFaction
            ? `联军齐动！即刻自${fromN}发兵讨伐异数，直取${toN}！`
            : `三军听令！即刻自${fromN}拔营，直取${toN}！`
          : state.chrono.coalitionActive && bestAttack.to.owner === state.playerFaction
            ? `For the Grand Coalition! March from ${fromN} and purge the anomaly at ${toN}!`
            : `Sound the horns! March from ${fromN} and claim ${toN} for our banner!`,
      reasoning: `${fromN} holds an assault advantage over ${toN}.`,
    };
  }

  // 1b. If a hostile border fortress is too tough for full assault, soften it via Bombard or Night Raid!
  let softTarget: { from: City; to: City; kind: 'bombard' | 'raid' } | null = null;
  for (const from of owned) {
    if (from.troops < 3500) continue;
    for (const nid of from.neighbors) {
      const to = state.cities[nid];
      if (!to || to.owner === factionId || to.owner === 'neutral') continue;
      const rel = getRelationBetween(state, factionId, to.owner);
      if (rel && rel.truceTurnsLeft > 0) continue;
      const hostile =
        rel?.status === 'war' ||
        (state.chrono.coalitionActive && to.owner === state.playerFaction);
      if (!hostile) continue;

      if (to.defense >= 4 && faction.gold >= 240 && (state.turn + from.id.charCodeAt(0)) % 3 === 0) {
        softTarget = { from, to, kind: 'bombard' };
        break;
      }
      if (to.troops >= 9500 && (state.turn + to.id.charCodeAt(0)) % 3 === 1) {
        softTarget = { from, to, kind: 'raid' };
      }
    }
    if (softTarget?.kind === 'bombard') break;
  }

  if (softTarget) {
    const fromN = cityName(softTarget.from, lang);
    const toN = cityName(softTarget.to, lang);
    if (softTarget.kind === 'bombard') {
      return {
        action: { type: 'bombard', cityId: softTarget.from.id, targetCityId: softTarget.to.id },
        proclamation:
          lang === 'zh'
            ? `以火攻雷石轰击${toN}城墙，先挫敌锐！`
            : `Rain fire and siege stone upon ${toN}'s ramparts from ${fromN}!`,
        reasoning: `Soften fortified walls of ${toN}.`,
      };
    }
    return {
      action: { type: 'raid', cityId: softTarget.from.id, targetCityId: softTarget.to.id },
      proclamation:
        lang === 'zh'
          ? `遣精锐轻骑夜袭${toN}大营，劫粮断其军心！`
          : `Unleash fast raiders from ${fromN} to strike ${toN}'s camp by night!`,
      reasoning: `Harass garrison and plunder supplies at ${toN}.`,
    };
  }

  // 2. Rear garrisons march toward the border: a city with no enemy in reach keeps a guard and
  //    sends the rest one road closer to the front.
  const toFront = frontDistances(state, factionId);
  const rearSurplus = owned
    .filter((c) => (toFront.get(c.id) ?? 0) >= 1 && c.troops >= 6500)
    .sort((a, b) => b.troops - a.troops)[0];

  if (rearSurplus) {
    const here = toFront.get(rearSurplus.id) ?? 0;
    const forward = rearSurplus.neighbors
      .map((id) => state.cities[id])
      .filter((c): c is City => Boolean(c && c.owner === factionId))
      .filter((c) => (toFront.get(c.id) ?? 0) < here)
      .sort((a, b) => a.troops - b.troops)[0];
    if (forward) {
      return {
        action: {
          type: 'reinforce',
          cityId: rearSurplus.id,
          targetCityId: forward.id,
          troopsRatio: 0.45,
        },
        proclamation:
          lang === 'zh'
            ? `调遣${cityName(rearSurplus, lang)}偏师星夜驰援${cityName(forward, lang)}！`
            : `Dispatch reserves from ${cityName(rearSurplus, lang)} to reinforce ${cityName(forward, lang)}!`,
        reasoning: 'Move a rear garrison one road closer to the border.',
      };
    }
  }

  // 3. Levy where the border is thinnest
  const recruitGold = factionId === 'wei' ? 153 : 180;
  const frontline = owned
    .filter((c) => (toFront.get(c.id) ?? 0) === 0)
    .sort((a, b) => a.troops - b.troops);

  if (faction.gold >= recruitGold && faction.food >= 140 && frontline.length > 0) {
    const targetCity = frontline[0];
    return {
      action: { type: 'recruit', cityId: targetCity.id },
      proclamation:
        lang === 'zh'
          ? `传令${cityName(targetCity, lang)}广募精锐，严阵以待！`
          : `Levy fresh regiments in ${cityName(targetCity, lang)} — war draws near!`,
      reasoning: `Bolster frontline garrison in ${cityName(targetCity, lang)}.`,
    };
  }

  const developable = [...owned]
    .filter((c) => c.development < 5)
    .sort((a, b) => a.development - b.development)[0];
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

  const fortifiable = [...owned]
    .filter((c) => c.defense < 5)
    .sort((a, b) => a.defense - b.defense)[0];
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
    proclamation: lang === 'zh' ? '按兵不动，静观天下之变。' : 'Hold position and watch the realm.',
    reasoning: 'Conserving treasury.',
  };
}

import type {
  DiplomacyProposalType,
  GameState,
  HeroEncounterRequest,
  Language,
  PlayableFactionId,
} from '../../src/game/types.js';
import { VICTORY_CITY_TARGET } from '../../src/game/data.js';

const RULER_PERSONAS: Record<PlayableFactionId, { en: string; zh: string }> = {
  wei: {
    en: 'Cao Cao (曹操): Ambitious, pragmatic, poetic, razor-sharp Realpolitik strategist. Intrigued yet wary of strange modern inventions and uncanny prophecies.',
    zh: '曹操：雄才大略、务实权谋的乱世枭雄。对穿越者的奇器与先知既感惊异又暗存戒心。',
  },
  shu: {
    en: 'Liu Bei (刘备): Benevolent, charismatic, devoted to restoring the Han dynasty and protecting his sworn brothers. Respects righteous foresight.',
    zh: '刘备：仁德宽厚、志在兴复汉室。对能救苍生、护结义兄弟的奇谋深怀敬意。',
  },
  wu: {
    en: 'Sun Quan (孙权): Shrewd, proud lord of Jiangdong and the Yangtze riverfront. Watches northern ambitions and naval balance with eagle eyes.',
    zh: '孙权：坐断东南、老成持重的江东之主。最重长江水师与江东尊严。',
  },
};

export function summarizeGameStateForAI(state: GameState, lang: Language): string {
  const factionLines = (['wei', 'shu', 'wu'] as PlayableFactionId[]).map((fid) => {
    const f = state.factions[fid];
    const owned = Object.values(state.cities).filter((c) => c.owner === fid);
    const totalTroops = owned.reduce((s, c) => s + c.troops, 0);
    const cityList = owned
      .map(
        (c) =>
          `${lang === 'zh' ? c.name.zh : c.name.en}(id:${c.id}, province:${c.province}, troops:${c.troops}, def:${c.defense}, farming:${c.farming}, trade:${c.trade}, drill:${c.drill}, support:${c.support}, terrain:${c.terrain}, neighbors:[${c.neighbors.join(',')}])`
      )
      .join('; ');
    const rivalTechs =
      fid === state.playerFaction
        ? state.chrono.unlockedTechs
        : state.chrono.rivalTechs[fid] || [];
    return `- ${fid.toUpperCase()} (${lang === 'zh' ? f.rulerName.zh : f.rulerName.en}): gold=${f.gold}, food=${f.food}, totalTroops=${totalTroops}, tech=[${rivalTechs.join(',')}], cities(${owned.length}): ${cityList || 'NONE'}`;
  });

  const neutralCities = Object.values(state.cities)
    .filter((c) => c.owner === 'neutral')
    .map(
      (c) =>
        `${lang === 'zh' ? c.name.zh : c.name.en}(id:${c.id}, province:${c.province}, troops:${c.troops}, def:${c.defense}, neighbors:[${c.neighbors.join(',')}])`
    )
    .join('; ');

  const wandering = Object.values(state.generals)
    .filter((g) => g.status === 'wandering')
    .map((g) => `${lang === 'zh' ? g.name.zh : g.name.en}@${g.cityId}`)
    .join(', ');

  const diploLines = Object.values(state.diplomacy)
    .map(
      (d) =>
        `${d.factions[0]}-${d.factions[1]}: status=${d.status}, score=${d.score}, truceTurns=${d.truceTurnsLeft}`
    )
    .join(' | ');

  const recentEvents = state.chronicle
    .slice(0, 5)
    .map((e) => (lang === 'zh' ? e.text.zh : e.text.en))
    .join('\n');

  return [
    `Turn ${state.turn} (${state.year} AD, ${state.season}). Player is a Time-Traveler ("Chrono-Strategist") advising ${state.playerFaction.toUpperCase()}.`,
    `Map: ${Object.keys(state.cities).length} cities in 11 Han provinces; a realm that holds ${VICTORY_CITY_TARGET} unifies the land. Armies move only between neighbouring cities.`,
    `Chrono Status: LordTrust=${state.chrono.trust}/100, CourtSuspicion=${state.chrono.suspicion}/100, TimelineDivergence=${state.chrono.divergence}%, CoalitionActive=${state.chrono.coalitionActive}, PlayerModernTech=[${state.chrono.unlockedTechs.join(',') || 'none'}].`,
    `Wandering Heroes: ${wandering || 'none'}.`,
    `Factions:`,
    ...factionLines,
    `Neutral cities: ${neutralCities || 'None'}`,
    `Diplomacy: ${diploLines}`,
    `Recent Chronicle:\n${recentEvents}`,
  ].join('\n');
}

export function buildAdvisorPrompt(
  state: GameState,
  question: string,
  lang: Language
): { systemInstruction: string; prompt: string } {
  const faction = state.factions[state.playerFaction];
  const advisorName = lang === 'zh' ? faction.advisorName.zh : faction.advisorName.en;
  const rulerName = lang === 'zh' ? faction.rulerName.zh : faction.rulerName.en;

  const systemInstruction =
    lang === 'zh'
      ? `你是三国顶级军师「${advisorName}」，与来自异世的神秘奇士（玩家，拥有超前格物奇技与先知洞察）共同辅佐${faction.name.zh}主公${rulerName}。请严格根据当前战局、名将动向、朝堂猜忌与历史偏移度，给出简明、具体、富有古风谋略感的建议（3-5句话）。切勿编造不存在的城池。`
      : `You are ${advisorName}, Chief Strategist of ${faction.name.en} serving ${rulerName} alongside the mysterious "Chrono-Strategist" (the player, whose uncanny foresight and bizarre modern inventions awe and unsettle the court). Give concise, actionable strategic counsel (3-5 sentences) referencing exact cities, heroes, wandering legends, Court Suspicion, or Butterfly Effect risks.`;

  const prompt = `${summarizeGameStateForAI(state, lang)}\n\nChrono-Strategist's Question: ${question}`;
  return { systemInstruction, prompt };
}

export const DIPLOMACY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'In-character diplomatic response from the rival warlord (2-4 sentences).',
    },
    decision: {
      type: 'string',
      enum: ['accept', 'reject', 'acknowledge'],
    },
    relationDelta: {
      type: 'integer',
      description: 'Relationship score change between -30 and +30.',
    },
    truceTurns: {
      type: 'integer',
      description: 'Number of truce turns granted (0 if rejected/war, 3 if alliance accepted).',
    },
  },
  required: ['reply', 'decision', 'relationDelta', 'truceTurns'],
};

export function buildDiplomacyPrompt(
  state: GameState,
  targetFaction: PlayableFactionId,
  proposalType: DiplomacyProposalType,
  message: string,
  giftGold: number | undefined,
  lang: Language
): { systemInstruction: string; prompt: string } {
  const persona = RULER_PERSONAS[targetFaction][lang];
  const playerName =
    lang === 'zh'
      ? state.factions[state.playerFaction].rulerName.zh
      : state.factions[state.playerFaction].rulerName.en;

  const systemInstruction =
    lang === 'zh'
      ? `你正在扮演三国君主：${persona}。${playerName}麾下有一位号称能预知未来、造出奇器的神秘谋士（玩家）。若对方已解锁黑火药、热气球或蒸汽战船，或天下合纵已开启，你的措辞应对此流露警觉或忌惮。根据实力与外交关系返回严格 JSON（reply, decision, relationDelta, truceTurns）。reply 使用中文。`
      : `You are roleplaying a Three Kingdoms warlord: ${persona}. ${playerName} is advised by a mysterious Chrono-Strategist rumored to possess uncanny foresight and unnatural weapons. If they unlocked gunpowder/balloons/steamships or if the Grand Coalition is active, react with alarm or defiance! Return strictly valid JSON (reply, decision, relationDelta, truceTurns) in English.`;

  const prompt = [
    summarizeGameStateForAI(state, lang),
    `\nIncoming Envoy from: ${state.playerFaction.toUpperCase()}`,
    `Proposal Type: ${proposalType}${giftGold ? ` (Gift: ${giftGold} gold)` : ''}`,
    `Envoy Message: "${message || '(Formal diplomatic dispatch)'}"`,
  ].join('\n');

  return { systemInstruction, prompt };
}

export const HERO_ENCOUNTER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'In-character response from the Three Kingdoms hero (2-4 vivid sentences).',
    },
    outcome: {
      type: 'string',
      enum: ['join', 'impressed', 'refuse', 'bonded'],
      description:
        'For recruit/persuade: "join" if convinced to swear allegiance, "impressed" if moved but hesitant, "refuse" if rejecting. For private chat: always "bonded".',
    },
    loyaltyDelta: {
      type: 'integer',
      description: 'Loyalty shift (-5 to +10).',
    },
    trustDelta: {
      type: 'integer',
      description: 'Lord trust shift (-3 to +6).',
    },
    divergenceDelta: {
      type: 'integer',
      description: 'Timeline divergence increase (0 to 8; higher if player revealed shocking future history).',
    },
  },
  required: ['reply', 'outcome', 'loyaltyDelta', 'trustDelta', 'divergenceDelta'],
};

export function buildHeroEncounterPrompt(
  req: HeroEncounterRequest
): { systemInstruction: string; prompt: string } {
  const { gameState, heroId, envoyHeroId, mode, approach, message, giftGold, language: lang } = req;
  const hero = gameState.generals[heroId];
  const envoy = envoyHeroId ? gameState.generals[envoyHeroId] : undefined;
  const playerFaction = gameState.factions[gameState.playerFaction];
  const hasVendetta = hero.vendettaAgainst.includes(gameState.playerFaction);
  const hasPrinting = gameState.chrono.unlockedTechs.includes('printing');

  const systemInstruction =
    lang === 'zh'
      ? `你正在扮演三国名将「${hero.name.zh}（${hero.title.zh}）」。
人物长处：${hero.dossier.historicalStrength.zh}
人物软肋：${hero.dossier.fatalFlaw.zh}
历史命数：${hero.dossier.fatedDestiny.zh}
当前身份：${hero.status}，忠诚：${hero.loyalty}，对玩家势力是否有血海深仇：${hasVendetta ? '是（誓死不降！）' : '否'}。
对话对象是辅佐${playerFaction.name.zh}${playerFaction.rulerName.zh}的神秘「天命奇士」（来自未来的穿越者）。
如果对方在话语中点破你未曾向人道出的私密抱负、弱点或未来死劫（如落凤坡、麦城、病疾等），你会感到由衷震惊与骇然！
- 若 mode="chat"，你已是其同僚，回复亲切富有古风，outcome 必为 "bonded"，loyaltyDelta 在 3~6 之间。
- 若 mode="recruit"（三顾茅庐招贤）或 "persuade"（劝降俘虏）：若有血海深仇则必为 "refuse"；若对方诚意打动你或以先知点破命运（且契合你的性格），可设为 "join"；若对方仅用你不屑的方式（如对关羽重金收买），应严词 "refuse"。
请严格返回符合 schema 的中文 JSON。`
      : `You are roleplaying legendary Three Kingdoms hero ${hero.name.en} (${hero.title.en}).
Historical Strength: ${hero.dossier.historicalStrength.en}
Fatal Flaw: ${hero.dossier.fatalFlaw.en}
Fated Destiny: ${hero.dossier.fatedDestiny.en}
Current Status: ${hero.status}, Loyalty: ${hero.loyalty}, Sworn Vendetta vs player faction: ${hasVendetta ? 'YES (NEVER JOIN!)' : 'No'}.
You are speaking to the mysterious "Chrono-Strategist" (a time-traveler from the future serving ${playerFaction.rulerName.en} of ${playerFaction.name.en}).
If they reveal uncanny future knowledge about your secret ambitions, hidden flaw, or fated doom (e.g., Fallen Phoenix Slope, Maicheng, fatal illness), react with genuine astonishment and awe!
- If mode="chat": You serve the same kingdom; reply warmly in character, set outcome="bonded", loyaltyDelta 3..6.
- If mode="recruit" or "persuade": If Sworn Vendetta is YES, ALWAYS set outcome="refuse". Otherwise judge their pitch, envoy charisma, and whether they hit your true values (e.g., honor vs rank vs future warning; printing propaganda=${hasPrinting}) to return "join", "impressed", or "refuse".
Return strictly valid JSON in English.`;

  const prompt = [
    summarizeGameStateForAI(gameState, lang),
    `\nEncounter Mode: ${mode.toUpperCase()}`,
    `Approach: ${approach}${giftGold ? ` (Offering ${giftGold} gold)` : ''}`,
    `Envoy: ${envoy ? `${envoy.name.en} (Charisma ${envoy.charisma})` : 'Chrono-Strategist personally'}`,
    `Player's Pitch: "${message || '(A formal appeal tailored to your legacy)'}"`,
  ].join('\n');

  return { systemInstruction, prompt };
}

export const AI_TURN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['attack', 'raid', 'bombard', 'recruit', 'farm', 'trade', 'drill', 'relief', 'fortify', 'reinforce', 'hold'],
    },
    cityId: { type: 'string' },
    targetCityId: { type: 'string' },
    tactic: {
      type: 'string',
      enum: ['assault', 'fire', 'ambush', 'siege'],
    },
    troopsRatio: { type: 'number' },
    proclamation: { type: 'string' },
    reasoning: { type: 'string' },
  },
  required: ['type', 'cityId', 'proclamation', 'reasoning'],
};

export function buildAITurnPrompt(
  state: GameState,
  factionId: PlayableFactionId,
  lang: Language
): { systemInstruction: string; prompt: string } {
  const persona = RULER_PERSONAS[factionId][lang];
  const ownedCities = Object.values(state.cities).filter((c) => c.owner === factionId);
  const ownedIds = ownedCities.map((c) => c.id).join(', ');
  const coalitionNote = state.chrono.coalitionActive
    ? lang === 'zh'
      ? '【天下合纵已启动】：请优先集结兵力猛攻、夜袭或火攻轰击玩家势力，切勿攻打盟友！'
      : 'GRAND COALITION ACTIVE: Prioritize attacking, raiding, or bombarding the player faction and respect your coalition ally!'
    : '';

  const systemInstruction =
    lang === 'zh'
      ? `你是三国策略游戏中的 AI 君主：${persona}。你当前掌管城池 ID：[${ownedIds}]。${coalitionNote}
请为本回合选择最佳单一战略行动，严格返回 JSON：
1. attack 需 cityId 兵力 >= 4500 且 targetCityId 在其 neighbors 中（避开 truce 盟友）。
2. raid（夜袭劫营）需 cityId 兵力 >= 2500 且 targetCityId 邻接，适合消耗高守军敌城并劫粮。
3. bombard（火攻轰城）需国库 >= 150 且 targetCityId 邻接且城防 >= 3，削弱敌城墙与守军。
4. recruit 需国库 >= 180 且粮草 >= 140（募兵使该城民心 -6、训练度下降）；farm（国库 >= 120，farming < 5，增粮）；trade（国库 >= 120，trade < 5，增金）；drill（国库 >= 80，drill < 100，训练度高则战场士气高）；relief（粮草 >= 160，support < 100，开仓赈济回升民心；民心低于 25 则每季逃兵且收入减少）；fortify（国库 >= 200，城防 < 5）。
5. proclamation 与 reasoning 使用简短中文。`
      : `You are an autonomous Three Kingdoms AI warlord: ${persona}. You own city IDs: [${ownedIds}]. ${coalitionNote}
Choose the single strongest strategic action and return strictly valid JSON:
1. "attack": owned cityId (>= 4500 troops) vs adjacent enemy/neutral targetCityId (respect active truces).
2. "raid": hit-and-run night raid (cityId >= 2500 troops) to thin a heavily defended neighbor & plunder supplies.
3. "bombard": fire/gunpowder strike (gold >= 150) against an adjacent fortified city (defense >= 3) to blast walls.
4. "recruit" (gold >= 180, food >= 140; costs that city 6 support and waters down its drill), "farm" (gold >= 120, farming < 5: more grain), "trade" (gold >= 120, trade < 5: more gold), "drill" (gold >= 80, drill < 100: higher battle morale), "relief" (food >= 160, support < 100: restores support; below 25 a city loses income and deserters every season), or "fortify" (gold >= 200, def < 5).
5. Write proclamation and reasoning concisely in English.`;

  const prompt = `${summarizeGameStateForAI(state, lang)}\n\nSelect the best move for ${factionId.toUpperCase()} now.`;
  return { systemInstruction, prompt };
}

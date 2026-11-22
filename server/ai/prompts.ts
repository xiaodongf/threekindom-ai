import type {
  DiplomacyProposalType,
  GameState,
  Language,
  PlayableFactionId,
} from '../../src/game/types.js';

const RULER_PERSONAS: Record<PlayableFactionId, { en: string; zh: string }> = {
  wei: {
    en: 'Cao Cao (曹操): Ambitious, pragmatic, poetic, razor-sharp Realpolitik strategist. Respects strength, despises naive weakness, speaks with commanding authority.',
    zh: '曹操：雄才大略、务实权谋、横槊赋诗的乱世枭雄。重实力轻空谈，言辞威严果决。',
  },
  shu: {
    en: 'Liu Bei (刘备): Benevolent, charismatic, deeply committed to restoring the Han dynasty, righteous yet shrewd in survival and alliance-building.',
    zh: '刘备：仁德宽厚、礼贤下士、志在兴复汉室。言辞恳切重义，却亦深谙合纵自保之道。',
  },
  wu: {
    en: 'Sun Quan (孙权): Shrewd, proud defender of Jiangdong and the Yangtze riverfront. Balances Wei and Shu carefully, values trade, maritime supremacy, and dignity.',
    zh: '孙权：坐断东南、老成持重的江东之主。善衡魏蜀两强，重江防、水师与江东基业。',
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
          `${lang === 'zh' ? c.name.zh : c.name.en}(id:${c.id}, troops:${c.troops}, def:${c.defense}, dev:${c.development}, terrain:${c.terrain}, neighbors:[${c.neighbors.join(',')}])`
      )
      .join('; ');
    return `- ${fid.toUpperCase()} (${lang === 'zh' ? f.rulerName.zh : f.rulerName.en}): gold=${f.gold}, food=${f.food}, totalTroops=${totalTroops}, cities(${owned.length}): ${cityList || 'NONE'}`;
  });

  const neutralCities = Object.values(state.cities)
    .filter((c) => c.owner === 'neutral')
    .map(
      (c) =>
        `${lang === 'zh' ? c.name.zh : c.name.en}(id:${c.id}, troops:${c.troops}, def:${c.defense}, neighbors:[${c.neighbors.join(',')}])`
    )
    .join('; ');

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
    `Turn ${state.turn} (${state.year} AD, ${state.season}). Player controls: ${state.playerFaction.toUpperCase()}.`,
    `Victory goal: Control 9 cities.`,
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
      ? `你是三国演义与史实背景下的顶级军师「${advisorName}」，效忠于${faction.name.zh}主公${rulerName}。请严格根据当前战局数据给出简明、具体、富有古风谋略感的战术建议（3-5句话，点出具体城池名、兵力对比与行动建议）。切勿编造不存在的城池。`
      : `You are ${advisorName}, Chief Strategist of ${faction.name.en} serving ${rulerName} in 214 AD Three Kingdoms China. Give concise, actionable, atmospheric strategic counsel (3-5 sentences) grounded strictly in the live map numbers, naming exact cities, troop counts, and next moves. Never invent cities.`;

  const prompt = `${summarizeGameStateForAI(state, lang)}\n\nLord's Question: ${question}`;
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
      description: 'accept if agreeing to alliance/gift, reject if refusing, acknowledge for general envoy messages or war.',
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
      ? `你正在扮演三国君主：${persona}。请根据当前天下大势、双方实力对比与外交关系，以君主口吻回复${playerName}派来的使者，并返回严格的 JSON 对象（reply, decision, relationDelta, truceTurns）。若对方宣战，decision 为 "acknowledge"，truceTurns 为 0；若对方赠金，通常接受并提升好感；若对方提议结盟，结合共同强敌与关系决定是否接受（接受时 truceTurns=3）。reply 必须使用中文。`
      : `You are roleplaying a Three Kingdoms warlord: ${persona}. Evaluate the map balance, relative military strength, and existing relations to respond in character to ${playerName}'s envoy. Return strictly valid JSON matching the schema (reply, decision, relationDelta, truceTurns). If war is declared, set decision="acknowledge", truceTurns=0, negative relationDelta. If alliance accepted, set truceTurns=3. Reply in English.`;

  const prompt = [
    summarizeGameStateForAI(state, lang),
    `\nIncoming Envoy from: ${state.playerFaction.toUpperCase()}`,
    `Proposal Type: ${proposalType}${giftGold ? ` (Gift: ${giftGold} gold)` : ''}`,
    `Envoy Message: "${message || '(Formal diplomatic dispatch)'}"`,
  ].join('\n');

  return { systemInstruction, prompt };
}

export const AI_TURN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['attack', 'recruit', 'develop', 'fortify', 'reinforce', 'hold'],
    },
    cityId: {
      type: 'string',
      description: 'ID of one of your owned cities to act from.',
    },
    targetCityId: {
      type: 'string',
      description: 'Required for attack or reinforce: an adjacent neighbor city ID.',
    },
    tactic: {
      type: 'string',
      enum: ['assault', 'fire', 'ambush', 'siege'],
      description: 'Required when type is attack.',
    },
    troopsRatio: {
      type: 'number',
      description: 'Fraction of troops from cityId to send (0.45 to 0.78).',
    },
    proclamation: {
      type: 'string',
      description: 'Short, dramatic 1-sentence warlord proclamation in character.',
    },
    reasoning: {
      type: 'string',
      description: 'Brief 1-sentence strategic reason for this move.',
    },
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

  const systemInstruction =
    lang === 'zh'
      ? `你是三国策略游戏中的 AI 君主：${persona}。你当前掌管城池 ID：[${ownedIds}]。请为本回合选择最佳单一战略行动，严格返回 JSON。规则：
1. attack 必须选择自己兵力 >= 4500 的城池 cityId 攻打其 neighbors 中的敌方或中立城池 targetCityId（尽量避免攻打处于 truce/allied 状态的势力，除非胜算极大）。
2. recruit 需国库 >= 180 且粮草 >= 140。
3. develop 需国库 >= 220 且繁荣度 < 5。
4. fortify 需国库 >= 200 且城防 < 5。
5. proclamation 与 reasoning 请用简短中文书写。`
      : `You are an autonomous Three Kingdoms AI warlord: ${persona}. You currently own city IDs: [${ownedIds}]. Choose the single strongest strategic action this turn and return strictly valid JSON. Rules:
1. For "attack", choose an owned cityId with >= 4500 troops and an adjacent enemy/neutral targetCityId from its neighbors list. Respect active truces unless an overwhelming opportunity appears.
2. For "recruit", ensure gold >= 180 and food >= 140.
3. For "develop", ensure gold >= 220 and development < 5.
4. For "fortify", ensure gold >= 200 and defense < 5.
5. Write proclamation and reasoning concisely in English.`;

  const prompt = `${summarizeGameStateForAI(state, lang)}\n\nSelect the best move for ${factionId.toUpperCase()} now.`;
  return { systemInstruction, prompt };
}

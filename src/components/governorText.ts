import type { GovernorFocus, GovernorTask } from '../game/types.js';

/** Words for a governor's instructions and tasks, shared by the city view and the realm table. */
export const FOCUS_TEXT: Record<GovernorFocus, { en: string; zh: string }> = {
  auto: { en: 'Governor decides', zh: '自行决断' },
  farming: { en: 'Farming', zh: '劝农' },
  trade: { en: 'Trade', zh: '兴商' },
  walls: { en: 'Walls', zh: '修城' },
  drill: { en: 'Drill', zh: '练兵' },
  relief: { en: 'The people', zh: '抚民' },
};

export const TASK_DOING: Record<GovernorTask, { en: string; zh: string }> = {
  farming: { en: 'opening new fields', zh: '开垦屯田' },
  trade: { en: 'enlarging the market', zh: '扩建市集' },
  walls: { en: 'strengthening the walls', zh: '加固城防' },
  drill: { en: 'drilling the garrison', zh: '操练士卒' },
  relief: { en: 'winning over the people', zh: '安抚百姓' },
};

/** The skill each task draws on, as the interface names it. */
export const TASK_SKILL: Record<GovernorTask, { en: string; zh: string }> = {
  farming: { en: 'Rule', zh: '政务' },
  trade: { en: 'Rule', zh: '政务' },
  walls: { en: 'Lead', zh: '统率' },
  drill: { en: 'Lead', zh: '统率' },
  relief: { en: 'Charm', zh: '魅力' },
};

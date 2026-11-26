import { UNREST_SUPPORT } from '../game/cityAspects.js';
import type { City, CityEventKind, Language } from '../game/types.js';
import type { DistrictId } from './city/cityLayout.js';

/** Words for the things that befall a city, shared by the city view, the map and the realm table. */
export const EVENT_TEXT: Record<
  CityEventKind,
  {
    /** One character for the map plaque and the realm table. */
    seal: string;
    name: { en: string; zh: string };
    effect: { en: string; zh: string };
    /** The part of the city where it shows most. */
    district: DistrictId;
    good: boolean;
  }
> = {
  harvest: {
    seal: '丰',
    name: { en: 'Bumper harvest', zh: '五谷丰登' },
    effect: { en: 'Half as much grain again from this city.', zh: '此城粮入增五成。' },
    district: 'fields',
    good: true,
  },
  flood: {
    seal: '洪',
    name: { en: 'Flood', zh: '水患' },
    effect: { en: 'The fields are under water: this city’s grain is halved.', zh: '田亩被淹：此城粮入减半。' },
    district: 'fields',
    good: false,
  },
  drought: {
    seal: '旱',
    name: { en: 'Drought', zh: '大旱' },
    effect: { en: 'The fields are parched: this city gives six tenths of its grain.', zh: '禾苗枯槁：此城粮入仅余六成。' },
    district: 'fields',
    good: false,
  },
  fair: {
    seal: '市',
    name: { en: 'Merchants’ fair', zh: '商旅云集' },
    effect: { en: 'Four tenths more gold from this city.', zh: '此城金入增四成。' },
    district: 'market',
    good: true,
  },
  plague: {
    seal: '疫',
    name: { en: 'Plague', zh: '疫病' },
    effect: { en: 'Sickness has thinned the garrison and frightened the people.', zh: '疫病折损守军，民心惶惶。' },
    district: 'barracks',
    good: false,
  },
  riot: {
    seal: '乱',
    name: { en: 'Riot', zh: '民变' },
    effect: {
      en: 'This city’s gold is halved, and the governor’s works stand still unless set to the people.',
      zh: '此城金入减半；太守除抚民之外诸务停顿。',
    },
    district: 'hall',
    good: false,
  },
};

/** "2 more seasons" / "this season only". */
export function eventLasts(seasonsLeft: number, lang: Language): string {
  if (lang === 'zh') return seasonsLeft > 1 ? `尚余 ${seasonsLeft} 季` : '仅本季';
  return seasonsLeft > 1 ? `${seasonsLeft} more seasons` : 'this season only';
}

/** The one mark a city carries on the map and in lists: its event, or unrest among its people. */
export function cityMarkOf(
  city: City,
  lang: Language
): { seal: string; title: string; good: boolean } | null {
  if (city.event) {
    const text = EVENT_TEXT[city.event.kind];
    return {
      seal: text.seal,
      title: `${lang === 'zh' ? text.name.zh : text.name.en} · ${eventLasts(city.event.seasonsLeft, lang)}`,
      good: text.good,
    };
  }
  if (city.owner !== 'neutral' && city.support < UNREST_SUPPORT) {
    return {
      seal: '怨',
      title: lang === 'zh' ? `民心动荡（${city.support}）` : `Unrest (support ${city.support})`,
      good: false,
    };
  }
  return null;
}

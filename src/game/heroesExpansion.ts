import type {
  DuelStance,
  FactionId,
  General,
  HeroArchetype,
  HeroSkillEffect,
  LocalizedText,
  TacticId,
} from './types.js';

/**
 * The commanders who held the cities added with the 32-city map, so that every city opens with a
 * named general behind its walls. All are drawn from the Records and the Romance of the Three
 * Kingdoms and placed where the books put them; the dossiers say where the 214 AD setting takes a
 * liberty. The four free cities have lords of their own (faction `neutral`, status `active`).
 */

type Loc = [en: string, zh: string];

interface HeroSeed {
  id: string;
  name: Loc;
  title: Loc;
  faction: FactionId;
  archetype: HeroArchetype;
  /** war, intellect, command, politics, charisma */
  stats: [number, number, number, number, number];
  specialty: TacticId;
  cityId: string;
  seal: string;
  loyalty: number;
  skill: {
    id: string;
    name: Loc;
    desc: Loc;
    cry: Loc;
    effect: HeroSkillEffect;
    power: number;
    duel: number;
  };
  strength: Loc;
  flaw: Loc;
  destiny: Loc;
  weakTo: TacticId;
  counter: Exclude<DuelStance, 'skill' | 'chrono_counter'>;
  hook: Loc;
}

const loc = ([en, zh]: Loc): LocalizedText => ({ en, zh });

const SEEDS: HeroSeed[] = [
  // ===================== WEI (8) =====================
  {
    id: 'caoren',
    name: ['Cao Ren', '曹仁'],
    title: ['Iron Wall of Fancheng', '天人将军 · 樊城铁壁'],
    faction: 'wei',
    archetype: 'marshal',
    stats: [88, 76, 93, 70, 80],
    specialty: 'siege',
    cityId: 'xiangyang',
    seal: '仁',
    loyalty: 96,
    skill: {
      id: 'eight_gates_lock',
      name: ['Eight Gates Golden Lock', '八门金锁阵'],
      desc: ['Locks the line in eight gates: -28% losses for his army.', '布八门金锁之阵，我军战损 -28%。'],
      cry: ['Eight gates, one lock. Find the gate of life, if you can!', '八门金锁，生门何在？有胆便来闯阵！'],
      effect: 'casualty_shield',
      power: 0.2,
      duel: 28,
    },
    strength: [
      'Held Jiangling for a year against Zhou Yu and Fancheng through Guan Yu’s flood; his own officers called him a man of heaven.',
      '守江陵拒周瑜经年，樊城水淹而不降，麾下叹为“天人”。',
    ],
    flaw: [
      'Trusts walls and drilled formations; in the Romance Xu Shu reads his Eight Gates array at a glance and Xinye burns behind him.',
      '倚重坚城与阵法，演义中八门金锁被徐庶一眼看破，又遭新野火攻。',
    ],
    destiny: [
      'Historically dies in 223 AD as Grand Marshal of Wei, never having lost the city he was told to hold.',
      '正史黄初四年（223年）卒于大司马任上，受命守城未尝失陷。',
    ],
    weakTo: 'fire',
    counter: 'feint',
    hook: [
      'Speak to him of duty to the clan and of soldiers brought home alive; he despises men who abandon a post.',
      '以宗族之责与全军生还相说，他最鄙弃守之将。',
    ],
  },
  {
    id: 'xiahouyuan',
    name: ['Xiahou Yuan', '夏侯渊'],
    title: ['Swift Marshal of the West', '虎步关右 · 疾行将军'],
    faction: 'wei',
    archetype: 'vanguard',
    stats: [92, 66, 90, 58, 78],
    specialty: 'assault',
    cityId: 'tianshui',
    seal: '渊',
    loyalty: 95,
    skill: {
      id: 'thousand_li_march',
      name: ['Five Hundred Li in Three Days', '三日五百里'],
      desc: ['Forced march strikes before the enemy forms up: +22% assault power.', '兼程奔袭，趁敌未及列阵：突击战力 +22%。'],
      cry: ['Three days, five hundred li. Six days, a thousand. You are already too late!', '三日五百，六日一千！尔等已然迟了！'],
      effect: 'assault_boost',
      power: 0.22,
      duel: 32,
    },
    strength: [
      'The fastest marcher of the age; in 214 he broke Ma Chao, Han Sui and Song Jian and brought all Liang to heel.',
      '用兵神速冠绝一时，建安十九年连破马超、韩遂、宋建，平定凉州。',
    ],
    flaw: [
      'Relies on courage alone. Cao Cao warned him that a commander must sometimes know fear.',
      '恃勇轻进，曹操曾诫之：“为将当有怯弱时，不可但恃勇也。”',
    ],
    destiny: [
      'Historically cut down at Mount Dingjun in 219 AD by Huang Zhong while mending a palisade with a handful of men.',
      '正史建安二十四年（219年）于定军山修补鹿角时为黄忠所斩。',
    ],
    weakTo: 'ambush',
    counter: 'guard',
    hook: [
      'Challenge his speed with a harder target; warn him of Dingjun and he will listen to no one but his cousin Cao Cao.',
      '以更难的奔袭相激；若言及定军山之厄，唯曹操之言他肯听。',
    ],
  },
  {
    id: 'caohong',
    name: ['Cao Hong', '曹洪'],
    title: ['He Who Gave Up His Horse', '舍马救主'],
    faction: 'wei',
    archetype: 'vanguard',
    stats: [84, 60, 80, 62, 66],
    specialty: 'assault',
    cityId: 'tongguan',
    seal: '洪',
    loyalty: 97,
    skill: {
      id: 'realm_can_lose_me',
      name: ['The Realm Can Spare Me', '天下可无洪'],
      desc: ['Throws himself between his lord and the enemy: -24% losses.', '舍身护主断后，我军战损 -24%。'],
      cry: ['The realm can do without Hong. It cannot do without you. Take my horse!', '天下可无洪，不可无君！请上马！'],
      effect: 'casualty_shield',
      power: 0.16,
      duel: 26,
    },
    strength: [
      'At Xingyang he gave Cao Cao his own horse and ran beside it through the pursuit; raised a thousand household troops for the cause.',
      '荥阳之败让马于曹操，步从突围；又倾家财募兵千余相助。',
    ],
    flaw: [
      'Hot-tempered and tight-fisted. In the Romance nine days of insults from Ma Chao’s men draw him out of Tong Pass and the pass is lost.',
      '性急而吝财。演义中受马超军辱骂九日，愤而出关，潼关遂失。',
    ],
    destiny: [
      'Historically nearly executed by Cao Pi over an old refused loan; dies in 232 AD.',
      '正史因昔日拒贷之怨险为曹丕所诛，太和六年（232年）卒。',
    ],
    weakTo: 'ambush',
    counter: 'feint',
    hook: [
      'Honour the day at Xingyang and never mention money; goad him and he will fight where you want him to.',
      '敬其荥阳之功，莫谈钱财；激之则必出战。',
    ],
  },
  {
    id: 'caozhang',
    name: ['Cao Zhang', '曹彰'],
    title: ['The Yellow-Bearded Prince', '黄须儿'],
    faction: 'wei',
    archetype: 'vanguard',
    stats: [93, 52, 84, 46, 74],
    specialty: 'assault',
    cityId: 'jinyang',
    seal: '彰',
    loyalty: 92,
    skill: {
      id: 'yellow_beard_charge',
      name: ['Yellow Beard Breaks the Raiders', '黄须破虏'],
      desc: ['Leads the pursuit in person: +20% assault power.', '亲率铁骑穷追：突击战力 +20%。'],
      cry: ['A man should ride like Wei Qing and Huo Qubing, not sit over books!', '大丈夫当学卫青、霍去病，立功沙漠，何能作博士邪！'],
      effect: 'assault_boost',
      power: 0.2,
      duel: 34,
    },
    strength: [
      'Wrestled wild beasts bare-handed; in 218 he chased the Wuhuan of Dai for a day and a night with arrows standing in his armour.',
      '手格猛兽；建安二十三年讨代郡乌桓，铠中数箭犹追奔一日一夜。',
    ],
    flaw: [
      'Scorns books and counsel; outruns his own supply train.',
      '轻书策、少谋略，追敌往往逾越粮道。',
    ],
    destiny: [
      'Historically dies suddenly in his Luoyang residence in 223 AD while attending court.',
      '正史黄初四年（223年）朝京师，暴薨于洛阳邸。',
    ],
    weakTo: 'ambush',
    counter: 'feint',
    hook: [
      'Offer him a frontier and an enemy worth the ride; talk of scholarship bores him.',
      '许以边塞与劲敌即可，与他谈经论学只会令其生厌。',
    ],
  },
  {
    id: 'yujin',
    name: ['Yu Jin', '于禁'],
    title: ['Unbending Discipline', '毅重持军'],
    faction: 'wei',
    archetype: 'marshal',
    stats: [80, 74, 90, 66, 62],
    specialty: 'siege',
    cityId: 'beihai',
    seal: '禁',
    loyalty: 82,
    skill: {
      id: 'orders_like_mountains',
      name: ['Orders Like Mountains', '军令如山'],
      desc: ['Ranks hold under any pressure: -25% losses.', '行伍整肃，临乱不溃：我军战损 -25%。'],
      cry: ['Dress the ranks. The law of the camp does not bend for friend or foe!', '整队立营！军法在此，不避亲疏！'],
      effect: 'casualty_shield',
      power: 0.18,
      duel: 24,
    },
    strength: [
      'Kept his column in order through the rout at Wancheng and built his camp before reporting; the strictest of the Five Elite Generals.',
      '宛城之败独整军而还，先立营垒后谒主，五子良将中持军最严。',
    ],
    flaw: [
      'Feared more than loved by his men; when the autumn flood drowned his seven armies at Fancheng he gave himself up to Guan Yu.',
      '御下过严，不得众心；樊城秋水淹七军，遂降关羽。',
    ],
    destiny: [
      'Historically surrenders in 219 AD, returns to Wei in 221 and dies of shame before a mural of his own surrender.',
      '正史建安二十四年降关羽，黄初二年归魏，见陵屋画己降状，惭恚而卒。',
    ],
    weakTo: 'siege',
    counter: 'strike',
    hook: [
      'Thirty years of service against one bad day: tell him how the histories will remember it and he will fight to change the page.',
      '三十年功名毁于一旦，告以青史如何落笔，他必愿改写此页。',
    ],
  },
  {
    id: 'yuejin',
    name: ['Yue Jin', '乐进'],
    title: ['First Over the Wall', '先登骁果'],
    faction: 'wei',
    archetype: 'vanguard',
    stats: [87, 62, 84, 54, 70],
    specialty: 'siege',
    cityId: 'puyang',
    seal: '进',
    loyalty: 94,
    skill: {
      id: 'first_to_scale',
      name: ['First to Scale', '先登陷阵'],
      desc: ['Leads the ladders himself: +20% power and walls count for less.', '亲冒矢石先登：战力 +20%，削弱城防。'],
      cry: ['Ladders up! The first man on that wall will be me!', '云梯搭上！先登此城者，必是乐进！'],
      effect: 'siege_breaker',
      power: 0.2,
      duel: 30,
    },
    strength: [
      'Small of body and fierce of heart; first over the wall at Puyang against Lü Bu and at Yongqiu against Zhang Chao.',
      '容貌短小而胆烈过人，濮阳战吕布、雍丘讨张超皆先登有功。',
    ],
    flaw: [
      'Always at the very front, where a single arrow can end a campaign.',
      '每战必居最前，一矢之危足以倾覆全局。',
    ],
    destiny: [
      'Historically holds Hefei with Zhang Liao and Li Dian in 215 and dies in 218 AD.',
      '正史建安二十年与张辽、李典共守合肥，二十三年（218年）卒。',
    ],
    weakTo: 'ambush',
    counter: 'guard',
    hook: [
      'Give him the hardest wall and the first ladder; he asks for nothing else.',
      '予其最坚之城与第一架云梯，别无所求。',
    ],
  },
  {
    id: 'zangba',
    name: ['Zang Ba', '臧霸'],
    title: ['Lord of the Eastern Marches', '威震青徐'],
    faction: 'wei',
    archetype: 'marshal',
    stats: [86, 68, 85, 64, 78],
    specialty: 'ambush',
    cityId: 'xiapi',
    seal: '霸',
    loyalty: 78,
    skill: {
      id: 'taishan_raiders',
      name: ['Raiders of Mount Tai', '泰山豪侠'],
      desc: ['His hill riders strip the enemy’s baggage: +18% raid power and plunder.', '泰山骑众劫掠辎重：奇袭战力 +18%，并夺粮秣。'],
      cry: ['Sons of Mount Tai! Their grain is ours before the drums stop!', '泰山儿郎！鼓声未歇，粮草已归我有！'],
      effect: 'raid_plunder',
      power: 0.18,
      duel: 28,
    },
    strength: [
      'Broke his father out of custody at eighteen, then ruled the coast from Langya; Cao Cao entrusted him with all of Qing and Xu.',
      '十八岁劫囚救父，后据琅邪称雄海岱，曹操尽以青、徐二州相委。',
    ],
    flaw: [
      'A warlord in all but name who once stood with Lü Bu at Xiapi; the court never fully trusts him, nor he the court.',
      '实为一方豪帅，曾助吕布守下邳；朝廷终不尽信之，他亦然。',
    ],
    destiny: [
      'Historically stripped of his army by Cao Pi and kept at court as an honoured guest until his death.',
      '正史为曹丕夺其兵权，留居朝中优礼以终。',
    ],
    weakTo: 'siege',
    counter: 'strike',
    hook: [
      'Promise that his men and his coast stay his; threaten either and he remembers he was once Lü Bu’s ally.',
      '许其部曲与海岱之地如故；若相逼迫，他便记起曾为吕布之盟。',
    ],
  },
  {
    id: 'wenpin',
    name: ['Wen Pin', '文聘'],
    title: ['Shield of the Han River', '江汉屏藩'],
    faction: 'wei',
    archetype: 'marshal',
    stats: [84, 70, 86, 66, 76],
    specialty: 'siege',
    cityId: 'wan',
    seal: '聘',
    loyalty: 88,
    skill: {
      id: 'still_as_stone',
      name: ['Still as Stone', '石阳不动'],
      desc: ['Hides his strength and lets the enemy doubt: -25% losses.', '潜默示虚，使敌生疑：我军战损 -25%。'],
      cry: ['Close the gates and make no sound. Let them wonder what waits inside.', '闭门息鼓，敢有喧哗者斩！且看来敌疑是不疑。'],
      effect: 'casualty_shield',
      power: 0.18,
      duel: 26,
    },
    strength: [
      'A son of Wan who guarded the river frontier for decades; at Shiyang he faced Sun Quan’s fifty thousand behind rain-broken walls and never stirred.',
      '南阳宛人，镇守江汉数十年；石阳城栅为雨所坏，孙权五万众至，偃卧不动而退之。',
    ],
    flaw: [
      'Wept when Jing Province surrendered and still carries the shame of serving a second lord.',
      '荆州降曹时流涕自责，事二主之愧终身未释。',
    ],
    destiny: [
      'Historically holds Jiangxia for Wei until his death, feared along the whole river.',
      '正史镇江夏至卒，威恩著于江表。',
    ],
    weakTo: 'fire',
    counter: 'feint',
    hook: [
      'He asks only to keep a frontier whole. Show him a cause that protects the people of Jing.',
      '但求保境全土；示以安荆楚百姓之志，方能动之。',
    ],
  },

  // ===================== SHU (4) =====================
  {
    id: 'yanyan',
    name: ['Yan Yan', '严颜'],
    title: ['The General Who Would Not Kneel', '断头将军'],
    faction: 'shu',
    archetype: 'vanguard',
    stats: [84, 68, 82, 66, 78],
    specialty: 'ambush',
    cityId: 'jiangzhou',
    seal: '颜',
    loyalty: 80,
    skill: {
      id: 'head_may_fall',
      name: ['A Head May Fall', '断头不降'],
      desc: ['Old soldiers stand because he stands: -24% losses.', '老将不退，士卒不溃：我军战损 -24%。'],
      cry: ['This province has generals who lose their heads. It has none who kneel!', '我州但有断头将军，无有降将军也！'],
      effect: 'casualty_shield',
      power: 0.17,
      duel: 28,
    },
    strength: [
      'Warden of Ba for Liu Zhang; taken at Jiangzhou, he answered Zhang Fei’s rage so calmly that Zhang Fei untied him and seated him as a guest.',
      '刘璋麾下巴郡太守；江州被擒，面对张飞怒喝神色不变，张飞壮而释之，引为宾客。',
    ],
    flaw: [
      'Too proud to stay behind his walls when baited; a false night march drew him out of Jiangzhou.',
      '性刚不耐挑激，演义中为张飞假道夜行之计诱出江州。',
    ],
    destiny: [
      'The Records fall silent after his capture in 214; the Romance has him open the passes of Ba to Liu Bei.',
      '正史自建安十九年被擒后不复见载；演义言其为刘备招降巴郡诸关。',
    ],
    weakTo: 'ambush',
    counter: 'guard',
    hook: [
      'Do not threaten him. Treat an old soldier with courtesy and he will repay it with every pass in Ba.',
      '切勿以威相逼；以礼待老将，他必以巴郡诸关相报。',
    ],
  },
  {
    id: 'liyan',
    name: ['Li Yan', '李严'],
    title: ['Warden of the Eastern Gate', '永安都护'],
    faction: 'shu',
    archetype: 'marshal',
    stats: [80, 84, 85, 86, 70],
    specialty: 'siege',
    cityId: 'yongan',
    seal: '严',
    loyalty: 76,
    skill: {
      id: 'baidi_bastion',
      name: ['Bastion of Baidi', '白帝坚城'],
      desc: ['Gorge walls and full granaries: -22% losses.', '据峡口坚城、积谷为守：我军战损 -22%。'],
      cry: ['The river narrows here, and so does your luck. Hold the gorge!', '江至此而狭，尔等气数亦至此而尽！守住峡口！'],
      effect: 'casualty_shield',
      power: 0.16,
      duel: 24,
    },
    strength: [
      'Able in office and in the field: put down the Ma Qin rising with five thousand commandery troops and was named co-regent beside Zhuge Liang.',
      '吏能与将略兼备，以郡兵五千平马秦、高胜之乱，后与诸葛亮并受遗诏辅政。',
    ],
    flaw: [
      'Looks first to his own standing; in 231 he let the grain fail, lied about it to both army and court, and was struck from the rolls.',
      '营私自重；建兴九年运粮不继，又两头欺瞒，终被废为庶人。',
    ],
    destiny: [
      'Historically dies in 234 AD of grief on hearing Zhuge Liang is dead, knowing no one else would ever recall him.',
      '正史建兴十二年（234年）闻诸葛亮卒，知复用无望，发病而死。',
    ],
    weakTo: 'ambush',
    counter: 'strike',
    hook: [
      'Rank and a command of his own move him more than oaths; keep the grain accounts where you can see them.',
      '位号与独当一面之权最能动其心；粮簿须亲自过目。',
    ],
  },
  {
    id: 'huojun',
    name: ['Huo Jun', '霍峻'],
    title: ['Keeper of Jiameng Pass', '葭萌孤守'],
    faction: 'shu',
    archetype: 'marshal',
    stats: [80, 78, 86, 72, 76],
    specialty: 'ambush',
    cityId: 'jiange',
    seal: '峻',
    loyalty: 95,
    skill: {
      id: 'year_with_hundreds',
      name: ['A Year with a Few Hundred', '数百守一年'],
      desc: ['Waits for the besiegers to slacken, then sallies: turns enemy ambushes and +20% power.', '伺敌懈怠而出击：反制敌军奇谋，战力 +20%。'],
      cry: ['You may have my head. You will not have this pass!', '小人头可得，城不可得！'],
      effect: 'ambush_reflect',
      power: 0.2,
      duel: 26,
    },
    strength: [
      'Held Jiameng for a year with a few hundred men against ten thousand, then picked his best and cut down the enemy commander Xiang Cun.',
      '以数百人守葭萌拒万余众经年，后选精锐出击，斩敌将向存。',
    ],
    flaw: [
      'Never given an army to match his skill; a garrison this small cannot afford one mistake.',
      '才堪大任而兵微将寡，孤城之守容不得一失。',
    ],
    destiny: [
      'Historically dies in office around 217 AD at forty; Liu Bei led the whole court to his funeral.',
      '正史约建安二十二年卒于梓潼太守任上，年四十，刘备亲率群僚临丧。',
    ],
    weakTo: 'fire',
    counter: 'feint',
    hook: [
      'He turned down Zhang Lu’s offer to "help" defend the pass. Flattery will not open a gate he has sworn to keep.',
      '张鲁诱以共守，他一言拒之；誓守之关，非甘言可开。',
    ],
  },
  {
    id: 'liaohua',
    name: ['Liao Hua', '廖化'],
    title: ['Vanguard to the Last', '蜀中先锋'],
    faction: 'shu',
    archetype: 'vanguard',
    stats: [82, 66, 80, 60, 76],
    specialty: 'assault',
    cityId: 'wuling',
    seal: '化',
    loyalty: 96,
    skill: {
      id: 'long_road_home',
      name: ['The Long Road Home', '诈死归汉'],
      desc: ['Slips every net and rallies the stragglers: -22% losses.', '屡脱罗网，收拢散卒：我军战损 -22%。'],
      cry: ['I walked back from the dead to serve this banner. Follow me!', '某诈死千里来归，只为此旗！随我来！'],
      effect: 'casualty_shield',
      power: 0.15,
      duel: 26,
    },
    strength: [
      'Guan Yu’s registrar in Jing. Cut off in Wu after Guan Yu fell, he feigned death and carried his old mother west to rejoin Liu Bei.',
      '关羽帐下主簿；荆州陷后身陷东吴，诈死携老母昼夜西行，终归刘备。',
    ],
    flaw: [
      'Brave and tireless but no great captain; the proverb says Shu had run out of generals when Liao Hua led the van.',
      '勇而无大略，俗谚云“蜀中无大将，廖化作先锋”。',
    ],
    destiny: [
      'Historically serves until Shu falls in 263 and dies the next year on the road to Luoyang, past seventy.',
      '正史仕蜀至景耀六年国亡，次年内徙洛阳途中病卒，年逾七十。',
    ],
    weakTo: 'ambush',
    counter: 'guard',
    hook: [
      'His loyalty is to the house of Han and to Guan Yu’s memory; no price has ever been found for it.',
      '一心只在汉室与关公旧恩，从无可动摇之价。',
    ],
  },

  // ===================== WU (3) =====================
  {
    id: 'chengpu',
    name: ['Cheng Pu', '程普'],
    title: ['Elder Lord Cheng', '程公 · 三世宿将'],
    faction: 'wu',
    archetype: 'marshal',
    stats: [84, 78, 88, 72, 84],
    specialty: 'fire',
    cityId: 'jiangxia',
    seal: '普',
    loyalty: 94,
    skill: {
      id: 'iron_spine_spear',
      name: ['Iron-Spine Serpent Spear', '铁脊蛇矛'],
      desc: ['The oldest blade of Jiangdong leads the line: +18% assault power.', '江东第一宿将亲当锋镝：突击战力 +18%。'],
      cry: ['I rode with Sun Jian before you were born. Stand aside or fall!', '老夫随破虏将军征战时，尔等尚未出世！挡我者死！'],
      effect: 'assault_boost',
      power: 0.18,
      duel: 28,
    },
    strength: [
      'Served Sun Jian, Sun Ce and Sun Quan; shared command with Zhou Yu at Red Cliffs and then governed Jiangxia.',
      '历事孙坚、孙策、孙权三世，赤壁与周瑜分任左右督，后领江夏太守。',
    ],
    flaw: [
      'Jealous of his seniority; he slighted the young Zhou Yu for years before admitting he had been wrong.',
      '自恃年长资深，屡陵侮周瑜，久而方自愧服。',
    ],
    destiny: [
      'Historically dies a few years after Red Cliffs, the most senior of the generals south of the river.',
      '正史赤壁后数年病卒，为江表诸将之长。',
    ],
    weakTo: 'ambush',
    counter: 'feint',
    hook: [
      'Call him Lord Cheng and ask his counsel first. He said of Zhou Yu that friendship with him was like rich wine.',
      '尊称“程公”而先问其计；他曾言与周公瑾交，如饮醇醪，不觉自醉。',
    ],
  },
  {
    id: 'lingtong',
    name: ['Ling Tong', '凌统'],
    title: ['The Avenging Son', '国士之风'],
    faction: 'wu',
    archetype: 'vanguard',
    stats: [89, 70, 84, 60, 82],
    specialty: 'assault',
    cityId: 'wu',
    seal: '统',
    loyalty: 93,
    skill: {
      id: 'ford_rearguard',
      name: ['Rearguard at the Ford', '逍遥津死战'],
      desc: ['Three hundred hold the bridge so the army can cross: -28% losses.', '率亲兵三百死战断后：我军战损 -28%。'],
      cry: ['Three hundred of us, and my lord is not yet across. No one falls back!', '主公未渡，三百亲卫谁敢后退！随我死战！'],
      effect: 'casualty_shield',
      power: 0.2,
      duel: 30,
    },
    strength: [
      'Took over his father’s command at fifteen. At Xiaoyao Ford he held the broken bridge until Sun Quan was safe and swam home alone, the last of three hundred.',
      '十五岁代父领兵；逍遥津扼断桥死战，护孙权脱险，三百亲兵尽没，独被甲潜行而还。',
    ],
    flaw: [
      'His father Ling Cao died by Gan Ning’s arrow. Put the two in one hall and swords come out.',
      '父凌操死于甘宁箭下，二人同席即拔刀相向。',
    ],
    destiny: [
      'Historically dies young of illness; Sun Quan wept for days and raised his sons in the palace.',
      '正史早卒于病，孙权哀不能止，养其二子于宫中。',
    ],
    weakTo: 'ambush',
    counter: 'strike',
    hook: [
      'He honours scholars and gives away his pay. Never ask him to serve beside Gan Ning without settling the blood debt first.',
      '亲贤礼士、轻财重义；若要他与甘宁共事，须先解杀父之仇。',
    ],
  },
  {
    id: 'heqi',
    name: ['He Qi', '贺齐'],
    title: ['Tamer of the Hill Tribes', '平越将军'],
    faction: 'wu',
    archetype: 'marshal',
    stats: [85, 76, 87, 70, 74],
    specialty: 'ambush',
    cityId: 'kuaiji',
    seal: '齐',
    loyalty: 90,
    skill: {
      id: 'iron_pitons',
      name: ['Iron Pitons Up the Cliff', '铁戈攀崖'],
      desc: ['Climbers scale the blind side by night: +20% power and walls count for less.', '募轻捷士卒夜攀绝壁：战力 +20%，削弱城防。'],
      cry: ['Drive the spikes and climb. When the drums sound from above, the hill is ours!', '以铁戈凿山而上！山顶鼓角一鸣，此寨即破！'],
      effect: 'siege_breaker',
      power: 0.2,
      duel: 28,
    },
    strength: [
      'A son of Kuaiji who spent twenty years subduing the Shanyue from Jian’an to Danyang; at Linli Mountain his men climbed a sheer cliff on iron spikes.',
      '会稽山阴人，二十年间自建安至丹阳讨平山越；林历山之战凿铁戈攀绝壁破敌。',
    ],
    flaw: [
      'Loves splendour: gilded arms, carved ships, crimson sails. It marks him out on any battlefield.',
      '性奢绮，兵甲器械极尽精好，船舰雕镂丹漆，战场上一望即知。',
    ],
    destiny: [
      'Historically dies in 227 AD after a lifetime on Wu’s southern and eastern marches.',
      '正史黄武六年（227年）卒，毕生经略东南。',
    ],
    weakTo: 'fire',
    counter: 'feint',
    hook: [
      'Praise the fleet before the man; then offer him rough country that no one else can pacify.',
      '先赞其舟舰之盛，再许以无人能平的险地。',
    ],
  },

  // ===================== LORDS OF THE FREE CITIES (4) =====================
  {
    id: 'hansui',
    name: ['Han Sui', '韩遂'],
    title: ['Old Fox of Liang', '西州老狐'],
    faction: 'neutral',
    archetype: 'marshal',
    stats: [78, 84, 86, 72, 80],
    specialty: 'ambush',
    cityId: 'wuwei',
    seal: '遂',
    loyalty: 70,
    skill: {
      id: 'thirty_years_rebel',
      name: ['Thirty Years a Rebel', '关西联军'],
      desc: ['Qiang riders harry the supply lines: +18% raid power and plunder.', '羌胡骑众袭扰粮道：奇袭战力 +18%，并夺粮秣。'],
      cry: ['I have outlived three emperors’ armies in these hills. Ride them down!', '老夫纵横西州三十年，三朝王师奈我不得！冲！'],
      effect: 'raid_plunder',
      power: 0.18,
      duel: 24,
    },
    strength: [
      'In arms against the throne since 184; the Qiang and Hu of the west follow him, and no one knows the roads of Liang better.',
      '自中平元年举兵，三十余年不灭，羌胡归心，凉州道路无人更熟。',
    ],
    flaw: [
      'Trusts no ally for long. At Tong Pass one blotted letter from Cao Cao was enough to turn Ma Chao against him.',
      '盟友难久；潼关之战曹操一纸涂抹之书，便令马超与之反目。',
    ],
    destiny: [
      'Historically beaten by Xiahou Yuan in 214 and killed by his own officers the next year, past seventy.',
      '正史建安十九年为夏侯渊所破，次年为部将所杀，年七十余。',
    ],
    weakTo: 'ambush',
    counter: 'guard',
    hook: [
      'He wants to die in his own bed in the west. Guarantee Liang and he will hear you; mention hostages and he is gone.',
      '但求终老西州；保其凉州则可谈，言及质子则立去。',
    ],
  },
  {
    id: 'mengda',
    name: ['Meng Da', '孟达'],
    title: ['Turncoat of Shangyong', '反复之臣'],
    faction: 'neutral',
    archetype: 'marshal',
    stats: [78, 82, 80, 74, 80],
    specialty: 'ambush',
    cityId: 'shangyong',
    seal: '达',
    loyalty: 55,
    skill: {
      id: 'banner_overnight',
      name: ['A New Banner by Morning', '易帜新城'],
      desc: ['Feigns one loyalty and strikes from another: turns enemy ambushes and +16% power.', '首鼠两端，反戈一击：反制敌军奇谋，战力 +16%。'],
      cry: ['Which banner flies over Shangyong today? You will learn when the gates open!', '上庸城头今日悬谁家旗号？开门之时自见分晓！'],
      effect: 'ambush_reflect',
      power: 0.16,
      duel: 24,
    },
    strength: [
      'Handsome, eloquent and a capable soldier; holds the mountain roads between Hanzhong and the Han River, which every side needs.',
      '姿才秀出、能言善战，据汉中与汉水间山道要冲，三方皆欲得之。',
    ],
    flaw: [
      'Has served Liu Zhang, Liu Bei and Wei, and trusts that distance will give him time to change again. Sima Yi covered twelve hundred li in eight days to prove him wrong.',
      '历事刘璋、刘备、曹魏，自恃地远可从容反复；司马懿八日行千二百里，破其所恃。',
    ],
    destiny: [
      'Historically takes Shangyong for Shu in 219, defects to Wei in 220, plots to return in 227 and is beheaded by Sima Yi in 228.',
      '正史建安二十四年取上庸，次年降魏，太和元年谋归蜀，二年为司马懿所斩。',
    ],
    weakTo: 'assault',
    counter: 'strike',
    hook: [
      'He weighs every offer against the next. Strike before he finishes writing letters to all three courts.',
      '凡有所许必待价而沽；当趁其三面通书未定之时急取之。',
    ],
  },
  {
    id: 'menghuo',
    name: ['Meng Huo', '孟获'],
    title: ['King of Nanzhong', '南中蛮王'],
    faction: 'neutral',
    archetype: 'vanguard',
    stats: [91, 48, 82, 50, 84],
    specialty: 'ambush',
    cityId: 'jianning',
    seal: '获',
    loyalty: 72,
    skill: {
      id: 'seven_times_unbowed',
      name: ['Seven Times Unbowed', '七擒不服'],
      desc: ['The hill tribes rise behind him again: +20% assault power.', '洞主蛮兵再度云集：突击战力 +20%。'],
      cry: ['Caught by a trick is not beaten! Let me go and I will fight you again!', '中汝诡计，非战之罪！放我回去，再决雌雄！'],
      effect: 'assault_boost',
      power: 0.2,
      duel: 32,
    },
    strength: [
      'Trusted by Han settlers and hill peoples alike across Nanzhong; knows every poison spring and river crossing of the south.',
      '为南中夷汉所共服，泸水毒泉、山川险隘无不谙熟。',
    ],
    flaw: [
      'Walks into the same trap again and again; in the Romance his rattan-armoured allies burn to a man in Coiled Serpent Valley.',
      '屡中同一计而不悟；演义中所倚藤甲军于盘蛇谷尽遭火焚。',
    ],
    destiny: [
      'In 225 AD Zhuge Liang captures and frees him seven times, until he swears the south will never rebel again.',
      '建兴三年诸葛亮七纵七擒，终叹曰：“公，天威也，南人不复反矣。”',
    ],
    weakTo: 'fire',
    counter: 'feint',
    hook: [
      'Force wins the hills for a season. Beat him fairly and let him go, and he will hold the south for you for life.',
      '以力服之不过一时；堂堂胜之而后纵之，则终身为我守南疆。',
    ],
  },
  {
    id: 'yanbaihu',
    name: ['Yan Baihu', '严白虎'],
    title: ['White Tiger of the Eastern Hills', '东吴德王'],
    faction: 'neutral',
    archetype: 'vanguard',
    stats: [78, 52, 74, 44, 68],
    specialty: 'ambush',
    cityId: 'jianan',
    seal: '虎',
    loyalty: 60,
    skill: {
      id: 'hill_bandit_swarm',
      name: ['Swarm of the Hill Bands', '山越啸聚'],
      desc: ['Bandits and Shanyue pour from the ravines: +15% raid power and plunder.', '山贼与山越自深谷蜂拥而出：奇袭战力 +15%，并夺粮秣。'],
      cry: ['These hills had a king before the Suns crossed the river. Take what they carry!', '孙氏未渡江时，此山早有其王！抢了他们的辎重！'],
      effect: 'raid_plunder',
      power: 0.15,
      duel: 24,
    },
    strength: [
      'Bandit chief of Wu commandery with ten thousand followers and a self-given royal title; at home in country no regular army wants to enter.',
      '吴郡豪帅，聚众万余，自号“东吴德王”，盘踞官军不愿深入之地。',
    ],
    flaw: [
      'A rabble, not an army: it scatters at the first hard blow and its king runs first.',
      '乌合之众，一触即溃，而其王先遁。',
    ],
    destiny: [
      'Historically routed by Sun Ce in 196 AD and dead as a fugitive soon after. In this timeline he survives in the hills of Jian’an among the Shanyue.',
      '正史建安元年为孙策所破，流亡而死；此间时空中他遁入建安山中，倚山越自存。',
    ],
    weakTo: 'assault',
    counter: 'strike',
    hook: [
      'He sued Sun Ce for peace as an equal and was laughed at. A title and a pardon cost less than a campaign in the hills.',
      '昔求与孙策平分江东而受辱；一纸官爵与赦令，较之入山征讨省费多矣。',
    ],
  },
];

function build(seed: HeroSeed): General {
  const [war, intellect, command, politics, charisma] = seed.stats;
  return {
    id: seed.id,
    name: loc(seed.name),
    title: loc(seed.title),
    faction: seed.faction,
    originalFaction: seed.faction,
    portrait: `/portraits/${seed.id}.jpg`,
    archetype: seed.archetype,
    war,
    intellect,
    command,
    politics,
    charisma,
    specialty: seed.specialty,
    cityId: seed.cityId,
    seal: seed.seal,
    level: 2,
    xp: 0,
    loyalty: seed.loyalty,
    status: 'active',
    woundedTurns: 0,
    skillCooldown: 0,
    vendettaAgainst: [],
    bondIds: [],
    signatureSkill: {
      id: seed.skill.id,
      name: loc(seed.skill.name),
      desc: loc(seed.skill.desc),
      battleCry: loc(seed.skill.cry),
      effect: seed.skill.effect,
      powerBonus: seed.skill.power,
      duelDamage: seed.skill.duel,
      cooldownTurns: 2,
    },
    dossier: {
      historicalStrength: loc(seed.strength),
      fatalFlaw: loc(seed.flaw),
      fatedDestiny: loc(seed.destiny),
      weakToTactic: seed.weakTo,
      counterStance: seed.counter,
      persuasionHook: loc(seed.hook),
    },
  };
}

export const EXPANSION_HERO_IDS: readonly string[] = SEEDS.map((s) => s.id);

export function createExpansionHeroes(): Record<string, General> {
  return Object.fromEntries(SEEDS.map((seed) => [seed.id, build(seed)]));
}

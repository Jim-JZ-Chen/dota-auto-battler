// 全部数值表：英雄 / 装备 / 技能 / 怪物，数值参照 Dota2
export interface HeroDef {
  key: string; name: string; icon: string; desc: string;
  hp: number; atk: number; armor: number; atkInterval: number; // tick(0.1s) 一次攻击
  innate: string; // 固有被动 key，在 sim 中 switch 实现
}
// 计数器词条：让部分装备/技能有成长性。计数挂在槽位上，随物品移动/交换
export interface CounterDef {
  stat: 'atk' | 'maxHp' | 'armor' | 'skilldmg' | 'heal';
  per: number;          // 每次生效增加多少
  perN?: number;        // 每触发 N 次才生效一次（默认 1）
  mode: 'wave' | 'all'; // wave=每波开始复位；all=永久累积
  trigger: 'kill' | 'crit' | 'hitTaken' | 'cast' | 'skillkill' | 'waveEnd';
  label: string;        // UI 展示
}
export interface ItemDef {
  key: string; name: string; icon: string; price: number; desc: string;
  hp?: number; atk?: number; armor?: number; ias?: number; // ias: 攻速提升%
  crit?: number; dodge?: number; lifesteal?: number; regen?: number; // regen: HP/秒
  cleave?: number; thorns?: number; critMul?: number;
  counter?: CounterDef;
}
export interface SkillDef {
  key: string; name: string; icon: string; price: number; desc: string;
  cd: number; // tick，0 = 被动
  counter?: CounterDef;
}
export interface MobDef {
  key: string; name: string; icon: string;
  hp: number; atk: number; armor: number; atkInterval: number; bounty: number;
}

export const HEROES: HeroDef[] = [
  { key: 'axe',    name: '斧王',     icon: '🪓', desc: '反击螺旋：受击时20%几率反击周围敌人', hp: 900, atk: 52, armor: 6, atkInterval: 14, innate: 'helix' },
  { key: 'jugg',   name: '主宰',     icon: '⚔️', desc: '剑舞：暴击率+15%',                  hp: 700, atk: 60, armor: 4, atkInterval: 12, innate: 'bladedance' },
  { key: 'cm',     name: '水晶室女', icon: '❄️', desc: '奥术光环：全队技能冷却-20%',        hp: 520, atk: 44, armor: 2, atkInterval: 15, innate: 'aura' },
  { key: 'sniper', name: '狙击手',   icon: '🔫', desc: '爆头：暴击率+10%，暴击伤害2.2倍',    hp: 480, atk: 72, armor: 1, atkInterval: 13, innate: 'headshot' },
  { key: 'tide',   name: '潮汐猎人', icon: '🌊', desc: '海妖外壳：受到伤害减免15%',           hp: 1100, atk: 48, armor: 8, atkInterval: 16, innate: 'shell' },
  { key: 'lion',   name: '莱恩',     icon: '🧙', desc: '法力吸取：技能冷却-30%',              hp: 560, atk: 46, armor: 2, atkInterval: 15, innate: 'manadrain' },
  { key: 'pudge',  name: '帕吉',     icon: '🪝', desc: '腐肉堆积：生命上限+25%',              hp: 1000, atk: 50, armor: 4, atkInterval: 17, innate: 'flesh' },
  { key: 'dk',     name: '龙骑士',   icon: '🐉', desc: '龙族血统：每秒回复8点生命',           hp: 800, atk: 56, armor: 7, atkInterval: 14, innate: 'blood' },
  { key: 'wr',     name: '风行者',   icon: '🏹', desc: '疾风步：攻速+20%',                   hp: 600, atk: 54, armor: 3, atkInterval: 11, innate: 'windrun' },
  { key: 'sven',   name: '斯温',     icon: '💪', desc: '巨力挥舞：攻击25%分裂伤害',           hp: 780, atk: 64, armor: 5, atkInterval: 14, innate: 'cleave' },
];

export const ITEMS: ItemDef[] = [
  // —— 小件（前期过渡，都能往上合成）——
  { key: 'gloves',  name: '加速手套',   icon: '🧤', price: 300,  ias: 8, desc: '+8% 攻速' },
  { key: 'bracer',  name: '护腕',       icon: '🩹', price: 250,  hp: 60, atk: 3, desc: '+60 生命，+3 攻击' },
  { key: 'blight',  name: '枯萎之石',   icon: '🪨', price: 250,  atk: 4, desc: '+4 攻击力' },
  { key: 'band',    name: '力量腰带',   icon: '🎗️', price: 450,  hp: 120, desc: '+120 生命上限' },
  { key: 'buckler', name: '小圆盾',     icon: '🛞', price: 350,  armor: 2, desc: '+2 护甲' },
  { key: 'cloak',   name: '闪避斗篷',   icon: '🧥', price: 800,  dodge: 8, desc: '+8% 闪避' },
  // —— 基础件 ——
  { key: 'claw',    name: '攻击之爪',   icon: '🗡️', price: 450,  atk: 12, desc: '+12 攻击力', counter: { stat: 'atk', per: 2, mode: 'wave', trigger: 'kill', label: '嗜血：本波每击杀+2攻' } },
  { key: 'chain',   name: '锁子甲',     icon: '🦺', price: 550,  armor: 5, desc: '+5 护甲' },
  { key: 'ring',    name: '治疗指环',   icon: '💍', price: 850,  regen: 6, desc: '+6 生命回复/秒' },
  { key: 'vitality',name: '活力之球',   icon: '🔮', price: 1100, hp: 300, desc: '+300 生命上限', counter: { stat: 'maxHp', per: 50, mode: 'all', trigger: 'waveEnd', label: '成长：每波存活通关永久+50生命' } },
  { key: 'boots',   name: '动力鞋',     icon: '🥾', price: 1400, ias: 15, hp: 100, desc: '+15% 攻速，+100 生命' },
  // —— 中件 ——
  { key: 'sange',   name: '散华',       icon: '🌸', price: 2000, atk: 16, hp: 160, desc: '+16 攻击，+160 生命' },
  { key: 'vanguard',name: '先锋盾',     icon: '🛡️', price: 1900, hp: 250, armor: 2, regen: 4, desc: '+250 生命，+2 护甲，+4 回复/秒' },
  { key: 'maelstrom',name:'漩涡',       icon: '🌀', price: 2500, atk: 28, ias: 20, desc: '+28 攻击，+20% 攻速' },
  { key: 'crystalys',name:'水晶剑',     icon: '⚗️', price: 2100, atk: 32, crit: 10, desc: '+32 攻击，+10% 暴击', counter: { stat: 'atk', per: 1, mode: 'all', trigger: 'crit', label: '磨刀：每次暴击永久+1攻' } },
  { key: 'bfury',   name: '狂战斧',     icon: '🪓', price: 4200, atk: 60, cleave: 30, desc: '+60 攻击，30% 分裂伤害' },
  { key: 'bkb',     name: '黑皇杖',     icon: '🖤', price: 3900, atk: 20, hp: 250, desc: '+20 攻击，+250 生命' },
  { key: 'butterfly',name:'蝴蝶',       icon: '🦋', price: 5000, atk: 30, ias: 20, dodge: 25, desc: '+30 攻击，+20% 攻速，+25% 闪避' },
  { key: 'daedalus',name: '大炮',       icon: '💥', price: 5300, atk: 80, crit: 20, critMul: 240, desc: '+80 攻击，+20% 暴击(2.4倍)' },
  { key: 'heart',   name: '恐鳌之心',   icon: '❤️', price: 5500, hp: 800, regen: 12, desc: '+800 生命，+12 回复/秒' },
  { key: 'assault', name: '强袭胸甲',   icon: '🛡️', price: 5000, armor: 10, ias: 25, desc: '+10 护甲，+25% 攻速' },
  { key: 'mkb',     name: '金箍棒',     icon: '🐵', price: 4000, atk: 70, ias: 10, desc: '+70 攻击，+10% 攻速' },
  { key: 'satanic', name: '撒旦之邪力', icon: '🩸', price: 4800, atk: 50, lifesteal: 30, desc: '+50 攻击，+30% 吸血' },
  { key: 'blade',   name: '刃甲',       icon: '🌵', price: 2800, armor: 6, thorns: 20, desc: '+6 护甲，反弹20%伤害', counter: { stat: 'armor', per: 1, perN: 5, mode: 'all', trigger: 'hitTaken', label: '硬皮：每被攻击5次永久+1甲' } },
];

// 合成配方：A + B → 成品（顺序无关），参照 Dota2 配方树，小件→中件→大件
export const RECIPES: { parts: [string, string]; result: string }[] = [
  // —— 小件 → 基础件/中件 ——
  { parts: ['gloves', 'gloves'],       result: 'boots' },    // 加速手套×2 → 动力鞋
  { parts: ['blight', 'blight'],       result: 'claw' },     // 枯萎之石×2 → 攻击之爪
  { parts: ['band', 'band'],           result: 'vitality' }, // 力量腰带×2 → 活力之球
  { parts: ['buckler', 'buckler'],     result: 'chain' },    // 小圆盾×2 → 锁子甲
  { parts: ['bracer', 'bracer'],       result: 'boots' },    // 护腕×2 → 动力鞋
  { parts: ['bracer', 'blight'],       result: 'claw' },     // 护腕+枯萎之石 → 攻击之爪
  { parts: ['bracer', 'claw'],         result: 'sange' },    // 护腕+攻击之爪 → 散华
  { parts: ['ring', 'buckler'],        result: 'vanguard' }, // 治疗指环+小圆盾 → 先锋盾
  { parts: ['claw', 'gloves'],         result: 'maelstrom' },// 攻击之爪+加速手套 → 漩涡
  { parts: ['buckler', 'cloak'],       result: 'assault' },  // 小圆盾+闪避斗篷 → 强袭胸甲
  // —— 基础件/中件 → 大件 ——
  { parts: ['claw', 'claw'],           result: 'crystalys' },// 攻击之爪×2 → 水晶剑
  { parts: ['crystalys', 'crystalys'], result: 'daedalus' }, // 水晶剑×2 → 大炮
  { parts: ['crystalys', 'maelstrom'], result: 'bfury' },    // 水晶剑+漩涡 → 狂战斧
  { parts: ['maelstrom', 'claw'],      result: 'mkb' },      // 漩涡+攻击之爪 → 金箍棒
  { parts: ['sange', 'crystalys'],     result: 'satanic' },  // 散华+水晶剑 → 撒旦
  { parts: ['boots', 'cloak'],         result: 'butterfly' },// 动力鞋+闪避斗篷 → 蝴蝶
  { parts: ['vanguard', 'vitality'],   result: 'heart' },    // 先锋盾+活力之球 → 恐鳌之心
  { parts: ['sange', 'vitality'],      result: 'bkb' },      // 散华+活力之球 → 黑皇杖
  { parts: ['chain', 'chain'],         result: 'blade' },    // 锁子甲×2 → 刃甲
];
// 查找配方：两件装备能合成什么（无序匹配），无配方返回 null
export function findRecipe(a: string, b: string): string | null {
  for (const r of RECIPES) {
    if ((r.parts[0] === a && r.parts[1] === b) || (r.parts[0] === b && r.parts[1] === a)) return r.result;
  }
  return null;
}

export const SKILLS: SkillDef[] = [
  { key: 'storm',   name: '剑刃风暴', icon: '🌪️', price: 1500, cd: 100, desc: '主动(10s)：对全体敌人造成 150+攻击×1.0 伤害' },
  { key: 'heal',    name: '治疗波',   icon: '💚', price: 1200, cd: 80,  desc: '主动(8s)：治疗生命最低的队友 250 点', counter: { stat: 'heal', per: 25, mode: 'wave', trigger: 'cast', label: '愈战愈勇：本波每次施放治疗量+25' } },
  { key: 'finger',  name: '神灭斩',   icon: '⚡', price: 2600, cd: 160, desc: '主动(16s)：对当前目标造成 500 点巨额伤害', counter: { stat: 'skilldmg', per: 100, mode: 'all', trigger: 'skillkill', label: '死亡之指：每次用神灭斩击杀永久+100伤害' } },
  { key: 'crit',    name: '致命一击', icon: '🎯', price: 1400, cd: 0,   desc: '被动：暴击率+20%' },
  { key: 'evasion', name: '风行',     icon: '🍃', price: 1400, cd: 0,   desc: '被动：闪避+20%' },
  { key: 'rage',    name: '狂战之血', icon: '😡', price: 1600, cd: 0,   desc: '被动：吸血+20%，生命低于40%时攻击+30%' },
  { key: 'warcry',  name: '战吼',     icon: '📣', price: 1800, cd: 120, desc: '主动(12s)：全队攻击+30%，持续5秒' },
  { key: 'nova',    name: '霜冻新星', icon: '🧊', price: 1500, cd: 90,  desc: '主动(9s)：对全体敌人造成 120 点伤害并减甲3点(4秒)' },
];

// 普通怪物池 + 每5波的Boss
export const MOBS: MobDef[] = [
  { key: 'satyr',   name: '小萨特',   icon: '👺', hp: 300, atk: 22, armor: 1, atkInterval: 16, bounty: 60 },
  { key: 'gnoll',   name: '豺狼人',   icon: '🐺', hp: 420, atk: 30, armor: 2, atkInterval: 15, bounty: 80 },
  { key: 'harpy',   name: '鹰身女妖', icon: '🦅', hp: 380, atk: 38, armor: 1, atkInterval: 12, bounty: 90 },
  { key: 'ogre',    name: '食人魔',   icon: '👹', hp: 700, atk: 42, armor: 4, atkInterval: 18, bounty: 120 },
  { key: 'golem',   name: '岩石傀儡', icon: '🗿', hp: 950, atk: 48, armor: 8, atkInterval: 20, bounty: 150 },
];
export const BOSS: MobDef = { key: 'roshan', name: '肉山', icon: '👑', hp: 2600, atk: 90, armor: 10, atkInterval: 14, bounty: 800 };

export const TICK_MS = 100;
export const MAX_SLOTS = 5;
export const SHOP_SIZE = 6;
export const REFRESH_COST = 50;
export const START_GOLD = 600;
// 每波成长系数
export const waveHpScale = (w: number) => 1 + (w - 1) * 0.35;
export const waveAtkScale = (w: number) => 1 + (w - 1) * 0.22;
export const waveBountyScale = (w: number) => 1 + (w - 1) * 0.15;

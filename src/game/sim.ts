// 确定性战斗模拟：一切状态修改走 step(state, action)。UI 点击只是 action。
import { mulberry32 } from './rng';
import type { Rng } from './rng';
import {
  HEROES, ITEMS, SKILLS, MOBS, BOSS,
  MAX_SLOTS, SHOP_SIZE, REFRESH_COST, START_GOLD,
  waveHpScale, waveAtkScale, waveBountyScale,
  findRecipe,
} from './config';
import type { HeroDef, ItemDef, CounterDef } from './config';

export interface Slot { kind: 'item' | 'skill' | 'innate'; key: string }
export interface Buff { atkMult: number; armorDelta: number; until: number }
export interface Unit {
  side: 'hero' | 'mob';
  key: string; name: string; icon: string; desc: string;
  innate: string;
  baseHp: number; hp: number; atk: number; armor: number; atkInterval: number;
  bounty: number;
  slots: (Slot | null)[];
  cds: Record<string, number>; // 技能剩余冷却(tick)
  atkTimer: number;
  alive: boolean;
  stunUntil: number; // 眩晕到该 tick 为止：不能攻击/施法，计时器冻结
  buff: Buff | null;
  slotCounters: number[]; // 每个槽位的计数器（装备/技能的成长性词条）
  // 展示用：受击/攻击闪动计数
  hitFlash: number; atkFlash: number;
}
export interface Goods { kind: 'item' | 'skill'; key: string; price: number; sold: boolean }
export interface FloatText { id: number; unit: number; side: 'hero' | 'mob'; text: string; cls: string; tick: number }
export interface AtkFx { id: number; fromSide: 'hero' | 'mob'; fromIdx: number; toSide: 'hero' | 'mob'; toIdx: number; cls: string; tick: number; fromSlot?: number; fly: number }
// 弹道中效果：发射后按格子距离/弹道速度延迟命中结算（确定性）
export type PendingHit =
  | { kind: 'dmg'; tick: number; srcSide: 'hero' | 'mob'; srcIdx: number; dstSide: 'hero' | 'mob'; dstIdx: number; raw: number; dodgeable: boolean; crit: boolean; lifesteal: number; cleave: number }
  | { kind: 'skilldmg'; tick: number; srcIdx: number; srcSlot?: number; dstIdx: number; raw: number; armorDelta?: number; debuffTicks?: number }
  | { kind: 'heal'; tick: number; srcIdx: number; dstIdx: number; amount: number };
// 弹道飞行：时长 = 逻辑格子距离 / 弹道速度。格子等大，用格子坐标算欧氏距离
// 各弹道速度（格子单位/tick）：技能弹道慢一些
export const PROJECTILE_SPEED: Record<string, number> = {
  atk: 0.55,   // 普攻：黄色小弹
  crit: 0.65,  // 暴击：橙色，稍快更"狠"
  finger: 0.4, // 神灭斩：粉色，技能弹
  nova: 0.32,  // 霜冻新星：青色冰球，最慢
  heal: 0.36,  // 治疗波：绿色，慢悠悠
  skill: 0.36, // 剑刃风暴：紫色 AoE 弹
};
export const DEFAULT_PROJECTILE_SPEED = 0.4;
// 格子几何（与渲染层 viewBox 1000×1000 一致）：列中心 x=(i+0.5)*200；怪物行 y=140，英雄头像行 y=350，技能槽 si 行 y=350+(si+0.5)*130
export function gridDist(fromIdx: number, fromSide: 'hero' | 'mob', fromSlot: number | undefined, toIdx: number, toSide: 'hero' | 'mob'): number {
  const x1 = (fromIdx + 0.5) * 200;
  const x2 = (toIdx + 0.5) * 200;
  const y1 = fromSide === 'mob' ? 140 : (fromSlot != null ? 350 + (fromSlot + 0.5) * 130 : 350);
  const y2 = toSide === 'mob' ? 140 : 350;
  return Math.hypot(x2 - x1, y2 - y1) / 200; // 归一化到格子单位
}
export function flightTicks(cls: string, dist: number): number {
  const v = PROJECTILE_SPEED[cls] ?? DEFAULT_PROJECTILE_SPEED;
  return Math.max(1, Math.round(dist / v));
}
export interface State {
  tick: number;
  phase: 'battle' | 'shop' | 'over';
  wave: number;
  gold: number;
  heroes: Unit[];
  mobs: Unit[];
  shop: Goods[];
  seed: number;
  rng: Rng;
  floats: FloatText[];
  floatId: number;
  atkFx: AtkFx[];      // 攻击弹道特效
  atkFxId: number;
  pending: PendingHit[]; // 弹道中待结算
  log: string[];
  kills: number;
}
export type Action =
  | { type: 'tick' }
  | { type: 'buyEquip'; shopIdx: number; heroIdx: number; slot: number } // 购买并直接装入槽位，旧物折现
  | { type: 'refresh' }
  | { type: 'unequip'; heroIdx: number; slot: number }                   // 卸下槽位物品 = 折现卖出
  | { type: 'nextWave' }
  | { type: 'swapHeroes'; a: number; b: number }                              // 调整站位：交换两个英雄的整行
  | { type: 'moveSlot'; fromHero: number; fromSlot: number; toHero: number; toSlot: number } // 移动/交换槽位物品
  | { type: 'combine'; fromHero: number; fromSlot: number; toHero: number; toSlot: number }  // 装备合成：两件→成品
  | { type: 'restart'; seed: number };

const itemDef = (k: string) => ITEMS.find(i => i.key === k)!;
const skillDef = (k: string) => SKILLS.find(s => s.key === k)!;

// 槽位上物品/技能的计数器词条定义（固有技能没有）
export const slotCounterDef = (sl: Slot | null | undefined) => {
  if (!sl || sl.kind === 'innate') return undefined;
  return sl.kind === 'item' ? itemDef(sl.key).counter : skillDef(sl.key).counter;
};
// 计数器当前生效的数值（perN 次触发才 +per）
export const counterValue = (def: CounterDef, count: number) => Math.floor(count / (def.perN ?? 1)) * def.per;

// 固有技能表：key → 名称/图标/描述/折现价
export interface InnateDef { key: string; name: string; icon: string; desc: string; sellPrice: number }
export const INNATES: Record<string, InnateDef> = {
  helix:     { key: 'helix',     name: '反击螺旋', icon: '🌀', desc: '受击时20%几率反击全体敌人', sellPrice: 500 },
  bladedance:{ key: 'bladedance',name: '剑舞',     icon: '⚔️', desc: '暴击率+15%',              sellPrice: 450 },
  aura:      { key: 'aura',      name: '奥术光环', icon: '🔵', desc: '全队技能冷却-20%',        sellPrice: 600 },
  headshot:  { key: 'headshot',  name: '爆头',     icon: '🎯', desc: '暴击率+10%，暴击伤害2.2倍', sellPrice: 500 },
  shell:     { key: 'shell',     name: '海妖外壳', icon: '🐚', desc: '受到伤害减免15%',          sellPrice: 550 },
  manadrain: { key: 'manadrain', name: '法力吸取', icon: '🩵', desc: '自身技能冷却-30%',        sellPrice: 400 },
  flesh:     { key: 'flesh',     name: '腐肉堆积', icon: '🥩', desc: '生命上限+25%',            sellPrice: 500 },
  blood:     { key: 'blood',     name: '龙族血统', icon: '🩸', desc: '每秒回复8点生命',          sellPrice: 450 },
  windrun:   { key: 'windrun',   name: '疾风步',   icon: '🍃', desc: '攻速+20%',                sellPrice: 450 },
  cleave:    { key: 'cleave',    name: '巨力挥舞', icon: '💪', desc: '攻击25%分裂伤害',          sellPrice: 450 },
};
export const slotName = (sl: Slot) =>
  sl.kind === 'item' ? itemDef(sl.key) : sl.kind === 'skill' ? skillDef(sl.key) : INNATES[sl.key];
export const slotSellPrice = (sl: Slot) =>
  sl.kind === 'innate' ? INNATES[sl.key].sellPrice : Math.round((slotName(sl) as ItemDef).price / 2);

function mkHero(def: HeroDef): Unit {
  return {
    side: 'hero', key: def.key, name: def.name, icon: def.icon, desc: def.desc, innate: def.innate,
    baseHp: def.hp, hp: def.hp, atk: def.atk, armor: def.armor, atkInterval: def.atkInterval,
    bounty: 0, slots: Array(MAX_SLOTS).fill(null), cds: {}, atkTimer: def.atkInterval,
    alive: true, stunUntil: 0, buff: null, slotCounters: Array(MAX_SLOTS).fill(0), hitFlash: 0, atkFlash: 0,
  };
}
function mkMob(def: { key: string; name: string; icon: string; }, w: number, rng: Rng): Unit {
  const boss = def.key === 'roshan';
  const base = boss ? BOSS : MOBS.find(m => m.key === def.key)!;
  const hp = Math.round(base.hp * (boss ? waveHpScale(w) * 0.9 : waveHpScale(w)));
  return {
    side: 'mob', key: base.key, name: base.name, icon: base.icon, desc: '', innate: '',
    baseHp: hp, hp, atk: Math.round(base.atk * waveAtkScale(w)), armor: base.armor + Math.floor(w / 4),
    atkInterval: base.atkInterval, bounty: Math.round(base.bounty * waveBountyScale(w)),
    slots: [], cds: {}, atkTimer: rng.i(4, base.atkInterval), alive: true, stunUntil: 0, buff: null, slotCounters: [], hitFlash: 0, atkFlash: 0,
  };
}

function spawnWave(state: State) {
  const w = state.wave, rng = state.rng;
  state.mobs = [];
  if (w % 5 === 0) {
    // Boss 波：肉山 + 2~3 小弟
    state.mobs.push(mkMob(BOSS, w, rng));
    const n = rng.i(2, Math.min(3, 1 + Math.floor(w / 5)));
    for (let i = 0; i < n; i++) state.mobs.push(mkMob(MOBS[rng.i(0, MOBS.length - 1)], w, rng));
  } else {
    const n = Math.min(5, 2 + Math.ceil(w / 2));
    for (let i = 0; i < n; i++) state.mobs.push(mkMob(MOBS[rng.i(0, MOBS.length - 1)], w, rng));
  }
  state.mobs.forEach(m => { m.alive = true; });
}

function rollShop(state: State) {
  const rng = state.rng;
  state.shop = [];
  for (let i = 0; i < SHOP_SIZE; i++) {
    if (rng.p(0.55)) {
      // 小件(≤900金)出现率更高：前期有东西可买
      let d = ITEMS[rng.i(0, ITEMS.length - 1)];
      if (d.price > 900 && rng.p(0.5)) d = ITEMS[rng.i(0, ITEMS.length - 1)];
      state.shop.push({ kind: 'item', key: d.key, price: d.price, sold: false });
    } else {
      const d = SKILLS[rng.i(0, SKILLS.length - 1)];
      state.shop.push({ kind: 'skill', key: d.key, price: d.price, sold: false });
    }
  }
}

export function createState(seed: number): State {
  const rng = mulberry32(seed);
  const pool = [...HEROES];
  const picked: HeroDef[] = [];
  for (let i = 0; i < 5; i++) picked.push(pool.splice(rng.i(0, pool.length - 1), 1)[0]);
  const state: State = {
    tick: 0, phase: 'shop', wave: 1, gold: START_GOLD,
    heroes: picked.map(mkHero), mobs: [],
    shop: [], seed, rng, floats: [], floatId: 0, atkFx: [], atkFxId: 0, pending: [], log: [], kills: 0,
  };
  // 固有技能占用第 1 格，可卸下折现或替换
  state.heroes.forEach(h => { h.slots[0] = { kind: 'innate', key: h.innate }; });
  rollShop(state);
  addLog(state, `🎲 抽到阵容：${picked.map(p => p.name).join('、')}。固有技能占第1格（可卸下折现），买装备技能填满其余格子！`);
  return state;
}

function addLog(state: State, s: string) {
  state.log.push(s);
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}
function addFloat(state: State, _u: Unit, side: 'hero' | 'mob', idx: number, text: string, cls: string) {
  state.floats.push({ id: state.floatId++, unit: idx, side, text, cls, tick: state.tick });
  if (state.floats.length > 30) state.floats.splice(0, state.floats.length - 30);
}
function addFx(state: State, fromSide: 'hero' | 'mob', fromIdx: number, toSide: 'hero' | 'mob', toIdx: number, cls: string, fromSlot?: number): number {
  const fly = flightTicks(cls, gridDist(fromIdx, fromSide, fromSlot, toIdx, toSide));
  state.atkFx.push({ id: state.atkFxId++, fromSide, fromIdx, toSide, toIdx, cls, tick: state.tick, fromSlot, fly });
  if (state.atkFx.length > 16) state.atkFx.splice(0, state.atkFx.length - 16);
  return fly;
}

// —— 战斗数值 ——
interface Stats { atk: number; armor: number; ias: number; crit: number; critMul: number; dodge: number; lifesteal: number; regen: number; cleave: number; thorns: number; maxHp: number }
export function heroStats(u: Unit): Stats {
  const s: Stats = { atk: u.atk, armor: u.armor, ias: 0, crit: 5, critMul: 200, dodge: 0, lifesteal: 0, regen: 0, cleave: 0, thorns: 0, maxHp: u.baseHp };
  for (let si = 0; si < u.slots.length; si++) {
    const sl = u.slots[si];
    if (!sl) continue;
    // 计数器加成（atk/maxHp/armor 类）
    const cd = slotCounterDef(sl);
    if (cd) {
      const v = counterValue(cd, u.slotCounters[si] ?? 0);
      if (cd.stat === 'atk') s.atk += v;
      else if (cd.stat === 'maxHp') s.maxHp += v;
      else if (cd.stat === 'armor') s.armor += v;
    }
    if (sl.kind === 'item') {
      const d: ItemDef = itemDef(sl.key);
      s.atk += d.atk ?? 0; s.armor += d.armor ?? 0; s.ias += d.ias ?? 0;
      s.crit += d.crit ?? 0; s.dodge += d.dodge ?? 0; s.lifesteal += d.lifesteal ?? 0;
      s.regen += d.regen ?? 0; s.cleave += d.cleave ?? 0; s.thorns += d.thorns ?? 0;
      s.maxHp += d.hp ?? 0;
      if (d.critMul) s.critMul = Math.max(s.critMul, d.critMul);
    } else if (sl.kind === 'skill') {
      const d = skillDef(sl.key);
      if (d.key === 'crit') s.crit += 20;
      if (d.key === 'evasion') s.dodge += 20;
      if (d.key === 'rage') s.lifesteal += 20;
    } else {
      // 固有技能占格生效
      const k = sl.key;
      if (k === 'bladedance') s.crit += 15;
      if (k === 'headshot') { s.crit += 10; s.critMul = Math.max(s.critMul, 220); }
      if (k === 'windrun') s.ias += 20;
      if (k === 'cleave') s.cleave += 25;
      if (k === 'flesh') s.maxHp = Math.round(s.maxHp * 1.25);
      if (k === 'blood') s.regen += 8;
    }
  }
  if (u.buff && u.buff.atkMult > 0) s.atk = Math.round(s.atk * (1 + u.buff.atkMult));
  if (u.buff) s.armor += u.buff.armorDelta;
  // 狂战之血低血加攻
  if (u.slots.some(sl => sl?.kind === 'skill' && sl.key === 'rage') && u.hp < s.maxHp * 0.4) s.atk = Math.round(s.atk * 1.3);
  return s;
}

const cdMult = (state: State, u: Unit) => {
  let m = 1;
  if (u.slots.some(sl => sl?.kind === 'innate' && sl.key === 'manadrain')) m *= 0.7;
  if (state.heroes.some(h => h.alive && h.slots.some(sl => sl?.kind === 'innate' && sl.key === 'aura'))) m *= 0.8;
  return m;
};

function dealDamage(state: State, src: Unit | null, dst: Unit, dstIdx: number, raw: number, opts: { dodgeable?: boolean; cls?: string } = {}) {
  const ss = dst.side === 'hero' ? heroStats(dst) : null;
  if (opts.dodgeable && ss && state.rng.p(ss.dodge / 100)) {
    addFloat(state, dst, dst.side, dstIdx, '闪避', 'dodge');
    return 0;
  }
  let dmg = raw;
  const armor = ss ? ss.armor : Math.max(0, dst.armor + (dst.buff?.armorDelta ?? 0));
  dmg = Math.round(dmg * (1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor))));
  if (dst.slots.some(sl => sl?.kind === 'innate' && sl.key === 'shell')) dmg = Math.round(dmg * 0.85);
  dmg = Math.max(1, dmg);
  dst.hp -= dmg;
  dst.hitFlash = 2;
  addFloat(state, dst, dst.side, dstIdx, `-${dmg}`, opts.cls ?? 'dmg');
  // 受击计数（刃甲硬皮等）
  if (dst.side === 'hero') {
    for (let si = 0; si < dst.slots.length; si++) {
      const cd = slotCounterDef(dst.slots[si]);
      if (cd?.trigger === 'hitTaken') dst.slotCounters[si] = (dst.slotCounters[si] ?? 0) + 1;
    }
  }
  // 刃甲反弹
  if (ss && ss.thorns > 0 && src && src.alive) {
    const ref = Math.round(dmg * ss.thorns / 100);
    src.hp -= ref;
    if (src.hp <= 0) killUnit(state, src, dst);
  }
  // 斧王反击螺旋
  if (dst.slots.some(sl => sl?.kind === 'innate' && sl.key === 'helix') && dst.alive && state.rng.p(0.2)) {
    const hs = heroStats(dst);
    const hd = Math.round(hs.atk * 0.8);
    addFloat(state, dst, 'hero', dstIdx, '🌀反击', 'skill');
    state.mobs.forEach((m) => { if (m.alive) { m.hp -= hd; m.hitFlash = 2; if (m.hp <= 0) killUnit(state, m, dst); } });
  }
  if (dst.hp <= 0) killUnit(state, dst, src);
  return dmg;
}

function killUnit(state: State, u: Unit, src?: Unit | null) {
  if (!u.alive) return;
  // 击杀计数（攻击之爪嗜血等）
  if (src?.side === 'hero' && src.alive) {
    for (let si = 0; si < src.slots.length; si++) {
      const cd = slotCounterDef(src.slots[si]);
      if (cd?.trigger === 'kill') src.slotCounters[si] = (src.slotCounters[si] ?? 0) + 1;
    }
  }
  u.alive = false; u.hp = 0;
  if (u.side === 'mob') {
    state.kills++;
    state.gold += u.bounty;
    // 掉落：Boss必掉，小怪20%。直接装进随机存活英雄的空格子，没空格子自动丢弃折现
    const isBoss = u.key === 'roshan';
    if (isBoss || state.rng.p(0.2)) {
      const dropSkill = state.rng.p(0.3);
      const d = dropSkill ? SKILLS[state.rng.i(0, SKILLS.length - 1)] : ITEMS[state.rng.i(0, ITEMS.length - 1)];
      // 收集所有空格（英雄固定扫描顺序，空格按槽位顺序）
      const spots: { h: Unit; hi: number; si: number }[] = [];
      state.heroes.forEach((h, hi) => {
        if (!h.alive) return;
        h.slots.forEach((sl, si) => { if (!sl) spots.push({ h, hi, si }); });
      });
      if (spots.length > 0) {
        const pick = spots[state.rng.i(0, spots.length - 1)];
        pick.h.slots[pick.si] = { kind: dropSkill ? 'skill' : 'item', key: d.key };
        addFloat(state, pick.h, 'hero', pick.hi, `🎁${d.icon}`, 'skill');
        addLog(state, `🎁 ${u.name} 掉落 ${d.icon}${d.name}，装进了 ${pick.h.name} 的格子`);
      } else {
        state.gold += Math.round(d.price / 2);
        addLog(state, `🎁 ${u.name} 掉落 ${d.name}，没有空格子，丢弃折现 ${Math.round(d.price / 2)} 金币`);
      }
    }
  }
}

function heal(state: State, u: Unit, idx: number, amount: number) {
  const s = heroStats(u);
  const real = Math.round(Math.min(amount, s.maxHp - u.hp));
  if (real <= 0) return;
  u.hp += real;
  addFloat(state, u, 'hero', idx, `+${real}`, 'heal');
}

function castSkill(state: State, u: Unit, ui: number, key: string, slot: number): boolean {
  const mobsAlive = state.mobs.filter(m => m.alive);
  const s = heroStats(u);
  const firstMob = state.mobs.findIndex(m => m.alive);
  switch (key) {
    case 'storm': {
      if (!mobsAlive.length) return false;
      const dmg = 150 + s.atk;
      addFloat(state, u, 'hero', ui, '🌪️剑刃风暴', 'skill');
      state.mobs.forEach((m, mi) => { if (m.alive) { const fly = addFx(state, 'hero', ui, 'mob', mi, 'skill', slot); state.pending.push({ kind: 'skilldmg', tick: state.tick + fly, srcIdx: ui, srcSlot: slot, dstIdx: mi, raw: dmg }); } });
      return true;
    }
    case 'heal': {
      let worst = -1, ratio = 1;
      state.heroes.forEach((h, i) => {
        if (!h.alive) return;
        const r = h.hp / heroStats(h).maxHp;
        if (r < ratio) { ratio = r; worst = i; }
      });
      if (worst < 0 || ratio > 0.95) return false;
      addFloat(state, u, 'hero', ui, '💚治疗波', 'skill');
      // 愈战愈勇：本波每次施放治疗量成长
      const hcd = slotCounterDef(u.slots[slot]);
      const amount = 250 + (hcd?.stat === 'heal' ? counterValue(hcd, u.slotCounters[slot] ?? 0) : 0);
      const fly = addFx(state, 'hero', ui, 'hero', worst, 'heal', slot);
      state.pending.push({ kind: 'heal', tick: state.tick + fly, srcIdx: ui, dstIdx: worst, amount });
      return true;
    }
    case 'finger': {
      if (firstMob < 0) return false;
      addFloat(state, u, 'hero', ui, '⚡神灭斩', 'skill');
      // 死亡之指：每次用神灭斩击杀，伤害永久成长
      const fcd = slotCounterDef(u.slots[slot]);
      const raw = 500 + (fcd?.stat === 'skilldmg' ? counterValue(fcd, u.slotCounters[slot] ?? 0) : 0);
      const fly = addFx(state, 'hero', ui, 'mob', firstMob, 'finger', slot);
      state.pending.push({ kind: 'skilldmg', tick: state.tick + fly, srcIdx: ui, srcSlot: slot, dstIdx: firstMob, raw });
      return true;
    }
    case 'warcry': {
      addFloat(state, u, 'hero', ui, '📣战吼', 'skill');
      state.heroes.forEach(h => { if (h.alive) h.buff = { atkMult: 0.3, armorDelta: 0, until: state.tick + 50 }; });
      return true;
    }
    case 'nova': {
      if (!mobsAlive.length) return false;
      addFloat(state, u, 'hero', ui, '🧊霜冻新星', 'skill');
      state.mobs.forEach((m, mi) => {
        if (!m.alive) return;
        const fly = addFx(state, 'hero', ui, 'mob', mi, 'nova', slot);
        state.pending.push({ kind: 'skilldmg', tick: state.tick + fly, srcIdx: ui, srcSlot: slot, dstIdx: mi, raw: 120, armorDelta: -3, debuffTicks: 40 });
      });
      return true;
    }
  }
  return false;
}

function heroTick(state: State, u: Unit, ui: number) {
  if (!u.alive) return;
  const s = heroStats(u);
  // 回复
  if (s.regen > 0 && u.hp < s.maxHp) u.hp = Math.min(s.maxHp, u.hp + s.regen / 10);
  // 眩晕：不能施法/攻击，冷却与普攻计时器冻结
  if (state.tick < u.stunUntil) return;
  // buff 过期
  if (u.buff && state.tick >= u.buff.until) u.buff = null;
  // 技能冷却
  for (const k of Object.keys(u.cds)) if (u.cds[k] > 0) u.cds[k]--;
  // 主动技能
  for (let si = 0; si < u.slots.length; si++) {
    const sl = u.slots[si];
    if (sl?.kind !== 'skill') continue;
    const d = skillDef(sl.key);
    if (d.cd === 0) continue;
    if ((u.cds[sl.key] ?? 0) > 0) continue;
    if (castSkill(state, u, ui, sl.key, si)) {
      u.cds[sl.key] = Math.max(1, Math.round(d.cd * cdMult(state, u)));
      // 施放计数（治疗波愈战愈勇等）
      const cd2 = slotCounterDef(sl);
      if (cd2?.trigger === 'cast') u.slotCounters[si] = (u.slotCounters[si] ?? 0) + 1;
    }
  }
  // 普攻
  if (--u.atkTimer > 0) return;
  u.atkTimer = Math.max(3, Math.round(u.atkInterval / (1 + s.ias / 100)));
  // 对位攻击：优先打同一列的怪，该列无怪则打第一个存活
  const laneMob = state.mobs[ui];
  const ti = laneMob?.alive ? ui : state.mobs.findIndex(m => m.alive);
  if (ti < 0) return;
  const t = state.mobs[ti];
  u.atkFlash = 2;
  const crit = state.rng.p(s.crit / 100);
  const fly = addFx(state, 'hero', ui, 'mob', ti, crit ? 'crit' : 'atk');
  const raw = crit ? Math.round(s.atk * s.critMul / 100) : s.atk;
  state.pending.push({ kind: 'dmg', tick: state.tick + fly, srcSide: 'hero', srcIdx: ui, dstSide: 'mob', dstIdx: ti, raw, dodgeable: true, crit, lifesteal: s.lifesteal, cleave: s.cleave });
  void t;
}

function mobTick(state: State, m: Unit, mi: number) {
  if (!m.alive) return;
  if (m.buff && state.tick >= m.buff.until) m.buff = null;
  // 眩晕：不能攻击，普攻计时器冻结
  if (state.tick < m.stunUntil) return;
  if (--m.atkTimer > 0) return;
  m.atkTimer = m.atkInterval;
  // 对位攻击：优先打同一列的英雄，该列无人则打第一个存活
  const lane = state.heroes[mi];
  const ti = lane?.alive ? mi : state.heroes.findIndex(h => h.alive);
  if (ti < 0) return;
  m.atkFlash = 2;
  const fly = addFx(state, 'mob', mi, 'hero', ti, 'atk');
  state.pending.push({ kind: 'dmg', tick: state.tick + fly, srcSide: 'mob', srcIdx: mi, dstSide: 'hero', dstIdx: ti, raw: m.atk, dodgeable: true, crit: false, lifesteal: 0, cleave: 0 });
}

// 弹道命中结算：目标已死则弹道落空
function resolvePending(state: State) {
  if (!state.pending.length) return;
  const due = state.pending.filter(p => p.tick <= state.tick);
  state.pending = state.pending.filter(p => p.tick > state.tick);
  for (const p of due) {
    if (p.kind === 'heal') {
      const t = state.heroes[p.dstIdx];
      if (t?.alive) heal(state, t, p.dstIdx, p.amount);
      continue;
    }
    if (p.kind === 'skilldmg') {
      const t = state.mobs[p.dstIdx];
      if (!t?.alive) continue;
      const caster = state.heroes[p.srcIdx];
      dealDamage(state, caster?.alive ? caster : null, t, p.dstIdx, p.raw, { cls: 'skilldmg' });
      if (t.alive && p.armorDelta) t.buff = { atkMult: 0, armorDelta: p.armorDelta, until: state.tick + (p.debuffTicks ?? 40) };
      // 技能击杀计数（神灭斩死亡之指）
      if (!t.alive && p.srcSlot != null && caster) {
        const cd = slotCounterDef(caster.slots[p.srcSlot]);
        if (cd?.trigger === 'skillkill') {
          caster.slotCounters[p.srcSlot] = (caster.slotCounters[p.srcSlot] ?? 0) + 1;
          addFloat(state, caster, 'hero', p.srcIdx, `⚡+${cd.per}伤害`, 'skill');
        }
      }
      continue;
    }
    // 普攻弹道
    const src = p.srcSide === 'hero' ? state.heroes[p.srcIdx] : state.mobs[p.srcIdx];
    const dst = p.dstSide === 'hero' ? state.heroes[p.dstIdx] : state.mobs[p.dstIdx];
    if (!dst?.alive) continue; // 目标已死，落空
    const dealt = dealDamage(state, src?.alive ? src : null, dst, p.dstIdx, p.raw, { dodgeable: p.dodgeable, cls: p.crit ? 'crit' : 'dmg' });
    if (dealt > 0 && src?.alive && p.srcSide === 'hero') {
      // 重击（碎颅锤/深渊之刃）：普攻概率眩晕目标
      for (const sl of src.slots) {
        if (sl?.kind !== 'item') continue;
        const d = itemDef(sl.key);
        if (!d.bashChance || !dst.alive) continue;
        if (state.rng.p(d.bashChance / 100)) {
          const until = state.tick + (d.bashTicks ?? 15);
          if (until > dst.stunUntil) dst.stunUntil = until;
          addFloat(state, dst, dst.side, p.dstIdx, '💫眩晕', 'skill');
          if (d.bashDmg) { dst.hp -= d.bashDmg; dst.hitFlash = 2; if (dst.hp <= 0) killUnit(state, dst, src); }
        }
      }
      // 暴击计数（水晶剑磨刀等）
      if (p.crit) {
        for (let si = 0; si < src.slots.length; si++) {
          const cd = slotCounterDef(src.slots[si]);
          if (cd?.trigger === 'crit') src.slotCounters[si] = (src.slotCounters[si] ?? 0) + 1;
        }
      }
      if (p.lifesteal > 0) {
        const s2 = heroStats(src);
        src.hp = Math.min(s2.maxHp, src.hp + Math.round(dealt * p.lifesteal / 100));
      }
      if (p.cleave > 0) {
        const cd = Math.round(dealt * p.cleave / 100);
        state.mobs.forEach((m, mi) => {
          if (mi !== p.dstIdx && m.alive) { m.hp -= cd; m.hitFlash = 2; if (m.hp <= 0) killUnit(state, m, src); }
        });
      }
    }
  }
}

function battleTick(state: State) {
  state.heroes.forEach((h, i) => heroTick(state, h, i));
  state.mobs.forEach((m, i) => mobTick(state, m, i));
  resolvePending(state);
  state.heroes.forEach(h => { if (h.hitFlash > 0) h.hitFlash--; if (h.atkFlash > 0) h.atkFlash--; });
  state.mobs.forEach(m => { if (m.hitFlash > 0) m.hitFlash--; if (m.atkFlash > 0) m.atkFlash--; });
  state.floats = state.floats.filter(f => state.tick - f.tick < 10);
  state.atkFx = state.atkFx.filter(f => state.tick - f.tick < f.fly + 2);
  if (state.heroes.every(h => !h.alive)) {
    state.phase = 'over';
    addLog(state, `💀 团灭……止步第 ${state.wave} 波`);
    return;
  }
  if (state.mobs.every(m => !m.alive)) {
    const bonus = 100 + state.wave * 40;
    state.gold += bonus;
    addLog(state, `🏆 第 ${state.wave} 波通关！奖励 ${bonus} 金币`);
    // 通关成长计数（活力之球等）：必须在复活之前统计，只算存活通关的英雄
    state.heroes.forEach((h, hi) => {
      if (!h.alive) return;
      for (let si = 0; si < h.slots.length; si++) {
        const cd = slotCounterDef(h.slots[si]);
        if (cd?.trigger === 'waveEnd') {
          h.slotCounters[si] = (h.slotCounters[si] ?? 0) + 1;
          addFloat(state, h, 'hero', hi, `🌱成长+${cd.per}`, 'heal');
        }
      }
    });
    // 战后小幅恢复
    state.heroes.forEach((h, i) => { h.stunUntil = 0; if (h.alive) heal(state, h, i, Math.round(heroStats(h).maxHp * 0.3)); else { h.alive = true; h.hp = Math.round(heroStats(h).maxHp * 0.5); addFloat(state, h, 'hero', i, '复活', 'heal'); } });
    state.wave++;
    state.phase = 'shop';
    state.pending = []; // 波次结束，清空在途弹道（场上已无目标）
    rollShop(state);
  }
}

export function step(state: State, a: Action) {
  switch (a.type) {
    case 'tick':
      state.tick++;
      if (state.phase === 'battle') battleTick(state);
      break;
    case 'buyEquip': {
      if (state.phase !== 'shop') break;
      const g = state.shop[a.shopIdx];
      const h = state.heroes[a.heroIdx];
      if (!g || g.sold || state.gold < g.price || !h || a.slot < 0 || a.slot >= MAX_SLOTS) break;
      state.gold -= g.price; g.sold = true;
      const old = h.slots[a.slot];
      h.slots[a.slot] = { kind: g.kind, key: g.key };
      if (old) {
        state.gold += slotSellPrice(old);
        addLog(state, `♻️ ${slotName(old).name} 替换折现 +${slotSellPrice(old)} 金币`);
      }
      const s = heroStats(h);
      if (h.hp > s.maxHp) h.hp = s.maxHp;
      break;
    }
    case 'refresh':
      if (state.phase === 'shop' && state.gold >= REFRESH_COST) { state.gold -= REFRESH_COST; rollShop(state); }
      break;
    case 'unequip': {
      const h = state.heroes[a.heroIdx];
      const sl = h?.slots[a.slot];
      if (!sl) break;
      const d = slotName(sl);
      state.gold += slotSellPrice(sl);
      h.slots[a.slot] = null;
      addLog(state, `💰 卸下 ${d.name}，+${slotSellPrice(sl)} 金币`);
      const s = heroStats(h);
      if (h.hp > s.maxHp) h.hp = s.maxHp;
      break;
    }
    case 'nextWave': {
      if (state.phase !== 'shop') break;
      state.phase = 'battle';
      spawnWave(state);
      state.heroes.forEach(h => {
        h.cds = {}; h.atkTimer = h.atkInterval;
        // 每波复位的计数器清零（永久累积的保留）
        h.slotCounters = h.slotCounters.map((c, si) => slotCounterDef(h.slots[si])?.mode === 'wave' ? 0 : c);
      });
      addLog(state, `⚔️ 第 ${state.wave} 波来袭：${state.mobs.map(m => m.name).join('、')}`);
      break;
    }
    case 'restart':
      Object.assign(state, createState(a.seed));
      break;
    case 'swapHeroes': {
      if (state.phase !== 'shop') break;
      const { a: i, b: j } = a;
      if (i === j || i < 0 || j < 0 || i >= state.heroes.length || j >= state.heroes.length) break;
      const t = state.heroes[i];
      state.heroes[i] = state.heroes[j];
      state.heroes[j] = t;
      addLog(state, `🔀 调整站位：${state.heroes[i].name} ↔ ${state.heroes[j].name}`);
      break;
    }
    case 'moveSlot': {
      if (state.phase !== 'shop') break;
      const fh = state.heroes[a.fromHero], th = state.heroes[a.toHero];
      if (!fh || !th || a.fromSlot < 0 || a.fromSlot >= MAX_SLOTS || a.toSlot < 0 || a.toSlot >= MAX_SLOTS) break;
      if (a.fromHero === a.toHero && a.fromSlot === a.toSlot) break;
      const src = fh.slots[a.fromSlot];
      if (!src) break;
      const dst = th.slots[a.toSlot];
      // 固有技能不能离开自己的主人（同名英雄只有一个）
      if (src.kind === 'innate' && a.fromHero !== a.toHero) { addLog(state, `⚠️ 固有技能只能在本英雄格子间移动`); break; }
      if (dst?.kind === 'innate' && a.fromHero !== a.toHero) break;
      fh.slots[a.fromSlot] = dst;
      th.slots[a.toSlot] = src;
      // 计数器跟随物品走
      const tc = fh.slotCounters[a.fromSlot] ?? 0;
      fh.slotCounters[a.fromSlot] = th.slotCounters[a.toSlot] ?? 0;
      th.slotCounters[a.toSlot] = tc;
      const d = slotName(src);
      addLog(state, dst
        ? `🔀 ${d.name} ↔ ${slotName(dst).name}（${fh.name} → ${th.name}）`
        : `📦 ${d.name} 移到 ${th.name} 的第 ${a.toSlot + 1} 格`);
      // 交换后血量超上限则截断
      for (const h of [fh, th]) {
        const s = heroStats(h);
        if (h.hp > s.maxHp) h.hp = s.maxHp;
      }
      break;
    }
    case 'combine': {
      if (state.phase !== 'shop') break;
      const fh = state.heroes[a.fromHero], th = state.heroes[a.toHero];
      if (!fh || !th) break;
      const src = fh.slots[a.fromSlot], dst = th.slots[a.toSlot];
      if (a.fromHero === a.toHero && a.fromSlot === a.toSlot) break;
      if (src?.kind !== 'item' || dst?.kind !== 'item') break;
      const result = findRecipe(src.key, dst.key);
      if (!result) break;
      const rd = itemDef(result);
      fh.slots[a.fromSlot] = null;
      th.slots[a.toSlot] = { kind: 'item', key: result };
      // 合成后成品是新物品，两个材料的计数都清零
      fh.slotCounters[a.fromSlot] = 0;
      th.slotCounters[a.toSlot] = 0;
      addLog(state, `🔨 合成 ${rd.icon}${rd.name}！（${itemDef(src.key).name} + ${itemDef(dst.key).name} → ${th.name}）`);
      // 成品可能加血上限，无需截断；但若是同英雄两格互换后的上限变化兜底
      for (const h of [fh, th]) {
        const s = heroStats(h);
        if (h.hp > s.maxHp) h.hp = s.maxHp;
      }
      break;
    }
  }
}

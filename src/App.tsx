import { useEffect, useRef, useState } from 'react';
import { createState, step, heroStats, slotName, slotSellPrice, slotCounterDef, counterValue } from './game/sim';
import type { State, Action, Unit, Slot, Goods } from './game/sim';
import { ITEMS, SKILLS, REFRESH_COST, RECIPES, findRecipe } from './game/config';
import type { ItemDef, SkillDef } from './game/config';
import './game/game.css';

const defOf = (sl: Slot) => slotName(sl);

function HpBar({ cur, max, color }: { cur: number; max: number; color: string }) {
  return (
    <div className="w-full h-2.5 bg-black/60 rounded overflow-hidden border border-black/40">
      <div className={`h-full ${color} transition-all duration-100`} style={{ width: `${Math.max(0, (cur / max) * 100)}%` }} />
    </div>
  );
}

// 普攻冷却小圆盘：灰色锥形随 atkTimer 填充，满了即出手
function AtkCdDial({ timer, total }: { timer: number; total: number }) {
  const p = total > 0 ? Math.min(1, Math.max(0, 1 - timer / total)) : 1;
  return (
    <div className="absolute top-0.5 right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full pointer-events-none"
      title={`攻击间隔 ${(total / 10).toFixed(1)}s`}
      style={{ background: `conic-gradient(rgba(212,212,216,.9) ${p * 360}deg, rgba(0,0,0,.35) ${p * 360}deg)` }} />
  );
}

function Floats({ state, side, idx }: { state: State; side: 'hero' | 'mob'; idx: number }) {
  const fs = state.floats.filter(f => f.side === side && f.unit === idx);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-10">
      {fs.map((f, i) => (
        <div key={f.id} className={`float-text float-${f.cls}`} style={{ left: `${15 + (i % 3) * 32}%` }}>{f.text}</div>
      ))}
    </div>
  );
}

function MobCard({ u, idx, state, onClick }: { u: Unit; idx: number; state: State; onClick: (idx: number) => void }) {
  return (
    <div onClick={() => onClick(idx)} title="点击查看详情"
      className={`relative rounded-lg border p-1.5 sm:p-2 select-none transition-all cursor-pointer border-red-800/60 bg-red-950/40 hover:border-red-500
      ${u.hitFlash > 0 ? 'brightness-150' : ''} ${u.atkFlash > 0 ? 'scale-[1.04]' : ''} ${!u.alive ? 'opacity-40 grayscale' : ''}`}>
      <Floats state={state} side="mob" idx={idx} />
      {u.stunUntil > state.tick && u.alive && (
        <span className="absolute top-0.5 left-0.5 text-xs sm:text-sm pointer-events-none animate-spin" title={`眩晕中（剩 ${((u.stunUntil - state.tick) / 10).toFixed(1)}s）`}>💫</span>
      )}
      {state.phase === 'battle' && u.alive && (
        <AtkCdDial timer={u.atkTimer} total={u.atkInterval} />
      )}
      <div className="text-center leading-none h-7 sm:h-9 text-2xl sm:text-3xl">{u.icon}</div>
      <div className="text-center text-[10px] sm:text-xs font-bold text-red-200 truncate mt-0.5">{u.name}</div>
      <HpBar cur={u.hp} max={u.baseHp} color="bg-red-500" />
      <div className="text-center text-[9px] text-zinc-300 tabular-nums">{Math.max(0, Math.ceil(u.hp))}/{u.baseHp}</div>
    </div>
  );
}

function HeroColumn({ u, idx, state, targeting, onSlotClick, onHeaderClick, onSlotPointerDown, onHeaderPointerDown, dragOver, heroDrop }: {
  u: Unit; idx: number; state: State; targeting: boolean;
  onSlotClick: (heroIdx: number, slot: number) => void;
  onHeaderClick: (heroIdx: number) => void;
  onSlotPointerDown: (heroIdx: number, slot: number, e: React.PointerEvent) => void;
  onHeaderPointerDown: (heroIdx: number, e: React.PointerEvent) => void;
  dragOver: number | null;  // 本列被悬停的槽位号
  heroDrop: boolean;        // 有英雄正被拖到本列上方
}) {
  const s = heroStats(u);
  const dead = !u.alive;
  const shopPhase = state.phase === 'shop';
  return (
    <div data-hero-col={idx} className={`relative flex flex-col items-center gap-1 rounded-lg transition-all ${dead ? 'opacity-40 grayscale' : ''} ${heroDrop ? 'ring-2 ring-sky-400 bg-sky-950/30' : ''}`}>
      <Floats state={state} side="hero" idx={idx} />
      <div
        onClick={() => onHeaderClick(idx)}
        onPointerDown={e => onHeaderPointerDown(idx, e)}
        title={shopPhase && !targeting ? '点击查看详情，按住拖动调整站位' : '点击查看详情'}
        className={`w-full rounded-lg border p-1.5 sm:p-2 text-center transition-all border-emerald-700/60 bg-emerald-950/40
        ${u.hitFlash > 0 ? 'brightness-150' : ''} ${u.atkFlash > 0 ? 'scale-[1.04]' : ''}
        ${shopPhase && !targeting ? 'cursor-grab active:cursor-grabbing touch-none select-none' : 'cursor-pointer'}`}>
        {u.stunUntil > state.tick && u.alive && (
          <span className="absolute top-0.5 left-0.5 text-xs sm:text-sm pointer-events-none animate-spin z-10" title={`眩晕中（剩 ${((u.stunUntil - state.tick) / 10).toFixed(1)}s）`}>💫</span>
        )}
        {!shopPhase && u.alive && (
          <AtkCdDial timer={u.atkTimer} total={Math.max(3, Math.round(u.atkInterval / (1 + s.ias / 100)))} />
        )}
        <div className="leading-none h-7 sm:h-10 text-2xl sm:text-4xl">{u.icon}</div>
        <div className="text-[10px] sm:text-sm font-bold text-emerald-100 truncate mt-0.5">{u.name}</div>
        <HpBar cur={u.hp} max={s.maxHp} color="bg-emerald-500" />
        <div className="text-[9px] sm:text-[10px] text-zinc-300 tabular-nums">{Math.max(0, Math.ceil(u.hp))}/{s.maxHp}</div>
        <div className="text-[8px] sm:text-[10px] text-zinc-400 leading-tight mt-0.5 whitespace-nowrap truncate">
          攻{s.atk} 甲{s.armor} 暴{s.crit}% 间{(Math.max(3, Math.round(u.atkInterval / (1 + s.ias / 100))) / 10).toFixed(1)}s{s.dodge > 0 ? ` 闪${s.dodge}%` : ''}{s.lifesteal > 0 ? ` 吸${s.lifesteal}%` : ''}
        </div>
      </div>
      <div className="flex flex-col gap-1 sm:gap-1.5 w-full" data-slots={idx}>
        {u.slots.map((sl, si) => {
          // 主动技能冷却：剩余 tick 与总时长（法力吸取 -30%）
          let cdPct = 0, cdSec = 0;
          if (sl?.kind === 'skill') {
            const sk = SKILLS.find(s => s.key === sl.key);
            const rem = u.cds[sl.key] ?? 0;
            if (sk && sk.cd > 0 && rem > 0) {
              const mult = u.slots.some(x => x?.kind === 'innate' && x.key === 'manadrain') ? 0.7 : 1;
              const total = Math.max(1, Math.round(sk.cd * mult));
              cdPct = Math.min(1, rem / total);
              cdSec = rem / 10;
            }
          }
          return (
          <button
            key={si}
            data-slot-btn={`${idx}-${si}`}
            onClick={() => onSlotClick(idx, si)}
            onPointerDown={e => onSlotPointerDown(idx, si, e)}
            title={sl ? `${defOf(sl).name}：${defOf(sl).desc}${shopPhase && !targeting ? '（点击查看详情，按住拖动可换格）' : !targeting ? '（点击查看详情）' : ''}` : targeting ? '点击装到这里' : '空栏位'}
            className={`relative overflow-hidden w-full h-9 sm:h-11 rounded-md flex items-center justify-center gap-1 border text-lg sm:text-2xl transition-all touch-none select-none
              ${sl
                ? (sl.kind === 'item'
                  ? 'bg-amber-900/70 border-amber-500/70 shadow-[0_0_6px_rgba(245,158,11,.25)]'
                  : sl.kind === 'skill'
                    ? 'bg-violet-900/70 border-violet-500/70 shadow-[0_0_6px_rgba(139,92,246,.25)]'
                    : 'bg-cyan-900/70 border-cyan-500/70 shadow-[0_0_6px_rgba(34,211,238,.25)]')
                : 'bg-zinc-800/50 border-zinc-700 border-dashed'}
              ${targeting && shopPhase ? 'ring-2 ring-sky-400 animate-pulse cursor-pointer' : ''}
              ${dragOver === si ? 'ring-2 ring-amber-400 scale-105 border-amber-400' : ''}
              ${shopPhase && sl ? 'cursor-grab active:cursor-grabbing' : ''}
              ${shopPhase || sl ? 'active:scale-95' : ''}`}
          >
            {cdPct > 0 && (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 pointer-events-none" style={{ height: `${cdPct * 100}%` }} />
            )}
            {sl ? (
              <>
                <span className="relative">{defOf(sl).icon}</span>
                <span className="hidden sm:block text-[10px] text-zinc-200 truncate max-w-[70%] relative">{defOf(sl).name}</span>
              </>
            ) : <span className="text-zinc-600 text-xs">+</span>}
            {/* 计数器角标：成长性装备/技能的累计层数 */}
            {sl && (() => {
              const cd = slotCounterDef(sl);
              const n = u.slotCounters[si] ?? 0;
              if (!cd || n <= 0) return null;
              return (
                <span className={`absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-bold tabular-nums leading-tight pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,.9)] ${cd.mode === 'all' ? 'text-lime-300' : 'text-orange-300'}`}>
                  ×{n}
                </span>
              );
            })()}
            {cdPct > 0 && (
              <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-bold text-sky-200 tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,.9)] pointer-events-none">
                {cdSec.toFixed(1)}
              </span>
            )}
          </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Game() {
  const ref = useRef<State>(null as unknown as State);
  // 逻辑帧时间轴：renderTime = state.tick * 100 + 帧内插值（随速度档位平滑推进，不折返）
  const renderTimeRef = useRef(0);
  const frameTimeRef = useRef(0);
  if (!ref.current) {
    const q0 = new URLSearchParams(location.search);
    const seedParam = q0.get('seed');
    ref.current = createState(seedParam ? (parseInt(seedParam, 10) >>> 0) : ((Date.now() % 2147483647) >>> 0));
    renderTimeRef.current = 0; frameTimeRef.current = 0;
    // 无头验证钩子：?auto&ff=N 自动买装、开战并快进
    const q = q0;
    // 无头验证：?giveskill=heal,0 给英雄0装备指定技能后开战
    const gs = q.get('giveskill');
    if (gs) {
      const [key, hi] = gs.split(',');
      const st = ref.current;
      const hero = st.heroes[parseInt(hi ?? '0', 10) || 0];
      hero.slots[1] = { kind: 'skill', key };
      step(st, { type: 'nextWave' });
      const ff = parseInt(q.get('ff') ?? '0', 10);
      for (let i = 0; i < ff; i++) step(st, { type: 'tick' });
    }
    if (q.has('auto')) {
      const st = ref.current;
      for (const heroIdx of [0, 1, 2]) {
        const affordable = st.shop.findIndex(g => !g.sold && g.price <= st.gold);
        if (affordable < 0) break;
        step(st, { type: 'buyEquip', shopIdx: affordable, heroIdx, slot: 1 });
      }
      step(st, { type: 'nextWave' });
      const ff = parseInt(q.get('ff') ?? '0', 10);
      for (let i = 0; i < ff; i++) step(st, { type: 'tick' });
      // 无头验证：?opendetail=N 模拟在战斗中点开英雄0的第N格详情
      const od = q.get('opendetail');
      if (od !== null) {
        const h0 = st.heroes[0];
        let slot = parseInt(od, 10);
        if (!h0.slots[slot]) slot = h0.slots.findIndex(s => !!s);
        if (slot >= 0) (window as unknown as { __openDetail?: { heroIdx: number; slot: number } }).__openDetail = { heroIdx: 0, slot };
      }
      const waves = parseInt(q.get('waves') ?? '0', 10);
      const phase = () => (st.phase as string);
      for (let w = 0; w < waves && phase() === 'shop'; w++) {
        step(st, { type: 'nextWave' });
        for (let i = 0; i < 2000 && phase() === 'battle'; i++) step(st, { type: 'tick' });
      }
    }
  }
  const state = ref.current;
  const [, setV] = useState(0);
  // 选中的购买目标：商店商品
  const [selShop, setSelShop] = useState<number | null>(null);
  // 指针拖拽：dragRef 记录拖动状态（非受控，避免高频 setState），dragOver 做高亮
  // slot 载荷拖动物品/技能；hero 载荷拖动整列英雄调整站位
  type DragPayload =
    | { kind: 'slot'; heroIdx: number; slot: number; x: number; y: number; moved: boolean }
    | { kind: 'hero'; heroIdx: number; x: number; y: number; moved: boolean };
  const dragRef = useRef<DragPayload | null>(null);
  const draggingRef = useRef<DragPayload | null>(null); // onUp 里保存，供 click 判断是否刚拖过
  const [dragOver, setDragOver] = useState<{ heroIdx: number; slot: number } | null>(null);
  const [heroDragOver, setHeroDragOver] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ icon: string; x: number; y: number } | null>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [showSettings, setShowSettings] = useState(false);
  const [showModal, setShowModal] = useState(false); // 详细介绍弹窗（点简介栏弹出）

  const dispatch = (a: Action) => { step(state, a); setV(v => v + 1); };

  useEffect(() => {
    let acc = 0, last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(500, now - last); last = now;
      let n = 0;
      while (acc >= 100 / speedRef.current && n < 5) {
        step(ref.current, { type: 'tick' });
        acc -= 100 / speedRef.current; n++;
      }
      // 帧内插值：渲染时间 = 已完成的 tick 时刻 + 积累器余量（换算回逻辑时间）
      frameTimeRef.current = acc * speedRef.current;
      renderTimeRef.current = ref.current.tick * 100 + Math.min(100, frameTimeRef.current);
      // 战斗中持续重绘，让弹道平滑飞行
      if (n > 0 || ref.current.phase === 'battle') setV(v => v + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const targeting = selShop !== null;

  // 详情浮层：查看某个槽位的物品/技能，或英雄/小怪本体
  type Detail = { kind: 'slot'; heroIdx: number; slot: number } | { kind: 'hero'; heroIdx: number } | { kind: 'mob'; mobIdx: number } | { kind: 'shop'; shopIdx: number };
  const [detail, setDetail] = useState<Detail | null>(() => {
    const od = (window as unknown as { __openDetail?: { heroIdx: number; slot: number } }).__openDetail;
    return od ? { kind: 'slot', ...od } : null;
  });

  const clickHeroHeader = (heroIdx: number) => {
    const d = draggingRef.current;
    draggingRef.current = null;
    if (d?.kind === 'hero' && d.heroIdx === heroIdx) return; // 拖完落在自己头上，不弹详情
    if (selShop !== null) return;
    setDetail({ kind: 'hero', heroIdx }); setShowModal(false);
  };

  const clickMob = (mobIdx: number) => { setDetail({ kind: 'mob', mobIdx }); setShowModal(false); };

  const clickSlot = (heroIdx: number, slot: number) => {
    const d = draggingRef.current;
    draggingRef.current = null;
    if (d?.kind === 'slot' && d.heroIdx === heroIdx && d.slot === slot) return; // 拖完落在源格，不弹详情
    if (state.phase === 'shop' && selShop !== null) {
      dispatch({ type: 'buyEquip', shopIdx: selShop, heroIdx, slot });
      setSelShop(null);
      return;
    }
    // 战斗中也能点开查看详情（售出按钮仅在商店阶段显示）；点空格或空地关闭
    if (state.heroes[heroIdx].slots[slot]) { setDetail({ kind: 'slot', heroIdx, slot }); setShowModal(false); }
    else { setDetail(null); setShowModal(false); }
  };

  // 指针拖拽：按下记录起点，移动超阈值进入拖动，松开落在目标格则移动/交换
  const onSlotPointerDown = (heroIdx: number, slot: number, e: React.PointerEvent) => {
    if (state.phase !== 'shop' || selShop !== null) return;
    if (!state.heroes[heroIdx].slots[slot]) return;
    dragRef.current = { kind: 'slot', heroIdx, slot, x: e.clientX, y: e.clientY, moved: false };
  };

  // 拖动英雄头：调整站位（商店阶段）
  const onHeaderPointerDown = (heroIdx: number, e: React.PointerEvent) => {
    if (state.phase !== 'shop' || selShop !== null) return;
    dragRef.current = { kind: 'hero', heroIdx, x: e.clientX, y: e.clientY, moved: false };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      if (!d.moved) { d.moved = true; setDetail(null); setSelShop(null); }
      if (d.kind === 'hero') {
        const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-hero-col]') as HTMLElement | null;
        setHeroDragOver(col ? Number(col.dataset.heroCol) : null);
        setGhost({ icon: state.heroes[d.heroIdx]?.icon ?? '❓', x: e.clientX, y: e.clientY });
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot-btn]') as HTMLElement | null;
      if (el) {
        const [h, s] = (el.dataset.slotBtn ?? '-1--1').split('-').map(Number);
        setDragOver({ heroIdx: h, slot: s });
      } else setDragOver(null);
      const sl = state.heroes[d.heroIdx]?.slots[d.slot];
      setGhost(sl ? { icon: defOf(sl).icon, x: e.clientX, y: e.clientY } : null);
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      setDragOver(null);
      setHeroDragOver(null);
      if (!d || !d.moved) return;
      draggingRef.current = d; // 供随后的 click 判断是否来自拖动（仅下一次）
      if (d.kind === 'hero') {
        const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-hero-col]') as HTMLElement | null;
        if (!col) return;
        const h = Number(col.dataset.heroCol);
        if (h >= 0 && h !== d.heroIdx) dispatch({ type: 'swapHeroes', a: d.heroIdx, b: h });
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot-btn]') as HTMLElement | null;
      if (!el) return;
      const [h, s] = (el.dataset.slotBtn ?? '-1--1').split('-').map(Number);
      if (h < 0) return;
      if (h !== d.heroIdx || s !== d.slot) {
        // 两件装备叠放：配方匹配则合成，否则普通交换
        const srcSl = state.heroes[d.heroIdx]?.slots[d.slot];
        const dstSl = state.heroes[h]?.slots[s];
        if (srcSl?.kind === 'item' && dstSl?.kind === 'item' && findRecipe(srcSl.key, dstSl.key)) {
          dispatch({ type: 'combine', fromHero: d.heroIdx, fromSlot: d.slot, toHero: h, toSlot: s });
        } else {
          dispatch({ type: 'moveSlot', fromHero: d.heroIdx, fromSlot: d.slot, toHero: h, toSlot: s });
        }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [dragOver, heroDragOver, state]);

  const detailData = detail ? (() => {
    if (detail.kind === 'slot') {
      const h = state.heroes[detail.heroIdx];
      const sl = h?.slots[detail.slot];
      return sl ? { h, sl, d: defOf(sl) } : null;
    }
    if (detail.kind === 'hero') {
      const h = state.heroes[detail.heroIdx];
      return h ? { u: h } : null;
    }
    if (detail.kind === 'shop') {
      const g = state.shop[detail.shopIdx];
      if (!g) return null;
      const d = g.kind === 'item' ? ITEMS.find(x => x.key === g.key)! : SKILLS.find(x => x.key === g.key)!;
      return { g, d };
    }
    const m = state.mobs[detail.mobIdx];
    return m ? { u: m } : null;
  })() : null;


  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* 顶栏 */}
      <header className="flex items-center gap-2 sm:gap-4 px-3 py-2 bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-20 flex-wrap">
        <span className="font-black text-amber-400 text-sm sm:text-base">⚔️ 刀塔自走打怪</span>
        <span className="text-xs sm:text-sm">波次 <b className="text-red-400">{state.wave}</b></span>
        <span className="text-xs sm:text-sm">💰 <b className="text-amber-300 tabular-nums">{state.gold}</b></span>
        <span className="text-xs sm:text-sm text-zinc-400">击杀 {state.kills}</span>
        {/* 简介栏：常驻占位一整行；点击弹出详细介绍弹窗 */}
        {detailData && detail ? (
          detail.kind === 'slot' && 'sl' in detailData && detailData.sl ? (
          <button onClick={() => setShowModal(true)} title="点击查看详细介绍"
            className={`basis-full order-last flex items-center gap-2 px-3 py-2 rounded border text-xs sm:text-sm min-h-[48px] w-full text-left cursor-pointer hover:brightness-125 transition-all
            ${detailData.sl.kind === 'item' ? 'bg-amber-900/70 border-amber-500' : detailData.sl.kind === 'skill' ? 'bg-violet-900/70 border-violet-500' : 'bg-cyan-900/70 border-cyan-500'}`}>
            <span className="text-xl sm:text-2xl shrink-0">{detailData.d.icon}</span>
            <div className="flex-1 min-w-0 leading-snug">
              <div className="font-bold whitespace-nowrap truncate">{detailData.d.name}
                <span className="font-normal text-zinc-400 text-[10px] sm:text-xs">（{detailData.sl.kind === 'item' ? '装备' : detailData.sl.kind === 'skill' ? '技能' : '固有技能'} · {detailData.h.icon}{detailData.h.name}）</span>
              </div>
              <div className="text-[10px] sm:text-xs text-zinc-200/90 truncate">{detailData.d.desc}
                {(() => {
                  const cd = slotCounterDef(detailData.sl);
                  if (!cd) return null;
                  const n = detailData.h.slotCounters[detail.slot] ?? 0;
                  const v = counterValue(cd, n);
                  return <span className={cd.mode === 'all' ? 'text-lime-300/90' : 'text-orange-300/90'}>　📈×{n} +{v}</span>;
                })()}
              </div>
            </div>
            <span className="text-zinc-400 text-xs shrink-0">详情 ➤</span>
          </button>
          ) : detail.kind === 'shop' && 'g' in detailData ? (() => {
            const { g, d } = detailData as { g: Goods; d: ItemDef | SkillDef };
            return (
          <button onClick={() => setShowModal(true)} title="点击查看详细介绍"
            className={`basis-full order-last flex items-center gap-2 px-3 py-2 rounded border text-xs sm:text-sm min-h-[48px] w-full text-left cursor-pointer hover:brightness-125 transition-all
            ${g.kind === 'item' ? 'bg-amber-900/70 border-amber-500' : 'bg-violet-900/70 border-violet-500'}`}>
            <span className="text-xl sm:text-2xl shrink-0">{d.icon}</span>
            <div className="flex-1 min-w-0 leading-snug">
              <div className="font-bold whitespace-nowrap truncate">{d.name}
                <span className="font-normal text-zinc-400 text-[10px] sm:text-xs">（商店 · {g.kind === 'item' ? '装备' : '技能'} · 💰{g.price}{g.sold ? ' · 已售' : ''}）</span>
              </div>
              <div className="text-[10px] sm:text-xs text-zinc-200/90 truncate">{d.desc}</div>
            </div>
            <span className="text-zinc-400 text-xs shrink-0">详情 ➤</span>
          </button>
            );
          })() : 'u' in detailData && detailData.u ? (() => {
            const u = detailData.u;
            const isMob = detail.kind === 'mob';
            const s = isMob ? null : heroStats(u);
            return (
              <button onClick={() => setShowModal(true)} title="点击查看详细介绍"
                className={`basis-full order-last flex items-center gap-2 px-3 py-2 rounded border text-xs sm:text-sm min-h-[48px] w-full text-left cursor-pointer hover:brightness-125 transition-all
                ${isMob ? 'bg-red-950/70 border-red-600' : 'bg-emerald-950/70 border-emerald-600'}`}>
                <span className="text-xl sm:text-2xl shrink-0">{u.icon}</span>
                <div className="flex-1 min-w-0 leading-snug">
                  <div className="font-bold whitespace-nowrap truncate">{u.name}
                    <span className="font-normal text-zinc-400 text-[10px] sm:text-xs">（{isMob ? `怪物 · 赏金${u.bounty}💰` : '英雄'} · 生命 {Math.max(0, Math.ceil(u.hp))}/{isMob ? u.baseHp : s!.maxHp}）</span>
                  </div>
                  <div className="text-[10px] sm:text-xs text-zinc-200/90 truncate">
                    攻{isMob ? u.atk : s!.atk} 甲{isMob ? Math.max(0, u.armor + (u.buff?.armorDelta ?? 0)) : s!.armor} 攻速{(10 / (isMob ? (u.atkInterval ?? 10) : Math.max(3, Math.round((u.atkInterval ?? 10) / (1 + s!.ias / 100))))).toFixed(1)}/s 间隔{((isMob ? (u.atkInterval ?? 10) : Math.max(3, Math.round((u.atkInterval ?? 10) / (1 + s!.ias / 100)))) / 10).toFixed(1)}s
                  </div>
                </div>
                <span className="text-zinc-400 text-xs shrink-0">详情 ➤</span>
              </button>
            );
          })() : null
        ) : (
          <div className="basis-full order-last flex items-center gap-2 px-3 py-2 rounded border border-dashed border-zinc-700 text-xs sm:text-sm min-h-[48px] w-full text-zinc-500">
            <span className="text-xl sm:text-2xl opacity-40">🔍</span>
            <span>点击装备/技能/英雄/怪物/商店商品查看简介，再点弹出详情</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowSettings(true)}
            aria-label="设置"
            className="px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs min-h-[36px]">⚙️</button>
        </div>
      </header>

      {/* 设置弹窗：游戏速度 + 重开 */}
      {showSettings && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-xs rounded-xl bg-zinc-900 border border-zinc-700 p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-3">⚙️ 设置</div>
            <div className="mb-4">
              <div className="text-xs text-zinc-400 mb-2">游戏速度</div>
              <div className="flex gap-2">
                {[0.2, 1, 2, 4].map(s => (
                  <button key={s} onClick={() => setSpeed(s)}
                    className={`flex-1 py-2 rounded border text-sm font-bold min-h-[44px] ${speed === s ? 'bg-amber-600 border-amber-400 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}>
                    x{s}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => { if (confirm('重新开始？')) { dispatch({ type: 'restart', seed: (Date.now() % 2147483647) >>> 0 }); setSelShop(null); setDetail(null); dragRef.current = null; setGhost(null); setShowSettings(false); } }}
              className="w-full py-2 rounded bg-red-800 hover:bg-red-700 border border-red-600 text-sm font-bold min-h-[44px]">
              🔄 重新开始
            </button>
            <button onClick={() => setShowSettings(false)}
              className="w-full mt-2 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 min-h-[44px]">
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 详细介绍弹窗：点简介栏弹出 */}
      {showModal && detailData && detail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-700 p-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {detail.kind === 'shop' && 'g' in detailData ? (() => {
              const { g, d } = detailData as { g: Goods; d: ItemDef | SkillDef };
              const itD = g.kind === 'item' ? (d as ItemDef) : null;
              const skD = g.kind === 'skill' ? (d as SkillDef) : null;
              const cd = itD?.counter ?? skD?.counter;
              const asPart = g.kind === 'item' ? RECIPES.filter(r => r.parts.includes(g.key)) : [];
              const it = (key: string) => ITEMS.find(i => i.key === key);
              const afford = state.gold >= g.price && !g.sold;
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-4xl">{d.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base">{d.name}</div>
                      <div className="text-xs text-zinc-400">商店 · {g.kind === 'item' ? '装备' : '技能'} · 💰{g.price}{g.sold ? ' · 已售' : ''}</div>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300 text-lg px-2">✕</button>
                  </div>
                  <div className="text-sm text-zinc-200 leading-relaxed mb-3">{d.desc}</div>
                  {cd && (
                    <div className={`rounded-lg border p-2.5 mb-3 text-xs leading-relaxed ${cd.mode === 'all' ? 'border-lime-700 bg-lime-950/40 text-lime-200' : 'border-orange-700 bg-orange-950/40 text-orange-200'}`}>
                      <div className="font-bold mb-1">📈 {cd.label}</div>
                      <div>{cd.mode === 'wave' ? '每波开始复位' : '永久累积'}{cd.perN ? `，每${cd.perN}次触发+${cd.per}` : ''}</div>
                    </div>
                  )}
                  {asPart.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-bold text-amber-300 mb-1.5">🔨 合成配方</div>
                      <div className="flex flex-col gap-1.5">
                        {asPart.map((r, i) => {
                          const hl = (key: string) => key === g.key ? 'ring-1 ring-amber-400' : '';
                          return (
                            <div key={i} className="flex items-center gap-1.5 text-xs bg-zinc-800/70 rounded-lg px-2 py-1.5">
                              <span className={`flex items-center gap-1 rounded px-1 py-0.5 bg-amber-900/50 ${hl(r.parts[0])}`} title={it(r.parts[0])?.name}>
                                <span className="text-base">{it(r.parts[0])?.icon}</span>
                                <span className="text-zinc-200">{it(r.parts[0])?.name}</span>
                              </span>
                              <span className="text-zinc-500">+</span>
                              <span className={`flex items-center gap-1 rounded px-1 py-0.5 bg-amber-900/50 ${hl(r.parts[1])}`} title={it(r.parts[1])?.name}>
                                <span className="text-base">{it(r.parts[1])?.icon}</span>
                                <span className="text-zinc-200">{it(r.parts[1])?.name}</span>
                              </span>
                              <span className="text-amber-400 mx-0.5">→</span>
                              <span className="flex items-center gap-1 rounded px-1 py-0.5 bg-amber-800/60 font-bold" title={it(r.result)?.desc}>
                                <span className="text-base">{it(r.result)?.icon}</span>
                                <span className="text-amber-100">{it(r.result)?.name}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!g.sold && (
                    <button disabled={!afford}
                      onClick={() => { setSelShop(detail.shopIdx); setShowModal(false); }}
                      className={`w-full py-2 rounded border-2 text-sm font-bold min-h-[44px] ${afford ? 'border-sky-500 text-sky-300 hover:bg-sky-950' : 'border-zinc-700 text-zinc-500'}`}>
                      🎯 选择购买（再点英雄槽位装入）
                    </button>
                  )}
                </>
              );
            })() : detail.kind === 'slot' && 'sl' in detailData && detailData.sl ? (() => {
              const { sl, d, h } = detailData as { sl: Slot; d: ReturnType<typeof defOf>; h: Unit };
              const cd = slotCounterDef(sl);
              const n = h.slotCounters[detail.slot] ?? 0;
              const v = cd ? counterValue(cd, n) : 0;
              const statName = cd ? { atk: '攻击', maxHp: '生命', armor: '护甲', skilldmg: '技能伤害', heal: '治疗量' }[cd.stat] : '';
              const asPart = sl.kind === 'item' ? RECIPES.filter(r => r.parts.includes(sl.key)) : [];
              const it = (key: string) => ITEMS.find(i => i.key === key);
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-4xl">{d.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base">{d.name}</div>
                      <div className="text-xs text-zinc-400">{sl.kind === 'item' ? '装备' : sl.kind === 'skill' ? '技能' : '固有技能'} · 装备于 {h.icon}{h.name}</div>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300 text-lg px-2">✕</button>
                  </div>
                  <div className="text-sm text-zinc-200 leading-relaxed mb-3">{d.desc}</div>
                  {cd && (
                    <div className={`rounded-lg border p-2.5 mb-3 text-xs leading-relaxed ${cd.mode === 'all' ? 'border-lime-700 bg-lime-950/40 text-lime-200' : 'border-orange-700 bg-orange-950/40 text-orange-200'}`}>
                      <div className="font-bold mb-1">📈 {cd.label}</div>
                      <div>当前累计 ×{n}，生效 <b>+{v} {statName}</b>（{cd.mode === 'wave' ? '每波开始复位' : '永久累积'}{cd.perN ? `，每${cd.perN}次触发+${cd.per}` : ''}）</div>
                    </div>
                  )}
                  {asPart.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-bold text-amber-300 mb-1.5">🔨 合成配方</div>
                      <div className="flex flex-col gap-1.5">
                        {asPart.map((r, i) => {
                          const hl = (key: string) => key === sl.key ? 'ring-1 ring-amber-400' : '';
                          return (
                            <div key={i} className="flex items-center gap-1.5 text-xs bg-zinc-800/70 rounded-lg px-2 py-1.5">
                              <span className={`flex items-center gap-1 rounded px-1 py-0.5 bg-amber-900/50 ${hl(r.parts[0])}`} title={it(r.parts[0])?.name}>
                                <span className="text-base">{it(r.parts[0])?.icon}</span>
                                <span className="text-zinc-200">{it(r.parts[0])?.name}</span>
                              </span>
                              <span className="text-zinc-500">+</span>
                              <span className={`flex items-center gap-1 rounded px-1 py-0.5 bg-amber-900/50 ${hl(r.parts[1])}`} title={it(r.parts[1])?.name}>
                                <span className="text-base">{it(r.parts[1])?.icon}</span>
                                <span className="text-zinc-200">{it(r.parts[1])?.name}</span>
                              </span>
                              <span className="text-amber-400 mx-0.5">→</span>
                              <span className="flex items-center gap-1 rounded px-1 py-0.5 bg-amber-800/60 font-bold" title={it(r.result)?.desc}>
                                <span className="text-base">{it(r.result)?.icon}</span>
                                <span className="text-amber-100">{it(r.result)?.name}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {state.phase === 'shop' && (
                    <button
                      onClick={() => { dispatch({ type: 'unequip', heroIdx: detail.heroIdx, slot: detail.slot }); setDetail(null); setShowModal(false); }}
                      className="w-full py-2 rounded border-2 border-red-500 text-red-400 hover:bg-red-950 text-sm font-bold min-h-[44px]">
                      售出 +{slotSellPrice(sl)}💰
                    </button>
                  )}
                </>
              );
            })() : 'u' in detailData && detailData.u ? (() => {
              const u = detailData.u;
              const isMob = detail.kind === 'mob';
              const s = isMob ? null : heroStats(u);
              const rows: [string, string][] = isMob ? [
                ['生命', `${Math.max(0, Math.ceil(u.hp))} / ${u.baseHp}`],
                ['攻击', `${u.atk}`],
                ['护甲', `${Math.max(0, u.armor + (u.buff?.armorDelta ?? 0))}${u.buff?.armorDelta ? `（含减益${u.buff.armorDelta}）` : ''}`],
                ['攻击间隔', `${(u.atkInterval / 10).toFixed(1)} 秒`],
                ['攻速', `${(10 / u.atkInterval).toFixed(1)} 次/秒`],
                ['赏金', `${u.bounty}💰`],
                ...(u.stunUntil > state.tick ? [['状态', `💫眩晕 剩 ${((u.stunUntil - state.tick) / 10).toFixed(1)} 秒`] as [string, string]] : []),
              ] : [
                ['生命', `${Math.max(0, Math.ceil(u.hp))} / ${s!.maxHp}`],
                ['攻击', `${s!.atk}`],
                ['护甲', `${s!.armor}`],
                ['攻击间隔', `${(Math.max(3, Math.round(u.atkInterval / (1 + s!.ias / 100))) / 10).toFixed(1)} 秒（基础 ${(u.atkInterval / 10).toFixed(1)}）`],
                ['攻速', `${(10 / Math.max(3, Math.round(u.atkInterval / (1 + s!.ias / 100)))).toFixed(1)} 次/秒`],
                ['暴击', `${s!.crit}%（×${(s!.critMul / 100).toFixed(1)}）`],
                ...(s!.dodge > 0 ? [['闪避', `${s!.dodge}%`] as [string, string]] : []),
                ...(s!.lifesteal > 0 ? [['吸血', `${s!.lifesteal}%`] as [string, string]] : []),
                ...(s!.cleave > 0 ? [['分裂', `${s!.cleave}%`] as [string, string]] : []),
                ...(s!.regen > 0 ? [['回复', `${s!.regen}/秒`] as [string, string]] : []),
                ...(s!.thorns > 0 ? [['反弹', `${s!.thorns}%`] as [string, string]] : []),
                ...(u.stunUntil > state.tick ? [['状态', `💫眩晕 剩 ${((u.stunUntil - state.tick) / 10).toFixed(1)} 秒`] as [string, string]] : []),
              ];
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-4xl">{u.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base">{u.name}</div>
                      <div className="text-xs text-zinc-400">{isMob ? `怪物 · 第 ${state.wave} 波` : '英雄'}{!u.alive && ' · 💀已阵亡'}</div>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300 text-lg px-2">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {rows.map(([k, val]) => (
                      <div key={k} className="rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-xs flex justify-between">
                        <span className="text-zinc-400">{k}</span><span className="font-bold text-zinc-100">{val}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })() : null}
          </div>
        </div>
      )}

      <main className="flex-1 px-2 sm:px-4 py-3 max-w-5xl w-full mx-auto">
        {/* 战场（怪物+英雄）+ 弹道特效层 */}
        <div className="relative">
        {/* 敌方阵营 */}
        <div className="text-[10px] text-red-400/70 mb-1">敌方阵营{state.phase === 'shop' && '（整顿完毕后将出现下一波）'}</div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {state.mobs.length === 0
            ? <div className="col-span-5 text-center text-zinc-600 py-3 text-sm rounded-lg border border-zinc-800 bg-zinc-900/40">👻 暂无怪物</div>
            : state.mobs.map((m, i) => <MobCard key={`m${state.wave}-${i}`} u={m} idx={i} state={state} onClick={clickMob} />)}
        </div>

        {/* 分隔线 */}
        <div className="border-t border-dashed border-zinc-700 my-2 sm:my-3 relative">
          <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-950 px-3 text-xs text-zinc-400">
            {state.phase === 'battle' ? '⚔️ 激战中' : selShop !== null ? '🎯 已选中商品，点英雄槽位购买装入' : '🏕️ 休整中 — 点商品看简介，双击商品选中后再点槽位装入；按住物品拖动可换格/合成'}
          </span>
        </div>

        {/* 5×5 装备矩阵 —— 主视觉 */}
        <div className="rounded-xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 p-2 sm:p-3">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
            {state.heroes.map((h, i) => (
              <HeroColumn key={h.key} u={h} idx={i} state={state} targeting={targeting} onSlotClick={clickSlot}
                onHeaderClick={clickHeroHeader}
                onSlotPointerDown={onSlotPointerDown}
                onHeaderPointerDown={onHeaderPointerDown}
                heroDrop={heroDragOver === i}
                dragOver={dragOver?.heroIdx === i ? dragOver.slot : null} />
            ))}
          </div>
        </div>

        {/* 弹道特效层：飞行光点 + 短尾迹，~0.4s 从攻击者飞到目标 */}
        {state.phase === 'battle' && state.atkFx.length > 0 && (() => {
          // 每条弹道飞行时长不同：逻辑格子距离 / 弹道速度（见 sim PROJECTILE_SPEED）
          const freeze = new URLSearchParams(location.search).has('freeze');
          // 进度基准：渲染时间戳 - 发射帧时间戳（逻辑帧时间轴，与速度档位无关，不折返）
          const rt = renderTimeRef.current;
          return (
            <svg className="pointer-events-none absolute inset-0 z-20 w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
              {state.atkFx.map(fx => {
                const x1 = (fx.fromIdx + 0.5) * 200;
                const x2 = (fx.toIdx + 0.5) * 200;
                // 英雄侧：普攻从头像(y=350)出发；技能从对应槽位出发（槽位区 350→1000 均分5行）
                const slotY = (si: number) => 350 + (si + 0.5) * 130;
                const y1 = fx.fromSide === 'mob' ? 140 : (fx.fromSlot != null ? slotY(fx.fromSlot) : 350);
                const y2 = fx.toSide === 'mob' ? 140 : 350;
                const elapsed = freeze ? 200 : rt - fx.tick * 100;
                const p = Math.min(1, Math.max(0, elapsed / (fx.fly * 100)));
                if (p >= 1 && !freeze) return null;
                const cx = x1 + (x2 - x1) * p;
                const cy = y1 + (y2 - y1) * p;
                // 尾迹起点（滞后一小段）
                const tp = Math.max(0, p - 0.18);
                const tx = x1 + (x2 - x1) * tp;
                const ty = y1 + (y2 - y1) * tp;
                const color = ({ finger: '#f472b6', nova: '#67e8f9', heal: '#4ade80', skill: '#c084fc', crit: '#fb923c' } as Record<string, string>)[fx.cls] ?? '#facc15';
                const r = ({ finger: 22, nova: 18, heal: 18, skill: 20, crit: 16 } as Record<string, number>)[fx.cls] ?? 11;
                return (
                  <g key={fx.id}>
                    <line x1={tx} y1={ty} x2={cx} y2={cy} stroke={color} strokeWidth={r * 0.55} strokeLinecap="round" opacity="0.55" />
                    <circle cx={cx} cy={cy} r={r} fill={color} opacity="0.95" />
                    <circle cx={cx} cy={cy} r={r * 0.45} fill="#fff" opacity="0.9" />
                  </g>
                );
              })}
            </svg>
          );
        })()}
        </div>

        {/* 商店 */}
        {state.phase === 'shop' && (
          <div className="mt-3 rounded-xl bg-zinc-900 border border-zinc-800 p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-bold text-amber-300 text-sm">🛒 商店</span>
              <button onClick={() => { dispatch({ type: 'refresh' }); setSelShop(null); dragRef.current = null; setGhost(null); }}
                className="px-2 py-1.5 rounded bg-zinc-800 border border-zinc-600 text-xs min-h-[36px] active:bg-zinc-700">
                🎲 刷新（{REFRESH_COST}金）
              </button>
              <button onClick={() => { dispatch({ type: 'nextWave' }); setSelShop(null); dragRef.current = null; setGhost(null); }}
                className="ml-auto px-4 py-2 rounded bg-red-700 hover:bg-red-600 active:bg-red-500 font-bold text-sm min-h-[44px]">
                ⚔️ 开战（第 {state.wave} 波）
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {state.shop.map((g, i) => {
                const d = g.kind === 'item' ? ITEMS.find(x => x.key === g.key)! : SKILLS.find(x => x.key === g.key)!;
                const afford = state.gold >= g.price;
                return (
                  <button key={i} disabled={g.sold}
                    onClick={() => { setDetail({ kind: 'shop', shopIdx: i }); setShowModal(false); dragRef.current = null; setGhost(null); }}
                    onDoubleClick={() => { if (!g.sold && afford) { setSelShop(selShop === i ? null : i); setShowModal(false); } }}
                    className={`rounded-lg border p-1.5 text-left h-20 sm:h-24 overflow-hidden transition-all active:scale-95
                      ${g.sold ? 'opacity-30' : afford ? 'border-amber-700/50 bg-zinc-800/80 active:bg-zinc-700' : 'border-zinc-800 bg-zinc-900 opacity-50'}
                      ${selShop === i ? 'ring-2 ring-sky-400 border-sky-500 scale-[1.02]' : ''}`}>
                    <div className="flex items-center gap-1">
                      <span className="text-lg">{d.icon}</span>
                      <span className="text-[11px] sm:text-xs font-bold truncate">{d.name}</span>
                    </div>
                    <div className="text-[9px] text-zinc-400 leading-tight line-clamp-2">{d.desc}</div>
                    <div className="text-[10px] text-amber-300 font-bold">{g.sold ? '已售' : `💰${g.price}`}{g.kind === 'skill' ? ' · 技能' : ''}</div>
                  </button>
                );
              })}
            </div>
            {selShop !== null && (
              <div className="mt-2 text-xs text-sky-300 flex items-center gap-2">
                🎯 已选中商品，点击任意英雄槽位购买装入（替换旧物自动折现）
                <button onClick={() => setSelShop(null)} className="px-2 py-1 rounded bg-zinc-800 text-xs min-h-[32px]">取消</button>
              </div>
            )}
          </div>
        )}

        {/* 战败 */}
        {state.phase === 'over' && (
          <div className="mt-3 rounded-xl bg-red-950/60 border border-red-800 p-6 text-center">
            <div className="text-3xl mb-2">💀</div>
            <div className="font-bold text-lg">团灭！止步第 {state.wave} 波</div>
            <div className="text-sm text-zinc-400 mt-1">击杀 {state.kills} 只怪物</div>
            <button onClick={() => { dispatch({ type: 'restart', seed: (Date.now() % 2147483647) >>> 0 }); setSelShop(null); }}
              className="mt-4 px-6 py-3 rounded bg-amber-600 hover:bg-amber-500 font-bold min-h-[44px]">🔄 再来一局</button>
          </div>
        )}

        {/* 日志 */}
        <div className="mt-3 rounded-xl bg-zinc-900/60 border border-zinc-800 p-2 max-h-32 overflow-y-auto">
          {[...state.log].reverse().map((l, i) => (
            <div key={i} className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed">{l}</div>
          ))}
        </div>
      </main>

      {/* 拖动中的跟随图标 */}
      {ghost && (
        <div className="fixed z-50 pointer-events-none text-3xl -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}>
          {ghost.icon}
        </div>
      )}
    </div>
  );
}

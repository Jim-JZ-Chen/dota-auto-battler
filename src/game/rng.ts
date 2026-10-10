// 确定性 PRNG：mulberry32，状态可序列化（一个 uint32）
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    // 0..1
    f: next,
    // [min, max] 整数
    i: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    // 概率判定
    p: (chance: number) => next() < chance,
    state: () => a >>> 0,
  };
}
export type Rng = ReturnType<typeof mulberry32>;

# 刀塔自走打怪 (Dota Auto Battler)

Dota2 风格的自走棋网页游戏：5 随机英雄 × 5 格子自由搭配装备与技能，怪物波次进攻，掉落直接入格，商店经济 + 装备合成。

## 技术

- React + TypeScript + Vite + Tailwind
- 确定性 10 TPS（100ms tick）模拟：所有状态变更经由 `step(state, action)`，种子化 PRNG，无 Math.random/Date.now
- 弹道系统：恒定速度 + 逻辑格子距离计算飞行时长，命中后结算伤害/治疗/debuff
- 指针拖拽：物品/技能拖格、装备互拖合成、英雄拖动调整站位

## 运行

```bash
npm install
npm run dev
```

构建：`npm run build`（输出 dist/）。package-lock.json 未入库，`npm install` 会重新生成。

## 玩法

- 休整期买装备/技能装入英雄格子，两件装备互拖按配方合成（比直接买成品省钱）
- 点商品 → 点槽位装入；按住物品拖动换格；按住英雄头像拖动调整站位
- 点击英雄/小怪/槽位查看详情；商店阶段可售出
- 波次间商店阶段调整，点「开战」进入下一波

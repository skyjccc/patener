// 无尽模式「岩浆攀爬」:种子确定性生成一座高塔,双机用同一种子生成相同关卡
import { TILE } from './constants.js';
import { THEMES } from './themes.js';
import { T_SOLID, T_ONEWAY, T_ICE } from './level.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generateEndless(seed = 12345) {
  const rng = mulberry32(seed);
  const w = 22, h = 220;
  const grid = new Uint8Array(w * h);
  const G_ = (x, y) => y * w + x;
  for (let y = 0; y < h; y++) { grid[G_(0, y)] = T_SOLID; grid[G_(w - 1, y)] = T_SOLID; }
  for (let x = 0; x < w; x++) for (let y = h - 3; y < h; y++) grid[G_(x, y)] = T_SOLID;

  const objects = [], springs = [], gems = [];
  let cx = Math.floor(w / 2) - 1;
  let row = h - 6;
  let i = 0;

  while (row > 14) {
    const climb = 1 - row / h;            // 0(底)→1(顶) 难度递增
    const dy = 3 + (rng() < 0.22 + climb * 0.22 ? 1 : 0) + (rng() < climb * 0.1 ? 1 : 0);
    row -= dy;
    cx = Math.max(2, Math.min(w - 5, Math.round(cx + (rng() * 2 - 1) * (3 + climb * 1.6))));
    const roll = rng();

    if (i % 15 === 14) {
      // 安全岛:宽实体平台(重生锚点)
      for (let k = -2; k <= 2; k++) grid[G_(cx + k, row)] = T_SOLID;
      if (rng() < 0.8) gems.push({ x: (cx + 0.5) * TILE, y: (row - 1.2) * TILE, taken: false, t: 0 });
    } else if (roll < 0.09) {
      // 蹦床
      grid[G_(cx, row)] = T_SOLID;
      springs.push({ x: cx * TILE, y: (row - 1) * TILE, t: 0, kind: 'tramp', charge: 0, lastBounce: -9 });
    } else if (roll < 0.17) {
      // 普通弹簧(逃命神器)
      grid[G_(cx, row)] = T_SOLID;
      springs.push({ x: cx * TILE, y: (row - 1) * TILE, t: 0, kind: 'spring' });
    } else if (roll < 0.28) {
      // 薄板
      grid[G_(cx, row)] = T_ONEWAY;
      grid[G_(cx + 1, row)] = T_ONEWAY;
    } else if (roll < 0.38 + climb * 0.14) {
      // 冰面(越高越多)
      grid[G_(cx, row)] = T_ICE;
      grid[G_(cx + 1, row)] = T_ICE;
    } else if (roll < 0.48 + climb * 0.12) {
      // 巡逻平台
      objects.push({ type: 'platform', x: cx, y: row, w: 2, dx: 2 + Math.floor(rng() * 3), dy: 0, period: 2.6 + rng() * 1.6, phase: rng() });
    } else if (roll < 0.55 + climb * 0.1) {
      // 平台 + 电锯邻居
      grid[G_(cx, row)] = T_SOLID;
      grid[G_(cx + 1, row)] = T_SOLID;
      objects.push({ type: 'saw', x: cx + (rng() < 0.5 ? -2 : 3), y: row - 1, dx: 1, dy: 0, period: 2.1 + rng(), phase: rng() });
    } else if (roll < 0.62 + climb * 0.08) {
      // 平台 + 火焰喷口
      grid[G_(cx, row)] = T_SOLID;
      grid[G_(cx + 1, row)] = T_SOLID;
      objects.push({ type: 'flame', x: cx + 1, y: row - 1, len: 2, period: 2.3 + rng() * 1.2, phase: rng() });
    } else {
      // 普通实体平台
      const pw = 2 + (rng() < 0.4 ? 1 : 0);
      for (let k = 0; k < pw; k++) grid[G_(cx + k, row)] = T_SOLID;
    }

    if (rng() < 0.3) gems.push({ x: (cx + 1) * TILE, y: (row - 1.4) * TILE, taken: false, t: 0 });
    i++;
  }

  // 塔顶:登顶平台 + 终点
  row -= 3;
  for (let k = 8; k < 14; k++) grid[G_(k, row)] = T_SOLID;
  const exit = { x: 10 * TILE, y: (row - 2) * TILE, w: 2 * TILE, h: 3 * TILE };
  gems.push({ x: 9 * TILE, y: (row - 1.4) * TILE, taken: false, t: 0 });
  gems.push({ x: 12.5 * TILE, y: (row - 1.4) * TILE, taken: false, t: 0 });

  return {
    idx: -1, name: '岩浆攀爬', themeKey: 'volcano', theme: THEMES.volcano,
    w, h, pw: w * TILE, ph: h * TILE, grid, doorH: 3,
    spawns: [
      { x: 10 * TILE, y: (h - 3) * TILE },
      { x: 12 * TILE, y: (h - 3) * TILE },
    ],
    doors: [], plates: [], levers: [], springs, boxes: [], checkpoints: [],
    gems, cracked: [], hints: [], objects, exit,
    endless: true, doorH2: undefined,
  };
}

// 无尽模式「岩浆攀爬」:种子确定性生成一座高塔,双机用同一种子生成相同关卡
// 可玩性铁律(每一跳两个角色都能独立完成):
//   1. 垂直只跳 2~3 格,面向间隙 1~3 格(可读的可见跳跃)
//   2. 与下方 4 行内的平台重叠/贴脸时,自动转为「单向薄板」——从下方可跳穿,
//      物理上杜绝撞头落缝;火焰台后一跳禁止大跳/远跳
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
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// 两段平台(左段 [a, a+aw) 右段 [b, b+bw))的面向空隙(格,重叠为负)
function facingGap(ax, aw, bx, bw) {
  if (ax >= bx + bw) return ax - (bx + bw - 1) - 1;
  if (ax + aw - 1 <= bx) return bx - (ax + aw - 1) - 1;
  return -1;
}

export function generateEndless(seed = 12345) {
  const rng = mulberry32(seed);
  const w = 22, h = 220;
  const grid = new Uint8Array(w * h);
  const G_ = (x, y) => y * w + x;
  for (let y = 0; y < h; y++) { grid[G_(0, y)] = T_SOLID; grid[G_(w - 1, y)] = T_SOLID; }
  for (let x = 0; x < w; x++) for (let y = h - 3; y < h; y++) grid[G_(x, y)] = T_SOLID;

  const objects = [], springs = [], gems = [];
  const placedAll = [{ x: 8, w: 6, row: h - 3 }];  // 出生地面
  let row = h - 5;                                 // 第一阶在地面上方 2 格
  let prevNx = 9, prevW = 5;                       // 以出生地面为基准
  let flameNext = false;                           // 上一台有火焰:下一跳禁止大跳/远跳
  let i = 0;

  while (row > 14) {
    const climb = 1 - row / h;                     // 0(底)→1(顶) 难度递增
    const dy = flameNext ? 2 : (rng() < 0.7 ? 2 : 3);
    row -= dy;
    const roll = rng();

    // ---- 类型与宽度(前 3 阶强制宽实心,开局友好) ----
    let kind = 'solid', width = 2 + (rng() < 0.5 ? 1 : 0), obj = null;
    if (i < 3) {
      width = 3 + Math.min(i, 2);                  // 3/4/4 宽
    } else if (i % 12 === 11) {
      width = 5;                                   // 安全岛(重生锚点)
    } else if (roll < 0.08) {
      width = 2; obj = { tramp: true };            // 蹦床座
    } else if (roll < 0.15) {
      width = 2; obj = { spring: true };           // 弹簧座
    } else if (roll < 0.28) {
      kind = 'oneway'; width = 2 + (rng() < 0.5 ? 1 : 0);
    } else if (roll < 0.38 + climb * 0.1) {
      kind = 'ice'; width = 3;
    } else if (roll < 0.47 + climb * 0.1) {
      kind = 'platform'; width = 2; obj = { dx: 2, period: 2.8 + rng() * 1.4 };
    } else if (roll < 0.55 + climb * 0.08) {
      width = 3; obj = { saw: true };
    } else if (roll < 0.63 + climb * 0.06) {
      width = 4; obj = { flame: true };            // 火焰居中,两侧安全
    }

    // ---- 定位:与上一阶的面向间隙 1~3 格(可读跳跃) ----
    const half = (width + prevW) / 2;
    const maxG = flameNext ? 1 : 2;
    let nx = 1;
    for (let a = 0; a < 10; a++) {
      const dir = rng() < 0.5 ? -1 : 1;
      const x = clamp(Math.round(prevNx + prevW / 2 + dir * (half + 1 + rng() * maxG) - width / 2), 1, w - 1 - width);
      const gp = facingGap(x, width, prevNx, prevW);
      if (gp >= 1 && gp <= maxG + 1) { nx = x; break; }
      if (a === 9) {                               // 兜底:紧贴上一阶留 1 格
        const dir2 = prevNx < w / 2 ? 1 : -1;
        nx = clamp(dir2 > 0 ? prevNx + prevW + 1 : prevNx - width - 1, 1, w - 1 - width);
      }
    }
    const cx = nx + width / 2;

    // ---- 头顶净空:与下方 4 行内的平台重叠/贴脸 → 改为单向薄板(可跳穿,杜绝撞头) ----
    for (const e of placedAll) {
      if (e.row - row >= 1 && e.row - row <= 4 && facingGap(nx, width, e.x, e.w) < 1) {
        if (kind !== 'oneway') { kind = 'oneway'; obj = null; }
        break;
      }
    }

    // ---- 铺设 ----
    for (let k = 0; k < width; k++) {
      grid[G_(nx + k, row)] = kind === 'solid' ? T_SOLID : kind === 'oneway' ? T_ONEWAY : T_ICE;
    }
    if (kind !== 'oneway') {
      if (obj?.tramp) springs.push({ x: nx * TILE, y: (row - 1) * TILE, t: 0, kind: 'tramp', charge: 0, lastBounce: -9 });
      if (obj?.spring) springs.push({ x: nx * TILE, y: (row - 1) * TILE, t: 0, kind: 'spring' });
      if (obj?.dx) objects.push({ type: 'platform', x: nx, y: row, w: 2, dx: obj.dx, dy: 0, period: obj.period, phase: rng() });
      if (obj?.saw) {
        const side = rng() < 0.5 ? -1 : 1;
        objects.push({ type: 'saw', x: side < 0 ? nx - 3 : nx + width + 1, y: row - 1, dx: 1, dy: 0, period: 2.2 + rng(), phase: rng() });
      }
      if (obj?.flame) objects.push({ type: 'flame', x: nx + 1, y: row - 1, len: 2, period: 2.4 + rng() * 1.2, phase: rng() });
    }
    if (i % 12 === 11 && rng() < 0.8) gems.push({ x: cx * TILE, y: (row - 1.2) * TILE, taken: false, t: 0 });
    if (rng() < 0.26) gems.push({ x: (cx + (rng() - 0.5)) * TILE, y: (row - 1.4) * TILE, taken: false, t: 0 });

    placedAll.push({ x: nx, w: width, row });
    prevNx = nx; prevW = width;
    flameNext = !!obj?.flame && kind !== 'oneway';
    i++;
  }

  // 塔顶:登顶大平台(横跨大部分井宽)+ 终点
  row -= 3;
  for (let k = 6; k <= 15; k++) grid[G_(k, row)] = T_SOLID;
  const exit = { x: 10 * TILE, y: (row - 2) * TILE, w: 2 * TILE, h: 3 * TILE };
  gems.push({ x: 8 * TILE, y: (row - 1.4) * TILE, taken: false, t: 0 });
  gems.push({ x: 13 * TILE, y: (row - 1.4) * TILE, taken: false, t: 0 });

  return {
    idx: -1, name: '岩浆攀爬', themeKey: 'volcano', theme: THEMES.volcano,
    w, h, pw: w * TILE, ph: h * TILE, grid, doorH: 3,
    spawns: [
      { x: 10 * TILE, y: (h - 3) * TILE },
      { x: 12 * TILE, y: (h - 3) * TILE },
    ],
    doors: [], plates: [], levers: [], springs, boxes: [], checkpoints: [],
    gems, cracked: [], hints: [], objects, exit,
    endless: true,
  };
}

// 关卡解析:ASCII → 瓦片网格 + 实体清单,并预渲染静态地形层
import { LEVELS } from './levels.js';
import { THEMES } from './themes.js';
import { TILE } from './constants.js';
import { roundedRect, hash2 } from '../core/utils.js';

export const T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_CRACK = 3, T_SPIKE = 4, T_ICE = 5;

export function levelCount() { return LEVELS.length; }
export function levelMeta(i) { const lv = LEVELS[i]; return { name: lv.name, hint: lv.hint, theme: THEMES[lv.theme] }; }

export function parseLevel(idx) {
  const def = LEVELS[idx];
  const rows = def.map;
  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;
  const grid = new Uint8Array(w * h);
  const out = {
    idx, name: def.name, themeKey: def.theme, theme: THEMES[def.theme],
    w, h, pw: w * TILE, ph: h * TILE,
    grid, doorH: def.doorH || 3,
    spawns: [null, null], doors: [], plates: [], levers: [], springs: [],
    boxes: [], checkpoints: [], gems: [], cracked: [], hints: [],
    objects: def.objects || [], exit: null,
  };

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x] || '.';
      const px = x * TILE, py = y * TILE;
      switch (ch) {
        case '#': grid[y * w + x] = T_SOLID; break;
        case '=': grid[y * w + x] = T_ONEWAY; break;
        case '%': grid[y * w + x] = T_CRACK; out.cracked.push({ x: px, y: py, tx: x, ty: y, gone: false }); break;
        case '^': grid[y * w + x] = T_SPIKE; break;
        case '~': grid[y * w + x] = T_ICE; break;
        case '1': out.spawns[0] = { x: px + TILE / 2, y: py + TILE }; break;
        case '2': out.spawns[1] = { x: px + TILE / 2, y: py + TILE }; break;
        case 'O': out.boxes.push({ x: px + 2, y: py + TILE - 30, w: 28, h: 30 }); break;
        case 'J': out.springs.push({ x: px, y: py, t: 0, kind: 'spring' }); break;
        case 'K': out.springs.push({ x: px, y: py, t: 0, kind: 'tramp', charge: 0, lastBounce: -9 }); break;
        case 'a': case 'b': case 'c': out.plates.push({ x: px, y: py, channel: ch, t: 0 }); break;
        case 'A': case 'B': case 'C': case 'D': out.doors.push({ x: px, y: py, channel: ch.toLowerCase(), h: (def.doorH || 3) * TILE, open: 0 }); break;
        case 'l': case 'k': case 'm': case 'n': out.levers.push({ x: px, y: py, channel: { l: 'a', k: 'b', m: 'c', n: 'd' }[ch], on: false, t: 0 }); break;
        case 'F': out.checkpoints.push({ x: px, y: py, active: false, t: 0 }); break;
        case 'G': out.gems.push({ x: px + TILE / 2, y: py + TILE / 2, taken: false, t: 0 }); break;
        case 'E': out.exit = { x: px, y: py - 2 * TILE, w: 2 * TILE, h: 3 * TILE }; break;
      }
    }
  }
  if (!out.spawns[0] || !out.spawns[1] || !out.exit) throw new Error(`关卡 ${idx + 1} 缺少出生点或终点`);
  return out;
}

// ---------- 静态地形预渲染(圆角瓦片 + 草皮 + 斑点) ----------
export function buildStaticLayer(level) {
  const cv = document.createElement('canvas');
  cv.width = level.pw; cv.height = level.ph;
  const c = cv.getContext('2d');
  const { theme, w, h, grid } = level;
  const t = theme.tile;
  const solidAt = (x, y) => {
    if (x < 0 || x >= w || y < 0) return true; // 地图外视为实心(边缘不画圆角)
    if (y >= h) return false;
    const code = grid[y * w + x];
    return code === T_SOLID || code === T_CRACK || code === T_ICE;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const code = grid[y * w + x];
      const px = x * TILE, py = y * TILE;
      if (code === T_SOLID) {
        const up = solidAt(x, y - 1), dn = solidAt(x, y + 1);
        const lf = solidAt(x - 1, y), rt = solidAt(x + 1, y);
        // 圆角:只在两侧都悬空的角
        const rTL = (!up && !lf) ? 7 : 0, rTR = (!up && !rt) ? 7 : 0;
        const rBL = (!dn && !lf) ? 7 : 0, rBR = (!dn && !rt) ? 7 : 0;
        c.fillStyle = t.base;
        if (rTL || rTR || rBL || rBR) {
          c.beginPath();
          c.moveTo(px + (rTL ? 7 : 0), py);
          c.lineTo(px + TILE - (rTR ? 7 : 0), py);
          if (rTR) c.arcTo(px + TILE, py, px + TILE, py + 7, 7);
          c.lineTo(px + TILE, py + TILE - (rBR ? 7 : 0));
          if (rBR) c.arcTo(px + TILE, py + TILE, px + TILE - 7, py + TILE, 7);
          c.lineTo(px + (rBL ? 7 : 0), py + TILE);
          if (rBL) c.arcTo(px, py + TILE, px, py + TILE - 7, 7);
          c.lineTo(px, py + (rTL ? 7 : 0));
          if (rTL) c.arcTo(px, py, px + 7, py, 7);
          c.closePath(); c.fill();
        } else {
          c.fillRect(px, py, TILE, TILE);
        }
        // 顶面草皮/雪盖
        if (!up) {
          c.fillStyle = t.top;
          roundedRect(c, px - (lf ? 0 : 2), py, TILE + (lf ? 0 : 2) + (rt ? 0 : 2), 11, 4);
          c.fill();
          c.fillStyle = t.topDeep;
          c.fillRect(px, py + 9, TILE, 3);
        }
        // 侧缘阴影
        if (!lf) { c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(px, py + (up ? 0 : 8), 3, TILE - (up ? 0 : 8)); }
        if (!rt) { c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(px + TILE - 3, py + (up ? 0 : 8), 3, TILE - (up ? 0 : 8)); }
        // 斑点装饰
        const n = Math.floor(hash2(x, y) * 3);
        c.fillStyle = t.speck;
        for (let k = 0; k < n; k++) {
          const hx = hash2(x * 3 + k, y * 7 + k), hy = hash2(x * 13 + k, y * 5 + k);
          c.fillRect(px + 6 + hx * 20, py + 14 + hy * 14, 3 + hx * 2, 2);
        }
      } else if (code === T_ONEWAY) {
        // 薄板
        c.fillStyle = theme.name === 'cave' ? '#8a7a5a' : t.edge;
        roundedRect(c, px, py + 2, TILE, 9, 4); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.28)';
        roundedRect(c, px + 2, py + 3, TILE - 4, 3, 2); c.fill();
      } else if (code === T_SPIKE) {
        // 地刺(贴着格子底部)
        c.fillStyle = '#c9cedd';
        for (let k = 0; k < 4; k++) {
          const sx = px + k * 8;
          c.beginPath();
          c.moveTo(sx + 0.5, py + TILE);
          c.lineTo(sx + 4, py + 10);
          c.lineTo(sx + 7.5, py + TILE);
          c.closePath(); c.fill();
        }
        c.fillStyle = '#8f94a8';
        c.fillRect(px, py + TILE - 4, TILE, 4);
      } else if (code === T_ICE) {
        // 冰面
        const up = solidAt(x, y - 1), dn = solidAt(x, y + 1);
        const lf = solidAt(x - 1, y), rt = solidAt(x + 1, y);
        c.fillStyle = '#8ec7dd';
        c.fillRect(px, py, TILE, TILE);
        // 光泽条纹
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.beginPath();
        c.moveTo(px + 5, py + TILE - 4);
        c.lineTo(px + 16, py + 5);
        c.lineTo(px + 21, py + 5);
        c.lineTo(px + 10, py + TILE - 4);
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.28)';
        c.beginPath();
        c.moveTo(px + 20, py + TILE - 4);
        c.lineTo(px + 27, py + 5);
        c.lineTo(px + 29, py + 5);
        c.lineTo(px + 22, py + TILE - 4);
        c.closePath(); c.fill();
        // 顶面高光
        if (!up) {
          c.fillStyle = '#d9f2fb';
          c.fillRect(px, py, TILE, 4);
        }
        if (!lf) { c.fillStyle = 'rgba(30,80,110,0.18)'; c.fillRect(px, py, 2, TILE); }
        if (!rt) { c.fillStyle = 'rgba(30,80,110,0.18)'; c.fillRect(px + TILE - 2, py, 2, TILE); }
      }
    }
  }
  return cv;
}

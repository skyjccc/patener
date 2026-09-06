// 实体:木箱 / 门 / 升降平台 / 电锯 + 各机关的绘制
import { TILE } from './constants.js';
import { damp, roundedRect, TAU, clamp } from '../core/utils.js';

// ---------------- 木箱 ----------------
export class Box {
  constructor(x, y) { this.x = x; this.y = y; this.w = 28; this.h = 30; this.vx = 0; this.vy = 0; this.grounded = false; this.riding = null; this.isBoxLike = true; this.seesawRef = null; }
  get cx() { return this.x + this.w / 2; }
  update(world, dt) {
    this.vy = Math.min(this.vy + 2300 * dt, 900);
    world.moveBox(this, dt);
  }
  draw(ctx, time) {
    const { x, y, w, h } = this;
    ctx.fillStyle = '#b07a3e';
    roundedRect(ctx, x, y, w, h, 5); ctx.fill();
    ctx.fillStyle = '#93612c';
    ctx.fillRect(x + 3, y + h / 2 - 2, w - 6, 4);
    ctx.strokeStyle = '#82502169'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(255,235,200,0.35)';
    ctx.fillRect(x + 3, y + 3, w - 6, 3);
  }
}

// ---------------- 门(通道触发,向上收起) ----------------
export class Door {
  constructor(x, y, h, channel) {
    this.x = x; this.y = y; this.w = TILE; this.h = h;
    this.channel = channel; this.open = 0; this.wasOpen = false;
  }
  get solid() { return this.open < 0.55; }
  update(world, dt) {
    const active = world.channelActive(this.channel);
    this.open = damp(this.open, active ? 1 : 0, 8, dt);
    this.active = active;
    if (active !== this.wasOpen) { this.wasOpen = active; world.onDoorToggle(active); }
  }
  draw(ctx, time) {
    const { x, y, w, h } = this;
    const lift = this.open * (h - 10);
    // 门框
    ctx.fillStyle = '#3c4258';
    ctx.fillRect(x - 3, y - 6, w + 6, 8);
    ctx.fillRect(x - 3, y + h - 4, w + 6, 5);
    // 门体(向上收)
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y - h, w + 1, h * 2 + 6); ctx.clip();
    const colors = { a: '#ffb84d', b: '#5ad0ff', c: '#b58aff', d: '#7ef0a8' };
    ctx.fillStyle = '#494f68';
    ctx.fillRect(x, y - lift, w, h);
    ctx.fillStyle = colors[this.channel] || '#8ad';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 5 + i * 9, y - lift + 4, 4, h - 8);
    ctx.restore();
    // 通道指示灯
    ctx.fillStyle = this.active ? '#7ef0c9' : '#2c3147';
    ctx.beginPath(); ctx.arc(x + w / 2, y - 2, 3, 0, TAU); ctx.fill();
  }
}

// ---------------- 移动平台(巡逻 / 机关升降) ----------------
export class MovingPlatform {
  constructor(o) {
    this.x0 = o.x * TILE; this.y0 = o.y * TILE;
    this.w = (o.w || 2) * TILE; this.h = 13;
    this.ax = (o.dx || 0) * TILE; this.ay = (o.dy || 0) * TILE;
    this.period = o.period || 3; this.phase = o.phase || 0;
    this.trigger = o.trigger || null;
    this.x = this.x0; this.y = this.y0;
    this.deltaX = 0; this.deltaY = 0; this.t = 0;
  }
  update(world, dt) {
    this.t += dt;
    let nx = this.x0, ny = this.y0;
    if (this.trigger) {
      // 机关升降:激活时匀速移向目标,否则匀速返回
      const target = world.channelActive(this.trigger) ? 1 : 0;
      this.prog = clamp((this.prog ?? 0) + (target - (this.prog ?? 0) > 0 ? 1 : -1) * dt / (Math.abs(this.ay) / 150 + 0.4), 0, 1);
      ny = this.y0 + this.ay * this.prog;
      nx = this.x0 + this.ax * this.prog;
    } else {
      const s = Math.sin(this.t * TAU / this.period + this.phase) * 0.5 + 0.5;
      nx = this.x0 + this.ax * s;
      ny = this.y0 + this.ay * s;
    }
    this.deltaX = nx - this.x; this.deltaY = ny - this.y;
    this.x = nx; this.y = ny;
  }
  get top() { return this.y; }
  draw(ctx, time) {
    const { x, y, w, h } = this;
    ctx.fillStyle = '#59617f';
    roundedRect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = '#8a93b5';
    roundedRect(ctx, x + 3, y + 2, w - 6, 4, 2); ctx.fill();
    // 铆钉
    ctx.fillStyle = '#3d445e';
    ctx.beginPath(); ctx.arc(x + 7, y + h / 2, 2, 0, TAU); ctx.arc(x + w - 7, y + h / 2, 2, 0, TAU); ctx.fill();
    if (this.trigger) { // 机关标识
      ctx.fillStyle = '#ffd23d';
      ctx.fillRect(x + w / 2 - 2, y - 6, 4, 6);
    }
  }
}

// ---------------- 电锯 ----------------
export class Saw {
  constructor(o) {
    this.x0 = o.x * TILE + TILE / 2; this.y0 = o.y * TILE + TILE / 2;
    this.ax = (o.dx || 0) * TILE; this.ay = (o.dy || 0) * TILE;
    this.period = o.period || 3; this.phase = (o.phase || 0) * TAU;
    this.x = this.x0; this.y = this.y0; this.angle = 0; this.t = 0;
    this.r = 24;
  }
  update(world, dt) {
    this.t += dt;
    const s = Math.sin(this.t * TAU / this.period + this.phase) * 0.5 + 0.5;
    this.x = this.x0 + this.ax * s;
    this.y = this.y0 + this.ay * s;
    this.angle += dt * 9;
  }
  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#aab3c9';
    ctx.beginPath();
    const teeth = 10;
    for (let i = 0; i < teeth; i++) {
      const a1 = (i / teeth) * TAU, a2 = ((i + 0.5) / teeth) * TAU;
      ctx.lineTo(Math.cos(a1) * this.r, Math.sin(a1) * this.r);
      ctx.lineTo(Math.cos(a2) * this.r * 0.72, Math.sin(a2) * this.r * 0.72);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b6379';
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.36, 0, TAU); ctx.fill();
    ctx.fillStyle = '#39405a';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ---------------- 跷跷板 ----------------
export class Seesaw {
  constructor(o) {
    const len = (o.len || 5) * TILE;
    this.cx = o.x * TILE + len / 2;   // 支点在跨度中央
    this.cy = o.y * TILE;             // 板面初始高度 = 标记格顶部
    this.half = len / 2 - 4;
    this.angle = 0; this.angV = 0;
    this.riders = [];
  }
  surfaceAt(x) { return this.cy + Math.sin(this.angle) * (x - this.cx); }
  update(world, dt) {
    // 收集本帧站在板上的身体
    let torque = 0;
    this.riders = [];
    const bodies = [...world.players.filter(p => !p.dead), ...world.boxes];
    for (const b of bodies) {
      if (b.seesawRef !== this || !b.grounded) continue;
      if (Math.abs(b.cx - this.cx) > this.half + 10) continue;
      this.riders.push(b);
      torque += ((b.cx - this.cx) / this.half) * (b.isBoxLike ? 1.9 : 1);
    }
    const target = clamp(torque * 0.34, -0.44, 0.44);
    this.angV += (target - this.angle) * 26 * dt;
    this.angV *= Math.max(0, 1 - 4.5 * dt);
    this.angle += this.angV * dt;
    // 乘客贴合并顺坡下滑
    for (const b of this.riders) {
      const surf = this.surfaceAt(b.cx);
      b.y += surf - (b.y + b.h);
      if (b.isBoxLike) b.x += Math.sin(this.angle) * 46 * dt;
      else b.vx += Math.sin(this.angle) * 130 * dt;
    }
  }
  draw(ctx, time) {
    // 支座
    ctx.fillStyle = '#59617f';
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy + 6);
    ctx.lineTo(this.cx - 13, this.cy + 32);
    ctx.lineTo(this.cx + 13, this.cy + 32);
    ctx.closePath(); ctx.fill();
    // 板
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#b07a3e';
    roundedRect(ctx, -this.half - 5, -7, this.half * 2 + 10, 13, 6); ctx.fill();
    ctx.fillStyle = '#93612c';
    ctx.fillRect(-this.half + 10, -1, this.half * 2 - 20, 3);
    ctx.fillStyle = 'rgba(255,235,200,0.35)';
    roundedRect(ctx, -this.half, -6, this.half * 2, 3, 2); ctx.fill();
    ctx.restore();
  }
}

// ---------------- 火焰喷口(预警后喷发,周期性) ----------------
export class Flame {
  constructor(o) {
    this.x = o.x * TILE; this.y = o.y * TILE;
    this.len = (o.len || 3) * TILE;
    this.period = o.period || 2.6;
    this.phase = o.phase || 0;
  }
  // 依据全局时间推导状态(双端确定)
  stateAt(time) {
    const t = ((time + this.phase * this.period) % this.period + this.period) % this.period;
    const fireStart = this.period - 0.85, warnStart = fireStart - 0.55;
    if (t >= fireStart) return 'fire';
    if (t >= warnStart) return 'warn';
    return 'idle';
  }
  killRect() { return { x: this.x + 7, y: this.y - this.len + 8, w: TILE - 14, h: this.len + TILE - 8 }; }
  draw(ctx, time) {
    const { x, y, len } = this;
    const st = this.stateAt(time);
    // 喷嘴
    ctx.fillStyle = '#3c4258';
    roundedRect(ctx, x + 5, y + 6, TILE - 10, 22, 5); ctx.fill();
    ctx.fillStyle = '#8a93b5';
    ctx.fillRect(x + 8, y + 9, TILE - 16, 4);
    if (st === 'warn') {
      const k = (Math.sin(time * 22) + 1) / 2;
      ctx.fillStyle = `rgba(255,140,40,${0.25 + k * 0.4})`;
      ctx.beginPath(); ctx.arc(x + TILE / 2, y + 4, 8 + k * 4, 0, TAU); ctx.fill();
    } else if (st === 'fire') {
      const w = TILE - 16;
      for (let i = 0; i < 3; i++) {
        const hgt = len - 14 + Math.sin(time * 31 + i * 2.4) * 6;
        const col = ['#ff5a2b', '#ff9d2b', '#ffe38a'][i];
        const ww = w * (1 - i * 0.28);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2 + Math.sin(time * 27 + i) * 2, y + 6 - hgt / 2, ww / 2, hgt / 2, 0, 0, TAU);
        ctx.fill();
      }
      if (Math.random() < 0.3) {
        ctx.fillStyle = 'rgba(255,200,90,0.8)';
        ctx.beginPath();
        ctx.arc(x + TILE / 2 + (Math.random() - 0.5) * 14, y - len + Math.random() * 20, 1.6, 0, TAU);
        ctx.fill();
      }
    }
  }
}

// ---------------- 蹦床 ----------------
export function drawTramp(ctx, s, time) {
  const { x, y } = s;
  const dip = s.t > 0 ? Math.min(s.t, 0.35) / 0.35 * 10 : 0;
  // 支腿
  ctx.strokeStyle = '#59617f'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + TILE - 4); ctx.lineTo(x + 2, y + TILE + 8);
  ctx.moveTo(x + TILE - 6, y + TILE - 4); ctx.lineTo(x + TILE - 2, y + TILE + 8);
  ctx.stroke();
  // 充能光
  const ch = s.charge || 0;
  if (ch > 0) {
    ctx.fillStyle = `rgba(126,240,201,${0.12 + ch * 0.1})`;
    ctx.beginPath(); ctx.ellipse(x + TILE / 2, y + TILE - 2, TILE * 0.7, 10, 0, 0, TAU); ctx.fill();
  }
  // 弹面
  ctx.strokeStyle = ch > 0 ? '#7ef0c9' : '#ffd23d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 12);
  ctx.quadraticCurveTo(x + TILE / 2, y + 12 + 8 + dip, x + TILE - 2, y + 12);
  ctx.stroke();
  if (ch > 0) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('×' + (ch + 1), x + TILE / 2, y + 4);
  }
}

// ---------------- 各机关绘制 ----------------
export function drawPlate(ctx, p, pressed) {
  const { x, y } = p;
  const colors = { a: '#ffb84d', b: '#5ad0ff', c: '#b58aff', d: '#7ef0a8' };
  const c = colors[p.channel] || '#fff';
  const dy = pressed ? 5 : 0;
  ctx.fillStyle = '#3c4258';
  ctx.fillRect(x + 3, y + TILE - 5, TILE - 6, 5);
  ctx.fillStyle = c;
  roundedRect(ctx, x + 2, y + 12 + dy, TILE - 4, 10, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(x + 5, y + 14 + dy, TILE - 10, 2);
  // 双人板标记
  if (p.need > 1) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('×2', x + TILE / 2, y + 20 + dy);
  }
}

export function drawLever(ctx, l, time) {
  const { x, y } = l;
  const colors = { a: '#ffb84d', b: '#5ad0ff', c: '#b58aff' };
  ctx.fillStyle = '#3c4258';
  roundedRect(ctx, x + 8, y + 22, TILE - 16, 10, 3); ctx.fill();
  const ang = l.on ? 0.7 : -0.7;
  ctx.save();
  ctx.translate(x + TILE / 2, y + 24);
  ctx.rotate(ang);
  ctx.strokeStyle = '#8a93b5'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16); ctx.stroke();
  ctx.fillStyle = colors[l.channel] || '#fff';
  ctx.beginPath(); ctx.arc(0, -16, 5, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawSpring(ctx, s, time) {
  const { x, y } = s;
  const c = s.t > 0 ? s.t : 0; // 压缩动画
  const top = y + 8 + c * 12;
  ctx.strokeStyle = '#8a93b5'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const yy = y + TILE - 3 - i * ((y + TILE - 3 - top) / 3);
    ctx.moveTo(x + 6, yy); ctx.lineTo(x + TILE - 6, yy - 3);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffd23d';
  roundedRect(ctx, x + 2, top - 6, TILE - 4, 8, 3); ctx.fill();
  ctx.fillStyle = '#e0a616';
  ctx.fillRect(x + 4, top + 0, TILE - 8, 2);
}

export function drawCheckpoint(ctx, cp, time) {
  const { x, y } = cp;
  ctx.fillStyle = '#3c4258';
  ctx.fillRect(x + 14, y - TILE, 4, TILE * 2);
  const wave = Math.sin(time * 6) * 3;
  ctx.fillStyle = cp.active ? '#7ef0c9' : '#8a93b5';
  ctx.beginPath();
  ctx.moveTo(x + 18, y - TILE);
  ctx.lineTo(x + 44 + wave, y - TILE + 7);
  ctx.lineTo(x + 18, y - TILE + 15);
  ctx.closePath(); ctx.fill();
  if (cp.active) {
    ctx.fillStyle = 'rgba(126,240,201,0.25)';
    ctx.beginPath(); ctx.arc(x + 16, y, 22 + Math.sin(time * 4) * 3, 0, TAU); ctx.fill();
  }
}

export function drawGem(ctx, g, time) {
  if (g.taken) return;
  const bob = Math.sin(time * 3 + g.x) * 4;
  const { x, y } = g;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(Math.sin(time * 2 + g.x) * 0.15);
  ctx.fillStyle = '#2bc98e';
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(8, -2); ctx.lineTo(0, 12); ctx.lineTo(-8, -2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7ef0c9';
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(8, -2); ctx.lineTo(0, 1); ctx.lineTo(-8, -2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(-2, -4, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawExit(ctx, e, time, p1In, p2In, playersIn) {
  const { x, y, w, h } = e;
  // 门框
  ctx.fillStyle = '#3c4258';
  roundedRect(ctx, x - 4, y - 4, w + 8, h + 8, 10); ctx.fill();
  // 门洞
  const glow = playersIn === 2 ? 0.5 + Math.sin(time * 8) * 0.2 : 0;
  ctx.fillStyle = playersIn === 2 ? `rgba(255,240,160,${0.75 + glow})` : '#23283f';
  roundedRect(ctx, x, y, w, h, 7); ctx.fill();
  if (playersIn < 2) {
    // 两颗状态灯:谁到了谁的灯亮
    const lamp = (cx, on, col) => {
      ctx.fillStyle = on ? col : 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(cx, y + h / 2, 7, 0, TAU); ctx.fill();
      if (on) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, y + h / 2, 10 + Math.sin(time * 5) * 2, 0, TAU); ctx.stroke(); }
    };
    lamp(x + w / 2 - 11, p1In, '#ff8a3d');
    lamp(x + w / 2 + 11, p2In, '#3dc8ff');
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✓', x + w / 2, y + h / 2);
  }
}

export function drawCrack(ctx, cr) {
  if (cr.gone) return;
  const { x, y } = cr;
  ctx.fillStyle = '#7d6248';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.strokeStyle = '#4e3b28'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 6, y); ctx.lineTo(x + 14, y + 12); ctx.lineTo(x + 8, y + 22); ctx.lineTo(x + 18, y + TILE);
  ctx.moveTo(x + 24, y); ctx.lineTo(x + 18, y + 14); ctx.lineTo(x + 26, y + 24);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
}

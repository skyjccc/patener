// 粒子系统:尘土、爆裂、纸屑、光环、环境漂浮物
import { rand, TAU } from './utils.js';

const MAX = 420;
const pool = [];

export function clear() { pool.length = 0; }

function push(p) { if (pool.length < MAX) pool.push(p); }

// 落地/起跳尘土
export function dust(x, y, dir = 0, n = 5, color = 'rgba(255,255,255,0.75)') {
  for (let i = 0; i < n; i++) {
    push({
      x: x + rand(-4, 4), y: y + rand(-2, 2),
      vx: dir * rand(20, 80) + rand(-30, 30), vy: rand(-50, -10),
      life: rand(0.25, 0.5), maxLife: 0.5,
      size: rand(2.5, 5), color, grav: 60, type: 'soft',
    });
  }
}

// 死亡/破坏爆裂
export function burst(x, y, color, n = 16, speed = 220) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), sp = rand(speed * 0.3, speed);
    push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: rand(0.4, 0.8), maxLife: 0.8,
      size: rand(3, 7), color, grav: 500, type: 'chunk',
    });
  }
}

// 光环(二段跳/机关触发)
export function ring(x, y, color, r0 = 6, r1 = 42) {
  push({ x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, size: r0, r1, color, grav: 0, type: 'ring' });
}

// 闪点(宝石收集)
export function sparkle(x, y, color = '#fff', n = 8) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), sp = rand(40, 160);
    push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.3, 0.6), maxLife: 0.6,
      size: rand(1.5, 3.5), color, grav: 0, type: 'spark',
    });
  }
}

// 过关纸屑
export function confetti(x, y, n = 60) {
  const colors = ['#ff8a3d', '#3dc8ff', '#ffd23d', '#7ef0c9', '#ff6b9d', '#b795ff'];
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0), sp = rand(180, 420);
    push({
      x: x + rand(-30, 30), y,
      vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp,
      life: rand(1.2, 2.4), maxLife: 2.4,
      w: rand(4, 7), h: rand(2, 4), rot: rand(TAU), vr: rand(-8, 8),
      color: colors[i % colors.length], grav: 260, type: 'confetti',
    });
  }
}

// 环境漂浮物由 theme 驱动(雪花/落叶/火星/星尘),调用方自己管理生成
export function ambient(type, x, y, color) {
  const cfg = {
    leaf:   { vx: rand(-40, -10), vy: rand(25, 55), life: rand(3, 6), size: rand(3, 5), grav: 0, sway: rand(1.5, 3) },
    snow:   { vx: rand(-25, -5), vy: rand(20, 45), life: rand(3, 7), size: rand(1.5, 3.5), grav: 0, sway: rand(1, 2.4) },
    ember:  { vx: rand(-12, 12), vy: rand(-55, -25), life: rand(1.5, 3.5), size: rand(1.5, 3), grav: 0, sway: rand(0.8, 2) },
    star:   { vx: 0, vy: 0, life: rand(2, 5), size: rand(0.8, 2), grav: 0, sway: 0 },
    dust:   { vx: rand(-8, 8), vy: rand(-12, -4), life: rand(2, 5), size: rand(1, 2.5), grav: 0, sway: rand(0.6, 1.5) },
  }[type];
  push({ x, y, vx: cfg.vx, vy: cfg.vy, life: cfg.life, maxLife: cfg.life, size: cfg.size, color, grav: cfg.grav, sway: cfg.sway, t: 0, type: 'ambient' });
}

export function update(dt, time) {
  for (let i = pool.length - 1; i >= 0; i--) {
    const p = pool[i];
    p.life -= dt;
    if (p.life <= 0) { pool.splice(i, 1); continue; }
    p.vy += (p.grav || 0) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.sway) p.x += Math.sin(time * p.sway + i) * 14 * dt;
    if (p.type === 'confetti') p.rot += p.vr * dt;
    if (p.type === 'ambient') { p.vx *= 1; }
  }
}

export function draw(ctx) {
  for (const p of pool) {
    const a = clamp01(p.life / p.maxLife);
    ctx.globalAlpha = a;
    if (p.type === 'ring') {
      const r = p.size + (1 - a) * ((p.r1 - p.size) || 30);
      ctx.strokeStyle = p.color; ctx.lineWidth = 3 * a + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
    } else if (p.type === 'confetti') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + 0.6 * Math.abs(Math.sin(p.rot * 2))));
      ctx.restore();
    } else if (p.type === 'spark') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a + 0.5, 0, TAU); ctx.fill();
    } else if (p.type === 'ambient') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

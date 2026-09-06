// 摄像机:双人取景(中点跟随 + 缩放容纳两人)、边界钳制、震屏
import { clamp, damp, lerp } from './utils.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1;
    this.trauma = 0;
    this.minZoom = 0.62; this.maxZoom = 1.45;
    this.viewW = 960; this.viewH = 540;
  }

  setSize(vw, vh) { this.viewW = vw; this.viewH = vh; }

  shake(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); }

  update(dt, targets, levelW, levelH) {
    if (targets.length === 0) return;
    let cx = 0, cy = 0;
    for (const t of targets) { cx += t.x; cy += t.y; }
    cx /= targets.length; cy /= targets.length;
    cy -= 40; // 视觉重心略上移

    // 需要容纳所有目标的范围(加边距)
    let spreadX = 0, spreadY = 0;
    for (const t of targets) {
      spreadX = Math.max(spreadX, Math.abs(t.x - cx));
      spreadY = Math.max(spreadY, Math.abs(t.y - cy));
    }
    const padX = 250, padY = 180;
    const needW = (spreadX + padX) * 2, needH = (spreadY + padY) * 2;
    let z = Math.min(this.viewW / needW, this.viewH / needH);
    z = clamp(z, this.minZoom, this.maxZoom);

    this.zoom = damp(this.zoom, z, 2.4, dt);
    this.x = damp(this.x, cx, 6, dt);
    this.y = damp(this.y, cy, 6, dt);

    // 钳制到关卡范围(考虑缩放后的视野)
    const halfW = this.viewW / 2 / this.zoom, halfH = this.viewH / 2 / this.zoom;
    if (levelW <= halfW * 2) this.x = levelW / 2;
    else this.x = clamp(this.x, halfW, levelW - halfW);
    if (levelH <= halfH * 2) this.y = levelH / 2;
    else this.y = clamp(this.y, halfH, levelH - halfH);

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  // 获取绘制用变换(含震屏)
  apply(ctx) {
    const s = this.trauma * this.trauma;
    const sx = (Math.random() * 2 - 1) * 14 * s;
    const sy = (Math.random() * 2 - 1) * 10 * s;
    ctx.translate(this.viewW / 2 + sx, this.viewH / 2 + sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  toWorld(px, py) {
    return { x: (px - this.viewW / 2) / this.zoom + this.x, y: (py - this.viewH / 2) / this.zoom + this.y };
  }
}

// 玩家:阿橙(1P 冲刺)/ 阿蓝(2P 二段跳),平台物理手感是本作核心
import {
  P_W, P_H, RUN_SPEED, ACCEL_GROUND, ACCEL_AIR, FRICTION_GROUND, FRICTION_AIR,
  GRAVITY, FALL_MAX, JUMP_V, DJUMP_V, BOOST_V, DASH_V, DASH_TIME, DASH_CD,
  COYOTE, JUMP_BUFFER, JUMP_CUT, INVULN_TIME, LIE_W, LIE_H, LIE_HOLD,
} from './constants.js';
import { clamp, damp, rand, TAU, roundedRect } from '../core/utils.js';
import * as particles from '../core/particles.js';
import { play, buzz } from '../core/audio.js';
import { TILE } from './constants.js';

const SKIN = [
  { main: '#ff8a3d', dark: '#d96a1f', light: '#ffc08a', name: '阿橙' },
  { main: '#3dc8ff', dark: '#1e9be0', light: '#a8e8ff', name: '阿蓝' },
];

export class Player {
  constructor(id, x, y) {
    this.id = id;
    this.skin = SKIN[id];
    this.w = P_W; this.h = P_H;
    this.spawnX = x; this.spawnY = y;
    this.x = x - P_W / 2; this.y = y - P_H;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.coyote = 0; this.jbuf = 0; this.jumps = 1;
    this.dashT = 0; this.dashCd = 0; this.airDash = true;
    this.dropping = 0; this.jumpCut = false;
    this.standingOn = null;      // 'partner' | platform | box
    this.dead = false; this.deadT = 0; this.invuln = 0;
    this.face = 1;
    this.sx = 1; this.sy = 1;    // 挤压拉伸
    this.blinkT = rand(2, 5); this.runPhase = 0;
    this.pingT = 0;
    this.ghosts = [];
    this.wasGrounded = false;
    this.lying = false;      // 变桥状态
    this.lieHoldT = 0;       // 长按「喊」计時
    this.hat = 0;            // 0无 1叶 2花 3皇冠
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get isBlue() { return this.id === 1; }

  // 趴下变桥 / 起身(保持脚底不变、中心不变)
  lieDown() {
    const bottom = this.y + this.h, cx = this.x + this.w / 2;
    this.w = LIE_W; this.h = LIE_H;
    this.x = cx - this.w / 2; this.y = bottom - this.h;
    this.lying = true; this.vx = 0;
    this.sx = 1.25; this.sy = 0.6;
    play('lie');
    particles.ring(this.cx, this.cy, this.skin.light, 6, 26);
  }

  standUp() {
    const bottom = this.y + this.h, cx = this.x + this.w / 2;
    this.lying = false;
    this.w = P_W; this.h = P_H;
    this.x = cx - this.w / 2; this.y = bottom - this.h;
    this.sy = 1.25; this.sx = 0.8;
  }

  respawnAt(x, y) {
    this.x = x - P_W / 2; this.y = y - P_H - 2;
    this.vx = 0; this.vy = 0;
    this.dead = false; this.invuln = INVULN_TIME;
    this.dashT = 0; this.sx = 0.3; this.sy = 1.5;
    if (this.lying) { this.lying = false; this.w = P_W; this.h = P_H; }
    this.lieHoldT = 0;
    particles.ring(this.cx, this.cy, this.skin.main, 4, 34);
    particles.sparkle(this.cx, this.cy, this.skin.light, 6);
  }

  kill(world) {
    if (this.dead || this.invuln > 0) return;
    this.dead = true; this.deadT = 0.85;
    this.vx = 0; this.vy = 0;
    world.onPlayerDead(this);
  }

  update(world, dt, inp) {
    const sk = this.skin;
    this.pingT -= dt; this.invuln -= dt; this.dashCd -= dt;
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = rand(2.2, 4.5);

    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) world.respawn(this);
      return;
    }

    // ---- 变桥(趴下)状态:不能移动,按跳起身并弹起 ----
    if (this.lying) {
      this.vx = 0;
      this.vy = Math.min(this.vy + GRAVITY * dt, FALL_MAX);
      world.movePlayer(this, dt);
      this.grounded = world.playerGrounded;
      if (inp.jumpPressed || inp.dashPressed || !this.grounded) {
        const doJump = inp.jumpPressed && this.grounded;
        this.standUp();
        if (doJump) { this.vy = -JUMP_V * 0.92; play('jump'); particles.dust(this.cx, this.y + this.h, 0, 4); }
      }
      this.sx = damp(this.sx, 1, 12, dt);
      this.sy = damp(this.sy, 1, 12, dt);
      if (this.spinT > 0) this.spinT -= dt;
      this.runPhase = 0;
      for (let i = this.ghosts.length - 1; i >= 0; i--) {
        this.ghosts[i].t -= dt;
        if (this.ghosts[i].t <= 0) this.ghosts.splice(i, 1);
      }
      return;
    }

    // ---- 长按「喊」:变桥 ----
    if (inp.pingHeld && this.grounded) {
      this.lieHoldT += dt;
      if (this.lieHoldT >= LIE_HOLD) { this.lieHoldT = 0; this.lieDown(); return; }
    } else this.lieHoldT = 0;

    // ---- 冲刺中 ----
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.face * DASH_V;
      this.vy = 0;
      this.ghosts.push({ x: this.x, y: this.y, face: this.face, t: 0.22 });
      world.breakCracksAround(this);
      if (this.dashT <= 0) this.vx = this.face * RUN_SPEED * 0.8;
    } else {
      // ---- 水平移动(冰面打滑:加速慢、几乎无摩擦) ----
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const accel = this.grounded ? (this.onIce ? ACCEL_GROUND * 0.55 : ACCEL_GROUND) : ACCEL_AIR;
      const fric = this.grounded ? (this.onIce ? FRICTION_GROUND * 0.045 : FRICTION_GROUND) : FRICTION_AIR;
      if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.face = dir;
        if (Math.abs(this.vx) > RUN_SPEED) this.vx = dir * RUN_SPEED;
      } else {
        const s = Math.sign(this.vx);
        this.vx -= s * fric * dt;
        if (Math.sign(this.vx) !== s) this.vx = 0;
      }

      // ---- 跳跃(缓冲 + 土狼时间 + 超级跳 + 二段跳) ----
      if (inp.jumpPressed) this.jbuf = JUMP_BUFFER;
      else this.jbuf -= dt;

      if (this.grounded) {
        this.coyote = COYOTE;
        this.jumps = this.isBlue ? 2 : 1;
        this.airDash = true;
        this.jumpCut = false;
      } else this.coyote -= dt;

      if (this.jbuf > 0) {
        // 下 + 跳:薄板落下
        if (inp.down && this.standingOn === 'oneway') {
          this.dropping = 0.22; this.jbuf = 0;
        } else if (this.standingOn === 'partner') {
          // 超级跳:踩着伙伴起跳
          this.vy = -BOOST_V; this.y -= 2;
          this.jbuf = 0; this.coyote = 0;
          this.jumpCut = false;
          play('boost');
          particles.ring(this.cx, this.y + this.h, '#fff', 6, 40);
          particles.dust(this.cx, this.y + this.h, 0, 8);
          world.partnerNudge(this);
        } else if (this.coyote > 0) {
          this.vy = -JUMP_V;
          this.jbuf = 0; this.coyote = 0; this.grounded = false;
          play('jump');
          particles.dust(this.cx, this.y + this.h, -this.face, 4);
          this.sy = 1.35; this.sx = 0.75;
        } else if (this.isBlue && this.jumps > 0) {
          // 二段跳(阿蓝)
          this.jumps--;
          this.vy = -DJUMP_V;
          this.jbuf = 0;
          this.jumpCut = false;
          play('djump');
          particles.ring(this.cx, this.cy, sk.light, 5, 30);
          this.sy = 1.3; this.sx = 0.8;
          this.spinT = 0.4;
        }
      }
      // 可变跳高:提前松开截断上升
      if (!inp.jumpHeld && this.vy < -160 && !this.jumpCut) {
        this.vy *= JUMP_CUT; this.jumpCut = true;
      }

      // ---- 重力 ----
      this.vy = Math.min(this.vy + GRAVITY * dt, FALL_MAX);

      // ---- 冲刺(阿橙) ----
      if (inp.dashPressed && !this.isBlue && this.dashCd <= 0 && (this.grounded || this.airDash)) {
        this.dashT = DASH_TIME; this.dashCd = DASH_CD;
        if (!this.grounded) this.airDash = false;
        play('dash');
        this.sy = 0.7; this.sx = 1.4;
      }
    }

    if (this.dropping > 0) this.dropping -= dt;
    this.standingOn = null;

    // ---- 位移与碰撞 ----
    const wasGrounded = this.grounded;
    const fallV = this.vy;
    world.movePlayer(this, dt);
    this.grounded = world.playerGrounded;

    // 落地反馈
    if (!wasGrounded && this.grounded && fallV > 260) {
      const k = clamp((fallV - 260) / 640, 0, 1);
      this.sx = 1 + k * 0.45; this.sy = 1 - k * 0.4;
      particles.dust(this.cx, this.y + this.h, 0, 3 + k * 6 | 0);
      if (fallV > 420) play('land');
    }
    // 挤压恢复
    this.sx = damp(this.sx, 1, 12, dt);
    this.sy = damp(this.sy, 1, 12, dt);
    if (this.spinT > 0) this.spinT -= dt;
    this.runPhase += Math.abs(this.vx) * dt * 0.06;

    // 幽灵残影衰减
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].t -= dt;
      if (this.ghosts[i].t <= 0) this.ghosts.splice(i, 1);
    }
    // 离开地面就解除载具跟随(跳起不再被平台拖走)
    if (!this.grounded && this.vy < -50) this.ridingPlatform = null;
  }

  draw(ctx, time) {
    if (this.dead) return;
    const sk = this.skin;
    // 残影
    for (const g of this.ghosts) {
      ctx.globalAlpha = g.t * 1.6;
      ctx.fillStyle = sk.main;
      roundedRect(ctx, g.x - 5, g.y - 2, this.w + 10, this.h + 4, 12); ctx.fill();
    }
    ctx.globalAlpha = this.invuln > 0 ? (Math.sin(time * 24) > 0 ? 0.35 : 0.9) : 1;

    const cx = this.cx, bottom = this.y + this.h;

    // ---- 变桥形态 ----
    if (this.lying) {
      ctx.save();
      ctx.translate(cx, bottom);
      ctx.scale(this.sx, this.sy);
      ctx.fillStyle = sk.main;
      roundedRect(ctx, -36, -12, 72, 12, 6); ctx.fill();
      ctx.strokeStyle = sk.dark; ctx.lineWidth = 1.5;
      roundedRect(ctx, -36, -12, 72, 12, 6); ctx.stroke();
      ctx.fillStyle = sk.light;
      ctx.beginPath(); ctx.ellipse(0, -3, 16, 3.4, 0, 0, TAU); ctx.fill();
      // 累闭的双眼
      ctx.strokeStyle = '#23283f'; ctx.lineWidth = 1.6;
      for (const ex of [-9, 9]) {
        ctx.beginPath(); ctx.arc(ex, -7, 3, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,120,120,0.35)';
      ctx.beginPath(); ctx.ellipse(-16, -5, 2.4, 1.6, 0, 0, TAU); ctx.ellipse(16, -5, 2.4, 1.6, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    // 变桥蓄力环
    if (this.lieHoldT > 0) {
      const k = Math.min(this.lieHoldT / LIE_HOLD, 1);
      ctx.strokeStyle = sk.light; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, this.y - 14, 10, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, bottom);
    ctx.scale(this.sx, this.sy);
    // 空中翻转(二段跳)
    let rot = 0;
    if (this.spinT > 0) rot = (1 - this.spinT / 0.4) * TAU * this.face;
    ctx.rotate(rot);

    // 脚
    const step = Math.sin(this.runPhase * TAU) * 4 * (this.grounded ? 1 : 0.3);
    ctx.fillStyle = sk.dark;
    ctx.beginPath();
    ctx.ellipse(-6, -1 + Math.max(0, step), 4.5, 3.5, 0, 0, TAU);
    ctx.ellipse(6, -1 + Math.max(0, -step), 4.5, 3.5, 0, 0, TAU);
    ctx.fill();

    // 身体
    ctx.fillStyle = sk.main;
    roundedRect(ctx, -15, -27, 30, 26, 13); ctx.fill();
    // 肚皮
    ctx.fillStyle = sk.light;
    ctx.beginPath(); ctx.ellipse(0, -8, 8.5, 6.5, 0, 0, TAU); ctx.fill();
    // 描边
    ctx.strokeStyle = sk.dark; ctx.lineWidth = 1.5;
    roundedRect(ctx, -15, -27, 30, 26, 13); ctx.stroke();

    // 眼睛
    const blink = this.blinkT < 0;
    const lookX = this.face * 3 + clamp(this.vx * 0.008, -2, 2);
    const lookY = clamp(this.vy * 0.004, -2.5, 2.5);
    for (const ex of [-5.5, 5.5]) {
      if (blink) {
        ctx.strokeStyle = '#23283f'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(ex + lookX - 2.4, -18 + lookY); ctx.lineTo(ex + lookX + 2.4, -18 + lookY); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(ex + lookX * 0.4, -18 + lookY * 0.4, 4.2, 4.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#23283f';
        ctx.beginPath(); ctx.arc(ex + lookX, -18 + lookY, 2.1, 0, TAU); ctx.fill();
      }
    }
    // 腮红
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    ctx.beginPath(); ctx.ellipse(-9.5, -13, 2.6, 1.7, 0, 0, TAU); ctx.ellipse(9.5, -13, 2.6, 1.7, 0, 0, TAU); ctx.fill();

    // 配件:1P 头带 / 2P 天线
    if (this.id === 0) {
      ctx.fillStyle = '#e84f4f';
      ctx.fillRect(-15, -25.5, 30, 4.5);
      const flap = Math.sin(time * 10) * 2.5;
      ctx.beginPath();
      ctx.moveTo(-this.face * 14, -24);
      ctx.lineTo(-this.face * 24, -20 + flap);
      ctx.lineTo(-this.face * 14, -19.5);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = sk.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -27); ctx.quadraticCurveTo(this.face * 2, -33, this.face * 4, -34); ctx.stroke();
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath(); ctx.arc(this.face * 4, -34.5, 3, 0, TAU); ctx.fill();
    }
    // 帽子(水晶里程碑解锁)
    if (this.hat >= 1) {
      ctx.save();
      ctx.translate(0, -27);
      if (this.hat === 1) {           // 小叶芽
        ctx.strokeStyle = '#3d8f3d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(1, -5, 4, -7); ctx.stroke();
        ctx.fillStyle = '#6dbf4b';
        ctx.beginPath(); ctx.ellipse(6, -8, 5, 2.8, -0.5, 0, TAU); ctx.fill();
      } else if (this.hat === 2) {    // 小花
        ctx.fillStyle = '#ff6b9d';
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * TAU - Math.PI / 2;
          ctx.beginPath(); ctx.ellipse(Math.cos(a) * 5, -4 + Math.sin(a) * 5, 3.4, 2.2, a, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#ffd23d';
        ctx.beginPath(); ctx.arc(0, -4, 2.6, 0, TAU); ctx.fill();
      } else {                        // 皇冠
        ctx.fillStyle = '#ffd23d';
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(-9, -8); ctx.lineTo(-4.5, -3.5); ctx.lineTo(0, -9);
        ctx.lineTo(4.5, -3.5); ctx.lineTo(9, -8); ctx.lineTo(9, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e84f4f';
        ctx.beginPath(); ctx.arc(0, -2.4, 1.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();

    // 呼喊气泡
    if (this.pingT > 0) {
      const a = clamp(this.pingT * 3, 0, 1);
      ctx.globalAlpha = a;
      const by = this.y - 22 - (1 - a) * 6;
      ctx.fillStyle = '#fff';
      roundedRect(ctx, cx - 11, by - 11, 22, 20, 8); ctx.fill();
      ctx.fillStyle = sk.main;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, by);
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  }
}

export { SKIN };

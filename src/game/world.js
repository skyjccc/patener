// 世界:物理碰撞 / 机关联动 / 危险判定 / 胜负 / 场景绘制
import { TILE, TRAMP_BASE, TRAMP_STEP, TRAMP_MAX, LIE_HOLD } from './constants.js';
import { T_EMPTY, T_SOLID, T_ONEWAY, T_CRACK, T_SPIKE, T_ICE, parseLevel, buildStaticLayer } from './level.js';
import { Player, SKIN } from './player.js';
import { Box, Door, MovingPlatform, Saw, Seesaw, Flame, drawPlate, drawLever, drawSpring, drawTramp, drawCheckpoint, drawGem, drawExit, drawCrack } from './entities.js';
import { Camera } from '../core/camera.js';
import * as particles from '../core/particles.js';
import { play, buzz } from '../core/audio.js';
import { aabb, circleRect, clamp, damp, rand, hash2, roundedRect, TAU } from '../core/utils.js';

export class World {
  constructor(hooks) {
    this.hooks = hooks || {};
    this.camera = new Camera();
    this.debug = false;
    this.state = 'intro'; // intro | play | won
    this.time = 0;
  }

  load(source) {
    const lv = typeof source === 'number' ? parseLevel(source) : source;
    this.idx = lv.idx;
    this.lv = lv;
    this.staticLayer = buildStaticLayer(lv);
    this.players = [
      new Player(0, lv.spawns[0].x, lv.spawns[0].y),
      new Player(1, lv.spawns[1].x, lv.spawns[1].y),
    ];
    this.boxes = lv.boxes.map(b => { const box = new Box(b.x, b.y); return box; });
    this.doors = lv.doors.map(d => new Door(d.x, d.y - d.h + TILE, d.h, d.channel));
    this.platforms = lv.objects.filter(o => o.type === 'platform').map(o => new MovingPlatform(o));
    this.saws = lv.objects.filter(o => o.type === 'saw').map(o => new Saw(o));
    this.seesaws = lv.objects.filter(o => o.type === 'seesaw').map(o => new Seesaw(o));
    this.flames = lv.objects.filter(o => o.type === 'flame').map(o => new Flame(o));
    this.plates = lv.plates.map(p => ({ ...p, pressed: false }));
    this.plates.push(...lv.objects.filter(o => o.type === 'plate2').map(o => ({ x: o.x * TILE, y: o.y * TILE, channel: o.channel || 'd', need: 2, pressed: false })));
    this.hints = lv.objects.filter(o => o.type === 'hint').map(o => ({ ...o, px: o.x * TILE, py: o.y * TILE, a: 0 }));
    this.levers = lv.levers.map(l => ({ ...l, t: 0 }));
    this.springs = lv.springs.map(s => ({ ...s, t: 0 }));
    this.checkpoints = lv.checkpoints.map(c => ({ ...c, active: false }));
    this.gems = lv.gems.map(g => ({ ...g, taken: false }));
    this.cracked = lv.cracked;
    this.grid = lv.grid;
    this.exit = lv.exit;
    this.anchor = { x: lv.spawns[0].x, y: lv.spawns[0].y };
    this.groundTopY = lv.ph - 3 * TILE;
    this.gemMask = [false, false, false];
    this.gemIdx = 0;
    this.fails = 0;
    this.time = 0;
    this.winT = 0;
    this.hitstop = 0;
    this.slowmo = 0;
    this.state = 'intro';
    this.introT = 1.6;
    this.ambientT = 0;
    // 无尽模式字段
    this.endless = lv.endless || false;
    this.lavaY = this.endless ? lv.ph + 260 : 1e9;
    this.hearts = 3;
    this.maxClimb = 0;
    this.endlessOver = false;
    particles.clear();
    this.camera.x = this.players[0].cx; this.camera.y = this.players[0].cy;
    this.camera.zoom = 1;
    this.hooks.onHud?.(this);
    this.hints.forEach(h => h.a = 0);
  }

  // ---------------- 通道(机关板 OR 拉杆锁存) ----------------
  channelActive(ch) {
    if (this.plates.some(p => p.channel === ch && p.pressed)) return true;
    if (this.levers.some(l => l.channel === ch && l.on)) return true;
    return false;
  }

  onDoorToggle() { play('door'); }

  // ---------------- 瓦片查询 ----------------
  tileAt(tx, ty) {
    const { w, h } = this.lv;
    if (tx < 0 || tx >= w) return T_SOLID; // 左右边界墙
    if (ty < 0) return T_EMPTY;
    if (ty >= h) return T_EMPTY;
    return this.grid[ty * w + tx];
  }
  tileSolid(code) { return code === T_SOLID || code === T_CRACK || code === T_ICE; }

  // 与世界静态几何相交(推箱/落箱探测用,忽略 ignore)
  rectHitsWorld(r, ignore) {
    const x0 = Math.floor(r.x / TILE), x1 = Math.floor((r.x + r.w - 0.01) / TILE);
    const y0 = Math.floor(r.y / TILE), y1 = Math.floor((r.y + r.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (this.tileSolid(this.tileAt(tx, ty))) return true;
    for (const d of this.doors) if (d.solid && d !== ignore && aabb(r.x, r.y, r.w, r.h, d.x, d.y, d.w, d.h)) return true;
    for (const b of this.boxes) if (b !== ignore && aabb(r.x, r.y, r.w, r.h, b.x, b.y, b.w, b.h)) return true;
    for (const pl of this.platforms) if (aabb(r.x, r.y, r.w, r.h, pl.x, pl.y, pl.w, pl.h)) return true;
    return false;
  }

  // ---------------- 玩家物理 ----------------
  movePlayer(p, dt) {
    const other = this.players[1 - p.id];
    // 站在伙伴头上时跟随水平移动
    if (p.standingOn === 'partner' && !other.dead) p.x += other.vx * dt;

    // ===== X 轴 =====
    p.x += p.vx * dt;
    // 瓦片
    {
      const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 0.01) / TILE);
      if (p.vx > 0) {
        const tx = Math.floor((p.x + p.w) / TILE);
        for (let ty = y0; ty <= y1; ty++) if (this.tileSolid(this.tileAt(tx, ty))) { p.x = tx * TILE - p.w - 0.01; p.vx = 0; break; }
      } else if (p.vx < 0) {
        const tx = Math.floor(p.x / TILE);
        for (let ty = y0; ty <= y1; ty++) if (this.tileSolid(this.tileAt(tx, ty))) { p.x = (tx + 1) * TILE + 0.01; p.vx = 0; break; }
      }
    }
    // 动态实体(门/平台用快照钳制;箱子操作实时引用以支持推箱)
    const solids = this.dynamicSolids();
    for (const s of solids) {
      if (s.kind === 'box') {
        const b = s.ref;
        if (!aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) continue;
        if (p.grounded && p.vx !== 0) {
          const dir = Math.sign(p.vx);
          const dist = Math.abs(p.vx * dt) + 0.5;
          const probe = { x: b.x + dir * dist, y: b.y, w: b.w, h: b.h };
          if (!this.rectHitsWorld(probe, b)) b.x += dir * dist;
        }
        if (aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
          if (p.vx > 0) p.x = b.x - p.w - 0.01;
          else if (p.vx < 0) p.x = b.x + b.w + 0.01;
        }
      } else {
        if (!aabb(p.x, p.y, p.w, p.h, s.x, s.y, s.w, s.h)) continue;
        if (p.vx > 0) { p.x = s.x - p.w - 0.01; p.vx = 0; }
        else if (p.vx < 0) { p.x = s.x + s.w + 0.01; p.vx = 0; }
      }
    }

    // ===== Y 轴 =====
    const prevBottom = p.y + p.h;
    p.y += p.vy * dt;
    this.playerGrounded = false;
    let onOneway = false;
    {
      const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.01) / TILE);
      if (p.vy > 0) {
        const ty = Math.floor((p.y + p.h) / TILE);
        for (let tx = x0; tx <= x1; tx++) {
          const code = this.tileAt(tx, ty);
          if (this.tileSolid(code)) { p.y = ty * TILE - p.h - 0.01; p.vy = 0; this.playerGrounded = true; break; }
          if (code === T_ONEWAY && p.dropping <= 0 && prevBottom <= ty * TILE + 6) {
            p.y = ty * TILE - p.h - 0.01; p.vy = 0; this.playerGrounded = true; onOneway = true; break;
          }
        }
      } else if (p.vy < 0) {
        const ty = Math.floor(p.y / TILE);
        for (let tx = x0; tx <= x1; tx++) if (this.tileSolid(this.tileAt(tx, ty))) { p.y = (ty + 1) * TILE + 0.01; p.vy = 0; break; }
      }
    }
    // 跷跷板落面(单向,按身体中心取板面高度)
    p.seesawRef = null;
    for (const s of this.seesaws) {
      if (p.vy < 0) break;
      if (Math.abs(p.cx - s.cx) > s.half + 8) continue;
      const surf = s.surfaceAt(p.cx);
      if (prevBottom <= surf + 8 && p.y + p.h >= surf) {
        p.y = surf - p.h - 0.01; p.vy = 0; this.playerGrounded = true;
        p.standingOn = 'seesaw'; p.seesawRef = s;
        break;
      }
    }
    // 冰面检测(脚下瓦片)
    p.onIce = false;
    if (this.playerGrounded) {
      const uy = Math.floor((p.y + p.h + 3) / TILE);
      const ux0 = Math.floor(p.x / TILE), ux1 = Math.floor((p.x + p.w - 0.01) / TILE);
      for (let tx = ux0; tx <= ux1; tx++) if (this.tileAt(tx, uy) === T_ICE) { p.onIce = true; break; }
    }
    for (const s of solids) {
      if (!aabb(p.x, p.y, p.w, p.h, s.x, s.y, s.w, s.h)) continue;
      if (p.vy >= 0 && prevBottom <= s.y + 8) {
        p.y = s.y - p.h - 0.01; p.vy = 0; this.playerGrounded = true;
        p.standingOn = s.kind;
        p.ridingPlatform = s.kind === 'platform' ? s.ref : null;
      } else if (p.vy < 0 && prevBottom > s.y) {
        p.y = s.y + s.h + 0.01; p.vy = 0;
      } else {
        // 侧面嵌入:按体积中心推出较浅一侧
        const pushL = (p.x + p.w) - s.x, pushR = (s.x + s.w) - p.x;
        if (pushL < pushR) p.x -= pushL; else p.x += pushR;
      }
    }
    if (this.playerGrounded && !onOneway && p.standingOn !== 'partner' && !p.standingOn) p.standingOn = 'ground';

    // 伙伴头顶/身躯(单向;趴下的伙伴整条身体都是桥面,允许从地面直接踏上去)
    if (!other.dead && p.vy >= 0) {
      const lying = other.lying;
      const ow = lying ? other.w : 26;
      const bandH = lying ? other.h + 6 : 8;
      const tol = lying ? 18 : 10;
      const ox = other.x + (other.w - ow) / 2;
      if (aabb(p.x, p.y, p.w, p.h, ox, other.y, ow, bandH) && prevBottom <= other.y + tol) {
        p.y = other.y - p.h - 0.01;
        p.vy = 0;
        this.playerGrounded = true;
        p.standingOn = 'partner';
      }
    }
    if (onOneway) p.standingOn = 'oneway';
  }

  dynamicSolids() {
    const arr = [];
    for (const d of this.doors) if (d.solid) arr.push({ x: d.x, y: d.y, w: d.w, h: d.h, kind: 'door' });
    for (const pl of this.platforms) arr.push({ x: pl.x, y: pl.y, w: pl.w, h: pl.h, kind: 'platform', ref: pl });
    for (const b of this.boxes) arr.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'box', ref: b });
    return arr;
  }

  // ---------------- 木箱物理 ----------------
  moveBox(b, dt) {
    // X(仅被推时由玩家位移产生,这里做碰撞钳制)
    if (b.vx !== 0) {
      b.x += b.vx * dt;
      if (this.rectHitsWorld(b, b)) {
        b.x -= b.vx * dt;
        b.vx = 0;
      }
      b.vx = 0;
    }
    // Y
    const prevBottom = b.y + b.h;
    b.y += b.vy * dt;
    b.grounded = false;
    const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
    if (b.vy > 0) {
      const ty = Math.floor((b.y + b.h) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const code = this.tileAt(tx, ty);
        if (this.tileSolid(code) || code === T_ONEWAY) {
          b.y = ty * TILE - b.h - 0.01; b.vy = 0; b.grounded = true; break;
        }
      }
    } else if (b.vy < 0) {
      const ty = Math.floor(b.y / TILE);
      for (let tx = x0; tx <= x1; tx++) if (this.tileSolid(this.tileAt(tx, ty))) { b.y = (ty + 1) * TILE + 0.01; b.vy = 0; break; }
    }
    for (const s of this.dynamicSolids()) {
      if (s.ref === b) continue;
      if (!aabb(b.x, b.y, b.w, b.h, s.x, s.y, s.w, s.h)) continue;
      if (b.vy >= 0 && prevBottom <= s.y + 8) { b.y = s.y - b.h - 0.01; b.vy = 0; b.grounded = true; b.riding = s.kind === 'platform' ? s.ref : null; }
      else if (b.vy < 0) { b.y = s.y + s.h + 0.01; b.vy = 0; }
      else {
        const pushL = (b.x + b.w) - s.x, pushR = (s.x + s.w) - b.x;
        if (pushL < pushR) b.x -= pushL; else b.x += pushR;
      }
    }
  }

  // ---------------- 冲刺破坏裂纹砖(判定扩大到上下各半格,一冲开一条道) ----------------
  breakCracksAround(p) {
    const probeX = p.face > 0 ? p.x + p.w - 2 : p.x - 10;
    const probe = { x: probeX, y: p.y - TILE * 0.8, w: 12, h: p.h + TILE * 1.6 };
    const x0 = Math.floor(probe.x / TILE), x1 = Math.floor((probe.x + probe.w) / TILE);
    const y0 = Math.floor(probe.y / TILE), y1 = Math.floor((probe.y + probe.h) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (this.tileAt(tx, ty) !== T_CRACK) continue;
        const cr = this.cracked.find(c => c.tx === tx && c.ty === ty && !c.gone);
        if (!cr) continue;
        cr.gone = true;
        this.grid[ty * this.lv.w + tx] = T_EMPTY;
        particles.burst(cr.x + 16, cr.y + 16, '#a8845c', 14, 200);
        particles.burst(cr.x + 16, cr.y + 16, '#6b5238', 8, 140);
        this.camera.shake(0.35);
        this.hitstop = Math.max(this.hitstop, 0.06);
        play('crack');
        buzz(40);
      }
  }

  // ---------------- 死亡与重生 ----------------
  onPlayerDead(p) {
    this.fails++;
    if (this.endless) {
      this.hearts--;
      particles.burst(p.cx, this.lavaY > p.cy ? this.lavaY : p.cy, '#ff5a2b', 20, 300);
    }
    particles.burst(p.cx, p.cy, p.skin.main, 18, 260);
    particles.burst(p.cx, p.cy, '#fff', 8, 180);
    this.camera.shake(0.5);
    this.hitstop = Math.max(this.hitstop, 0.09);
    play('death');
    buzz(120);
  }

  respawn(p) {
    const other = this.players[1 - p.id];
    if (!other.dead && other.grounded) {
      p.respawnAt(other.cx, other.y + other.h);
    } else {
      p.respawnAt(this.anchor.x, this.anchor.y);
    }
    play('pop');
  }

  partnerNudge(p) {
    const other = this.players[1 - p.id];
    if (!other.dead) other.vy = Math.max(other.vy, 140);
  }

  // ---------------- 主更新 ----------------
  update(dt, time) {
    if (this.introT > 0) { this.introT -= dt; if (this.introT <= 0) this.state = 'play'; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    // 过关慢动作
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
    // 无尽模式结束:世界定格,只剩粒子飘落
    if (this.endlessOver) {
      particles.update(dt, time);
      this.camera.update(dt, this.players.filter(p => !p.dead).map(p => ({ x: p.cx, y: p.cy })), this.lv.pw, this.lv.ph);
      return;
    }

    // 平台移动 + 载具搬运
    for (const pl of this.platforms) pl.update(this, dt);
    for (const p of this.players) {
      if (p.ridingPlatform && !p.dead) {
        p.x += p.ridingPlatform.deltaX;
        p.y += p.ridingPlatform.deltaY;
      }
    }
    for (const b of this.boxes) {
      if (b.riding) { b.x += b.riding.deltaX; b.y += b.riding.deltaY; b.riding = null; }
    }

    for (const d of this.doors) d.update(this, dt);
    for (const s of this.saws) s.update(this, dt);
    for (const ss of this.seesaws) ss.update(this, dt);
    for (const b of this.boxes) b.update(this, dt);

    // 玩家(顺序稳定,伙伴跟随用上一帧速度)
    for (const p of this.players) p.update(this, dt, input4p[p.id]);
    for (const p of this.players) {
      // 弹簧 / 蹦床
      for (const s of this.springs) {
        s.t = Math.max(0, s.t - dt);
        if (p.dead || p.vy < 0) continue;
        if (aabb(p.x, p.y + p.h - 8, p.w, 10, s.x + 2, s.y + 4, TILE - 4, 12) && p.vy > 20) {
          if (s.kind === 'tramp') {
            // 蹦床:1.6 秒内连续弹跳充能,越弹越高(两人可轮流充能)
            const chain = (this.time - s.lastBounce < 1.6) ? s.charge : 0;
            s.charge = Math.min(chain + 1, TRAMP_MAX);
            s.lastBounce = this.time;
            p.vy = -(TRAMP_BASE + s.charge * TRAMP_STEP);
            play('tramp');
            particles.ring(s.x + 16, s.y + 8, '#7ef0c9', 6, 22 + s.charge * 8);
          } else {
            p.vy = -1080; s.t = 0.35;
            play('spring');
            particles.ring(s.x + 16, s.y + 6, '#ffd23d', 6, 30);
          }
          p.airDash = true; if (p.isBlue) p.jumps = Math.max(p.jumps, 1);
        }
      }
      if (p.dead) continue;
      // 危险物
      if (p.invuln <= 0 && this.state !== 'won') {
        // 地刺
        const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w) / TILE);
        const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h) / TILE);
        outer:
        for (let ty = y0; ty <= y1; ty++)
          for (let tx = x0; tx <= x1; tx++)
            if (this.tileAt(tx, ty) === T_SPIKE && aabb(p.x, p.y, p.w, p.h, tx * TILE + 4, ty * TILE + 14, TILE - 8, TILE - 14)) { p.kill(this); break outer; }
        for (const saw of this.saws)
          if (circleRect(saw.x, saw.y, saw.r - 4, p.x, p.y, p.w, p.h)) { p.kill(this); break; }
        // 火焰喷口(喷发阶段才致命)
        for (const f of this.flames) {
          if (f.stateAt(this.time) === 'fire' && aabb(p.x, p.y, p.w, p.h, f.killRect().x, f.killRect().y, f.killRect().w, f.killRect().h)) { p.kill(this); break; }
        }
        if (p.y > this.lv.ph + 80) p.kill(this);
      }
      // 宝石
      for (let i = 0; i < this.gems.length; i++) {
        const g = this.gems[i];
        if (g.taken) continue;
        if (Math.abs(p.cx - g.x) < 24 && Math.abs(p.cy - g.y) < 26) {
          g.taken = true;
          this.gemMask[this.gemIdx++] = true;
          play('gem');
          particles.sparkle(g.x, g.y, '#7ef0c9', 12);
          particles.ring(g.x, g.y, '#2bc98e', 4, 26);
          this.hooks.onHud?.(this);
        }
      }
      // 检查点
      for (const c of this.checkpoints) {
        if (!c.active && aabb(p.x, p.y, p.w, p.h, c.x - 6, c.y - TILE, TILE + 12, TILE * 2.5)) {
          this.checkpoints.forEach(o => o.active = false);
          c.active = true;
          this.anchor = { x: c.x + TILE / 2, y: c.y + TILE };
          play('checkpoint');
          particles.ring(c.x + 16, c.y, '#7ef0c9', 8, 44);
        }
      }
    }

    // 机关板(need>1 表示需要多个身体同时压住)
    for (const pl of this.plates) {
      const was = pl.pressed;
      let cnt = 0;
      const zone = { x: pl.x + 1, y: pl.y + 8, w: TILE - 2, h: 20 };
      for (const p of this.players) if (!p.dead && aabb(p.x, p.y, p.w, p.h, zone.x, zone.y, zone.w, zone.h)) cnt++;
      for (const b of this.boxes) if (aabb(b.x, b.y, b.w, b.h, zone.x, zone.y, zone.w, zone.h)) cnt++;
      pl.pressed = cnt >= (pl.need || 1);
      if (pl.pressed !== was) { play('plate'); particles.dust(pl.x + 16, pl.y + 20, 0, 4); }
    }
    // 拉杆
    for (const l of this.levers) {
      l.t -= dt;
      if (l.t <= 0) {
        for (const p of this.players) {
          if (!p.dead && aabb(p.x, p.y, p.w, p.h, l.x, l.y, TILE, TILE)) {
            l.on = !l.on; l.t = 0.7;
            play('lever');
            particles.sparkle(l.x + 16, l.y + 10, '#ffd23d', 6);
            break;
          }
        }
      }
    }

    // 终点
    if (this.state === 'play' && !this.endless) {
      const e = this.exit;
      const in1 = !this.players[0].dead && aabb(this.players[0].x, this.players[0].y, this.players[0].w, this.players[0].h, e.x, e.y, e.w, e.h);
      const in2 = !this.players[1].dead && aabb(this.players[1].x, this.players[1].y, this.players[1].w, this.players[1].h, e.x, e.y, e.w, e.h);
      if (in1 && in2) {
        this.winT += dt;
        if (this.winT > 0.3) this.win();
      } else this.winT = 0;
    }

    // ---- 无尽模式:岩浆攀爬 ----
    if (this.endless && !this.endlessOver) {
      if (this.time > 14) this.lavaY -= Math.min(16 + this.time * 0.55, 92) * dt;
      for (const p of this.players) {
        if (p.dead) continue;
        this.maxClimb = Math.max(this.maxClimb, this.groundTopY - (p.y + p.h));
        if (p.grounded && p.standingOn && p.standingOn !== 'partner') this.anchor = { x: p.cx, y: p.y + p.h };
        if (p.invuln <= 0 && p.y + p.h > this.lavaY + 4) p.kill(this);
      }
      if (this.hearts <= 0) {
        this.endlessOver = true;
        this.state = 'over';
        this.hooks.onGameOver?.({ height: Math.round(this.maxClimb / 32), gems: this.gemIdx, time: this.time });
      }
      this.hudT = (this.hudT || 0) + dt;
      if (this.hudT > 0.2) { this.hudT = 0; this.hooks.onHud?.(this); }
    }

    // 提示气泡
    for (const h of this.hints) {
      let near = 1e9;
      for (const p of this.players) if (!p.dead) near = Math.min(near, Math.hypot(p.cx - (h.px + 16), p.cy - (h.py + 16)));
      h.a = damp(h.a, near < 160 ? 1 : 0, 6, dt);
    }

    // 环境粒子
    this.ambientT -= dt;
    const th = this.lv.theme;
    if (th.ambient && this.ambientT <= 0) {
      this.ambientT = th.ambient === 'star' ? 0.5 : 0.1;
      const vx = this.camera.viewW / this.camera.zoom;
      const vy = this.camera.viewH / this.camera.zoom;
      const x = this.camera.x + rand(-vx / 2, vx / 2);
      if (th.ambient === 'ember') particles.ambient('ember', x, this.camera.y + vy / 2 + 10, th.ambientColor);
      else if (th.ambient === 'star') particles.ambient('star', x, this.camera.y + rand(-vy / 2, vy / 2), th.ambientColor);
      else particles.ambient(th.ambient, x, this.camera.y - vy / 2 - 10, th.ambientColor);
    }

    particles.update(dt, time);

    // 摄像机
    const targets = this.players.filter(p => !p.dead).map(p => ({ x: p.cx, y: p.cy }));
    if (targets.length === 0) targets.push(this.anchor);
    this.camera.update(dt, targets, this.lv.pw, this.lv.ph);

    this.time += dt;
  }

  win() {
    this.state = 'won';
    this.slowmo = 0.9;
    this.winStats = { time: this.time, fails: this.fails, gems: [...this.gemMask] };
    play('win');
    buzz([60, 40, 60, 40, 120]);
    const e = this.exit;
    particles.confetti(e.x + e.w / 2, e.y + 20, 80);
    this.camera.shake(0.25);
    this.hooks.onWin?.(this.winStats);
  }

  // ---------------- 联机:状态序列化 / 应用(主机权威纠偏) ----------------
  serializeState() {
    return {
      st: this.state, tm: +this.time.toFixed(3), f: this.fails,
      g: this.gemMask.map(v => v ? 1 : 0),
      an: [+this.anchor.x.toFixed(1), +this.anchor.y.toFixed(1)],
      p: this.players.map(pl => [+pl.x.toFixed(1), +pl.y.toFixed(1), +pl.vx.toFixed(1), +pl.vy.toFixed(1), pl.dead ? 1 : 0, pl.lying ? 1 : 0]),
      dr: this.doors.map(d => +d.open.toFixed(2)),
      lv: this.levers.map(l => l.on ? 1 : 0),
      ck: this.checkpoints.map(c => c.active ? 1 : 0),
      gm: this.gems.map(g => g.taken ? 1 : 0),
      cr: this.cracked.map(c => c.gone ? 1 : 0),
      bx: this.boxes.map(b => [+b.x.toFixed(1), +b.y.toFixed(1), +b.vy.toFixed(1)]),
      pf: this.platforms.map(pl => pl.trigger ? +(pl.prog ?? 0).toFixed(3) : +pl.t.toFixed(3)),
      ss: this.seesaws.map(s => +s.angle.toFixed(3)),
      sp: this.springs.map(s => [+(s.t || 0).toFixed(2), s.kind === 'tramp' ? s.charge : 0, +((s.lastBounce ?? -9).toFixed?.(2) ?? 0)]),
      // 无尽模式
      el: this.endless ? { la: +this.lavaY.toFixed(1), ht: this.hearts, mc: Math.round(this.maxClimb), ov: this.endlessOver ? 1 : 0, gi: this.gemIdx } : null,
    };
  }

  applySync(d) {
    if (!this.lv) return;
    this.state = d.st; this.time = d.tm; this.fails = d.f;
    this.gemMask = d.g.map(v => !!v);
    this.anchor = { x: d.an[0], y: d.an[1] };
    d.dr.forEach((v, i) => { const dr = this.doors[i]; if (dr) { dr.open = v; dr.active = v > 0.5; dr.wasOpen = v > 0.5; } });
    d.lv.forEach((v, i) => { if (this.levers[i]) this.levers[i].on = !!v; });
    d.ck.forEach((v, i) => { if (this.checkpoints[i]) this.checkpoints[i].active = !!v; });
    d.gm.forEach((v, i) => { if (this.gems[i]) this.gems[i].taken = !!v; });
    d.cr.forEach((v, i) => {
      const cr = this.cracked[i];
      if (cr && v && !cr.gone) { cr.gone = true; this.grid[cr.ty * this.lv.w + cr.tx] = T_EMPTY; }
    });
    d.bx.forEach((v, i) => { const b = this.boxes[i]; if (b) { b.x = v[0]; b.y = v[1]; b.vy = v[2]; } });
    d.pf.forEach((v, i) => { const pl = this.platforms[i]; if (pl) { if (pl.trigger) pl.prog = v; else pl.t = v; } });
    d.ss?.forEach((v, i) => { if (this.seesaws[i]) this.seesaws[i].angle = v; });
    d.sp?.forEach((v, i) => { const s = this.springs[i]; if (s && s.kind === 'tramp') { s.charge = v[1]; s.lastBounce = v[2]; } });
    // 玩家:位置软纠偏(差异大则直接吸附)
    d.p.forEach((v, i) => {
      const pl = this.players[i];
      const [x, y, vx, vy, dead, ly] = v;
      pl.vx = vx; pl.vy = vy;
      if (Math.hypot(pl.x - x, pl.y - y) > 120) { pl.x = x; pl.y = y; }
      else { pl.x += (x - pl.x) * 0.35; pl.y += (y - pl.y) * 0.35; }
      if (dead && !pl.dead) { pl.dead = true; pl.deadT = 0.85; }
      else if (!dead && pl.dead) pl.dead = false;
      if (ly && !pl.lying) pl.lieDown();
      else if (!ly && pl.lying) pl.standUp();
    });
    // 无尽模式
    if (d.el && this.endless) {
      this.lavaY = d.el.la; this.hearts = d.el.ht; this.maxClimb = d.el.mc; this.gemIdx = d.el.gi;
      if (d.el.ov && !this.endlessOver) {
        this.endlessOver = true; this.state = 'over';
        this.hooks.onGameOver?.({ height: Math.round(this.maxClimb / 32), gems: this.gemIdx, time: this.time });
      }
    }
  }

  // ---------------- 绘制 ----------------
  draw(ctx, time, viewW, viewH) {
    const th = this.lv.theme;
    // 天空
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    // 星空
    if (th.stars) {
      for (let i = 0; i < 70; i++) {
        const bx = hash2(i, 3) * 2000;
        const x = ((bx - this.camera.x * 0.12) % (viewW + 40) + viewW + 40) % (viewW + 40) - 20;
        const y = hash2(i, 5) * viewH * 0.75 - this.camera.y * 0.06;
        const a = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.4 + i * 2.7));
        ctx.fillStyle = `rgba(255,255,${210 + (i % 40)},${a})`;
        ctx.fillRect(x, y, i % 7 === 0 ? 2.5 : 1.5, i % 7 === 0 ? 2.5 : 1.5);
      }
    }
    // 太阳/月亮
    if (th.sun) {
      ctx.fillStyle = th.sun;
      ctx.beginPath(); ctx.arc(viewW * 0.78, viewH * 0.2, 34, 0, TAU); ctx.fill();
      ctx.fillStyle = th.sky[1];
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(viewW * 0.78 + 12, viewH * 0.2 - 6, 28, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 云
    if (th.cloud) {
      ctx.fillStyle = th.cloud;
      for (let i = 0; i < 6; i++) {
        const speed = 6 + i * 2;
        const px = ((hash2(i, 9) * 2200 + time * speed - this.camera.x * 0.18) % (viewW + 260) + viewW + 260) % (viewW + 260) - 130;
        const py = viewH * (0.12 + hash2(i, 11) * 0.3);
        const s = 0.7 + hash2(i, 13) * 0.7;
        ctx.beginPath();
        ctx.ellipse(px, py, 34 * s, 13 * s, 0, 0, TAU);
        ctx.ellipse(px + 24 * s, py - 6 * s, 24 * s, 11 * s, 0, 0, TAU);
        ctx.ellipse(px - 24 * s, py - 2 * s, 20 * s, 9 * s, 0, 0, TAU);
        ctx.fill();
      }
    }
    // 远山(视差)
    for (const L of th.hills) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, viewH);
      for (let sx = 0; sx <= viewW + 16; sx += 16) {
        const wx = sx + this.camera.x * L.parallax;
        const y = viewH * L.base + Math.sin(wx * L.freq) * L.amp + Math.sin(wx * L.freq * 2.7 + 1.7) * L.amp * 0.35;
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(viewW, viewH);
      ctx.closePath(); ctx.fill();
    }

    // ---- 世界坐标 ----
    ctx.save();
    this.camera.apply(ctx);

    ctx.drawImage(this.staticLayer, 0, 0);

    for (const cr of this.cracked) drawCrack(ctx, cr);
    for (const pl of this.platforms) pl.draw(ctx, time);
    for (const d of this.doors) d.draw(ctx, time);
    for (const ss of this.seesaws) ss.draw(ctx, time);
    for (const pl of this.plates) drawPlate(ctx, pl, pl.pressed);
    for (const l of this.levers) drawLever(ctx, l, time);
    for (const s of this.springs) { if (s.kind === 'tramp') drawTramp(ctx, s, time); else drawSpring(ctx, s, time); }
    for (const c of this.checkpoints) drawCheckpoint(ctx, c, time);
    for (const g of this.gems) drawGem(ctx, g, time);
    {
      const e = this.exit;
      const in1 = !this.players[0].dead && aabb(this.players[0].x, this.players[0].y, this.players[0].w, this.players[0].h, e.x, e.y, e.w, e.h);
      const in2 = !this.players[1].dead && aabb(this.players[1].x, this.players[1].y, this.players[1].w, this.players[1].h, e.x, e.y, e.w, e.h);
      drawExit(ctx, e, time, in1, in2, (in1 ? 1 : 0) + (in2 ? 1 : 0));
    }
    for (const s of this.saws) s.draw(ctx, time);
    for (const f of this.flames) f.draw(ctx, time);
    for (const b of this.boxes) b.draw(ctx, time);
    particles.draw(ctx);

    // 无尽模式:岩浆(覆盖在地形之上)
    if (this.endless && this.lavaY < this.lv.ph + 240) {
      const y = this.lavaY;
      ctx.fillStyle = 'rgba(255,120,40,0.16)';
      ctx.fillRect(0, y - 46, this.lv.pw, 46);
      const g3 = ctx.createLinearGradient(0, y - 4, 0, y + 150);
      g3.addColorStop(0, '#ff9d2b');
      g3.addColorStop(0.3, '#ff5a2b');
      g3.addColorStop(1, '#b81f14');
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.moveTo(0, y + 160);
      ctx.lineTo(0, y);
      for (let x = 0; x <= this.lv.pw; x += 14) {
        ctx.lineTo(x, y + Math.sin(x * 0.045 + time * 2.4) * 5 + Math.sin(x * 0.012 - time * 1.5) * 4);
      }
      ctx.lineTo(this.lv.pw, y + 160);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffe38a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= this.lv.pw; x += 14) {
        const wy = y + Math.sin(x * 0.045 + time * 2.4) * 5 + Math.sin(x * 0.012 - time * 1.5) * 4;
        if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }

    // 提示气泡(画在角色下层,避免遮挡小拍档)
    for (const h of this.hints) {
      if (h.a < 0.03) continue;
      ctx.globalAlpha = h.a;
      ctx.font = '13px sans-serif';
      const tw = ctx.measureText(h.text).width;
      const bx = h.px + 16, by = h.py;
      ctx.fillStyle = 'rgba(20,24,40,0.82)';
      roundedRect(ctx, bx - tw / 2 - 10, by - 34, tw + 20, 26, 12); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(h.text, bx, by - 21);
      ctx.globalAlpha = 1;
    }

    for (const p of this.players) p.draw(ctx, time);

    if (this.debug) {
      ctx.strokeStyle = '#0f08'; ctx.lineWidth = 1;
      for (const p of this.players) ctx.strokeRect(p.x, p.y, p.w, p.h);
      for (const b of this.boxes) { ctx.strokeStyle = '#f808'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
    }

    ctx.restore();
  }
}

// 输入由 main 注入(避免循环依赖)
export let input4p = null;
export function bindInput(i) { input4p = i.players; }

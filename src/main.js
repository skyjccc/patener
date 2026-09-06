// 主循环:固定步长物理 + 渲染 + 状态机(标题/游戏/暂停)
// 联机模式:双机各跑一份模拟,30Hz 交换输入,主机 2Hz 同步状态纠偏
import { input, touchLayout } from './core/input.js';
import { unlock, musicTick, play, setMusic, setSfx, getMusic, getSfx, setMusicTrack } from './core/audio.js';
import { save } from './core/save.js';
import { net } from './core/net.js';
import { World, bindInput } from './game/world.js';
import { levelCount, levelMeta } from './game/level.js';
import { generateEndless } from './game/endless.js';
import { UI } from './ui/ui.js';
import { Player } from './game/player.js';
import { roundedRect, clamp, TAU } from './core/utils.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
input.init(canvas);
bindInput(input);

const params = new URLSearchParams(location.search);
if (params.get('mute') === '1') { save.setMusic(false); save.setSfx(false); }

// ---------- 全局状态 ----------
const G = {
  mode: 'title',        // title | play
  paused: false,
  levelIdx: 0,
  time: 0,
  viewW: 960, viewH: 540,
  roomsTimer: null,     // 房间列表刷新
  netInT: 0, netSyncT: 0,
};

const world = new World({
  onHud: w => {
    if (w.endless) ui.updateEndlessHud(w);
    else ui.setGems(w.gemMask);
  },
  onWin: stats => {
    const idx = G.levelIdx;
    save.unlockNext(idx);
    save.recordGems(idx, stats.gems);
    save.recordTime(idx, stats.time);
    save.recordFails(idx, stats.fails);
    if (net.peer && net.role === 'host') net.send({ t: 'sy', d: world.serializeState() });
    setTimeout(() => {
      G.paused = true;
      ui.showComplete(idx, stats, idx === levelCount() - 1);
    }, 1400);
  },
  onGameOver: stats => {
    const isRecord = save.recordHeight(stats.height);
    const show = () => {
      G.paused = true;
      ui.showOver(stats, save.bestHeight, isRecord, net.peer && net.role === 'guest');
    };
    if (net.peer && net.role === 'host') net.send({ t: 'sy', d: world.serializeState() });
    setTimeout(show, 1200);
  },
});

// ---------- 标题场景的小拍档 ----------
const mascots = [new Player(0, 0, 0), new Player(1, 0, 0)];
function layoutMascots() {
  mascots[0].x = G.viewW * 0.5 - 92; mascots[0].y = G.viewH - 118;
  mascots[1].x = G.viewW * 0.5 + 58; mascots[1].y = G.viewH - 118;
}

// ---------- 内部动作 ----------
function doPause() {
  if (G.mode !== 'play' || world.state === 'won' || world.state === 'over' || G.paused) return;
  G.paused = true;
  ui.showPause();
}
function doResume() {
  if (!G.paused) return;
  G.paused = false;
  ui.hideAll();
}

function startLevel(i) {
  G.levelIdx = i;
  G.mode = 'play';
  G.paused = false;
  world.load(i);
  world.debug = params.get('debug') === '1';
  dressPlayers();
  ui.setHud(i);
  ui.setEndlessHud(false);
  ui.showHUD(true);
  ui.hideAll();
  ui.toast(levelMeta(i).hint, 2200);
  setMusicTrack(['cave', 'night', 'starry', 'volcano'].includes(world.lv.themeKey) ? 'B' : 'A');
  // 联机:房主开局自动同步给伙伴(访客收到后调用不会二次发送)
  if (net.peer && net.role === 'host') net.send({ t: 'act', a: 'start', v: i });
}

// 无尽模式「岩浆攀爬」:种子确定性,双机生成同一座塔
function startEndless(seed) {
  const s = seed ?? (Date.now() % 1000000);
  G.levelIdx = -1;
  G.mode = 'play';
  G.paused = false;
  world.load(generateEndless(s));
  world.debug = params.get('debug') === '1';
  dressPlayers();
  $('hud-name').textContent = '🌋 岩浆攀爬';
  ui.setEndlessHud(true);
  ui.showHUD(true);
  ui.hideAll();
  ui.toast('岩浆要来了!向上爬,活得久一点!', 2400);
  setMusicTrack('B');
  if (net.peer && net.role === 'host') net.send({ t: 'act', a: 'endless', v: s });
}

// 水晶里程碑帽子
let lastHat = save.hat;
function dressPlayers() {
  const hat = save.hat;
  world.players.forEach(p => p.hat = hat);
  mascots.forEach(m => m.hat = hat);
  if (lastHat >= 0 && hat > lastHat) ui.toast('🎉 水晶收集里程碑:解锁新装扮!', 2600);
  lastHat = hat;
}

// 房主发起、双机同步的动作
function mpAct(a, v) { if (net.peer && net.role === 'host') net.send({ t: 'act', a, v }); }
function handleAct(a, v) {
  switch (a) {
    case 'start': startLevel(v); break;
    case 'endless': startEndless(v); break;
    case 'pause': doPause(); break;
    case 'resume': doResume(); break;
    case 'levels': ui.buildLevels(); ui.show('screen-levels'); break;
    case 'title': toTitleLocal(); break;
  }
}

function toTitleLocal() {
  G.mode = 'title'; G.paused = false;
  ui.showHUD(false);
  ui.show('screen-title');
}

// ---------- UI ----------
const ui = new UI({
  startGame: () => startLevel(Math.min(save.unlocked - 1, levelCount() - 1)),
  openLevels: () => { ui.buildLevels(); ui.show('screen-levels'); },
  openHelp: () => ui.show('screen-help'),
  closeHelp: () => { save.markHelpSeen(); G.mode === 'play' ? ui.hideAll() : ui.show('screen-title'); },
  toTitle: () => { G.mode = 'title'; G.paused = false; ui.showHUD(false); ui.show('screen-title'); },
  startLevel: i => startLevel(i),
  pause: () => { doPause(); if (net.peer) net.send({ t: 'act', a: 'pause' }); },
  resume: () => { doResume(); if (net.peer) net.send({ t: 'act', a: 'resume' }); },
  restart: () => startLevel(G.levelIdx),
  toLevels: () => { doPause(); mpAct('pause'); ui.buildLevels(); ui.show('screen-levels'); },
  nextLevel: () => startLevel(Math.min(G.levelIdx + 1, levelCount() - 1)),
  replay: () => startLevel(G.levelIdx),
  startEndless: () => startEndless(),
  overRetry: () => startEndless(),
  overTitle: () => { toTitleLocal(); mpAct('title'); },
  toggleMusic: () => { setMusic(!getMusic()); ui.refreshSoundBtns(); },
  toggleSfx: () => { setSfx(!getSfx()); ui.refreshSoundBtns(); },
  // ---- 联机 ----
  openNet: () => { ui.showNetHome(); },
  netCreate: () => {
    net.create().catch(e => ui.toast(e.message));
    ui.showNetWait();
    ui.netCode('····');
    ui.netStatus('连接服务器…');
    ui.netReadyToStart(false);
  },
  netJoinView: () => {
    ui.showNetJoin();
    ui.refreshRooms(code => {
      net.join(code).catch(e => ui.toast(e.message));
      ui.showNetWait();
      ui.netCode(code);
      ui.netStatus('加入中…');
    });
    clearInterval(G.roomsTimer);
    G.roomsTimer = setInterval(() => {
      if ($('screen-net').classList.contains('show') && $('net-join').style.display !== 'none') ui.refreshRooms();
      else clearInterval(G.roomsTimer);
    }, 2500);
  },
  netLeave: () => {
    net.leave();
    input.setMp(false, 0);
    G.mode = 'title'; G.paused = false;
    ui.showHUD(false);
    ui.showNetHome();
  },
  netStart: () => { ui.buildLevels(); ui.show('screen-levels'); }, // 房主去选关(选中后自动同步)
});
ui.refreshSoundBtns();
ui.show('screen-title');

// ---------- 联机事件 ----------
net.onStatus = msg => {
  ui.netStatus(msg);
  if (net.code) ui.netCode(net.code);
};
net.onPeer = on => {
  if (on) {
    input.setMp(true, net.myPid);
    ui.toast('伙伴已加入!🤝');
    if (net.role === 'host') {
      ui.netCode(net.code);
      ui.netStatus('已连接!点「选择关卡开始」选关');
      ui.netReadyToStart(true);
      $('btn-net-start').style.display = '';
    } else {
      $('btn-net-start').style.display = 'none';
      ui.netCode(net.code);
      ui.netStatus('已连接!等待房主选择关卡…');
    }
  } else {
    input.setMp(false, 0);
    ui.toast('对方已离开');
    if (G.mode === 'play') { G.mode = 'title'; G.paused = false; ui.showHUD(false); }
    if (net.role === 'host') {
      ui.showNetWait(); ui.netCode(net.code); ui.netStatus('等待伙伴加入…'); ui.netReadyToStart(false);
      $('btn-net-start').style.display = '';
    } else ui.showNetHome();
  }
};
net.onBye = () => {
  input.setMp(false, 0);
  if (G.mode === 'play' || G.paused) { G.mode = 'title'; G.paused = false; ui.showHUD(false); }
  ui.toast('连接已断开');
  ui.show('screen-title');
};
net.onMsg = m => {
  if (m.t === 'in') {
    input.remote[1 - net.myPid] = m.d;
  } else if (m.t === 'sy') {
    if (!G.paused) world.applySync(m.d);
  } else if (m.t === 'act') {
    handleAct(m.a, m.v);
  }
};

// ---------- 暂停/恢复 ----------
input.onPauseToggle = () => {
  if (G.mode !== 'play' || world.state === 'won' || world.state === 'over') return;
  if (G.paused) { doResume(); if (net.peer) net.send({ t: 'act', a: 'resume' }); }
  else { doPause(); if (net.peer) net.send({ t: 'act', a: 'pause' }); }
};
input.onRestart = () => {
  if (G.mode !== 'play' || G.paused) return;
  startLevel(G.levelIdx);
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'play' && !G.paused && world.state !== 'won' && world.state !== 'over') { doPause(); mpAct('pause'); }
});

// ---------- 尺寸 ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  G.viewW = window.innerWidth;
  G.viewH = window.innerHeight;
  canvas.width = Math.round(G.viewW * dpr);
  canvas.height = Math.round(G.viewH * dpr);
  canvas.style.width = G.viewW + 'px';
  canvas.style.height = G.viewH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.camera.setSize(G.viewW, G.viewH);
  layoutMascots();
}
window.addEventListener('resize', resize);
resize();

// ---------- 触控按钮绘制 ----------
function drawTouchControls() {
  if (!input.touchMode || G.mode !== 'play') return;
  ctx.save();
  const layouts = input.mp
    ? [{ half: touchLayout.solo, pid: input.myPid }]
    : touchLayout.halves.map((half, pid) => ({ half, pid }));
  for (const { half, pid } of layouts) {
    const col = pid === 0 ? '#ff8a3d' : '#3dc8ff';
    const j = touchLayout.joysticks[pid];
    if (j) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(j.ox, j.oy, 44, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.6;
      const dx = j.x - j.ox, dy = j.y - j.oy;
      const d = Math.hypot(dx, dy), m = Math.min(d, 34);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(j.ox + (d > 0 ? dx / d * m : 0), j.oy + (d > 0 ? dy / d * m : 0), 22, 0, TAU); ctx.fill();
    }
    const btn = (b, label) => {
      if (!b) return;
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(b.r * 0.52)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, b.cx, b.cy + 1);
    };
    btn(half.jump, '跳');
    btn(half.dash, pid === 0 ? '冲' : '喊');
    btn(half.ping, '喊');
  }
  ctx.restore();
}

// ---------- 标题场景绘制 ----------
function drawTitle(time, dt) {
  const th = { sky: ['#7ec9f5', '#cdeffd'], sun: '#fff3b0', cloud: 'rgba(255,255,255,0.92)' };
  const g = ctx.createLinearGradient(0, 0, 0, G.viewH);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, G.viewW, G.viewH);
  ctx.fillStyle = th.sun;
  ctx.beginPath(); ctx.arc(G.viewW * 0.8, G.viewH * 0.2, 40, 0, TAU); ctx.fill();
  ctx.fillStyle = th.cloud;
  for (let i = 0; i < 5; i++) {
    const px = ((i * 500 + time * (7 + i * 2)) % (G.viewW + 300)) - 150;
    const py = G.viewH * (0.14 + (i % 3) * 0.12);
    ctx.beginPath();
    ctx.ellipse(px, py, 40, 15, 0, 0, TAU);
    ctx.ellipse(px + 28, py - 7, 27, 12, 0, 0, TAU);
    ctx.ellipse(px - 28, py - 3, 23, 10, 0, 0, TAU);
    ctx.fill();
  }
  const gy = G.viewH - 90;
  ctx.fillStyle = '#8a5a36'; ctx.fillRect(0, gy, G.viewW, 90);
  ctx.fillStyle = '#6dbf4b'; roundedRect(ctx, -4, gy - 6, G.viewW + 8, 26, 8); ctx.fill();
  ctx.fillStyle = '#57a53b'; ctx.fillRect(0, gy + 12, G.viewW, 4);
  for (let i = 0; i < 8; i++) {
    const fx = (i * 173 + 60) % G.viewW, fy = gy - 14 + (i % 3) * 4;
    ctx.fillStyle = ['#ff6b9d', '#ffd23d', '#fff'][i % 3];
    ctx.beginPath(); ctx.arc(fx, fy, 3.4, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 2; i++) {
    const m = mascots[i];
    m.sy = 1 + Math.sin(time * 2.4 + i * 1.6) * 0.04;
    m.sx = 1 - Math.sin(time * 2.4 + i * 1.6) * 0.03;
    m.blinkT -= dt; if (m.blinkT < -0.12) m.blinkT = 2 + Math.random() * 3;
    m.draw(ctx, time);
  }
}

// ---------- 主循环 ----------
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function stepWorld(dt) {
  input.poll();
  world.update(dt, G.time += dt);
  input.endFrame();
}

function netTick(dt) {
  if (!net.peer || G.mode !== 'play') return;
  G.netInT += dt;
  if (G.netInT >= 1 / 30) {
    G.netInT = 0;
    net.send({ t: 'in', d: input.packLocal() });
    if (net.role === 'host' && !G.paused) {
      G.netSyncT += 1 / 30;
      if (G.netSyncT >= 0.5) { G.netSyncT = 0; net.send({ t: 'sy', d: world.serializeState() }); }
    }
  }
}

function renderFrame() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.mode === 'play') {
    world.draw(ctx, G.time, G.viewW, G.viewH);
    drawTouchControls();
    if (world.introT > 0) {
      const a = clamp(world.introT / 0.4, 0, 1) * clamp((1.6 - world.introT) / 0.3, 0, 1);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = 'rgba(15,18,32,0.6)';
      const title = G.levelIdx >= 0 ? `第 ${G.levelIdx + 1} 关 · ${levelMeta(G.levelIdx).name}` : '🌋 岩浆攀爬';
      ctx.fillRect(0, G.viewH * 0.3, G.viewW, 76);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(title, G.viewW / 2, G.viewH * 0.3 + 38);
      ctx.globalAlpha = 1;
    }
  } else {
    drawTitle(G.time, 1 / 60);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  G.time += dt;

  if (input.anyPress) unlock();
  musicTick();

  if (G.mode === 'play' && !G.paused) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      stepWorld(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 4) acc = 0;
    netTick(dt);
  } else {
    input.endFrame();
  }
  renderFrame();
}

requestAnimationFrame(frame);

// 调试钩子(?debug=1:后台环境/自动化测试可手动步进,也方便开发调试)
if (params.get('debug') === '1') {
  window.__game = {
    G, world, input, startLevel, net, doPause, doResume, ui,
    tick(dt = STEP, n = 1) {
      for (let i = 0; i < n; i++) { stepWorld(dt); netTick(dt); }
      renderFrame();
    },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); },
  };
}

if (!save.seenHelp) {
  setTimeout(() => ui.toast('第一次玩?先看看「玩法说明」吧!', 3000), 800);
}

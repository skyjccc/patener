// 输入系统:
//  - 同屏模式:键盘(双人各一组) + 触屏(屏幕左右分半,各自摇杆+按钮)
//  - 联机模式(mp):每台手机全屏只控制自己的角色;远端伙伴的输入由网络注入
function makePlayerState() {
  return {
    left: false, right: false, down: false,
    jumpHeld: false, jumpPressed: false,
    dashPressed: false, pingPressed: false,
    pingHeld: false, dashHeld: false,
  };
}

// 触屏按钮布局(CSS 像素,resize 时重算)
export const touchLayout = {
  W: 0, H: 0,
  halves: [],  // 同屏模式:两个半屏各自的按钮
  solo: null,  // 联机模式:整屏单角色布局
  joysticks: [null, null], // {id, ox, oy, x, y}
};

function relayout() {
  const W = window.innerWidth, H = window.innerHeight;
  touchLayout.W = W; touchLayout.H = H;
  const m = 20;
  for (let p = 0; p < 2; p++) {
    const side = p === 0 ? 1 : -1;
    const edge = p === 0 ? 0 : W;
    touchLayout.halves[p] = {
      jump: { cx: edge + side * (W * 0.5 - 70), cy: H - m - 82, r: 46 },
      dash: p === 0 ? { cx: edge + side * (W * 0.5 - 158), cy: H - m - 58, r: 33 } : null,
      ping: p === 0
        ? { cx: edge + side * (W * 0.5 - 132), cy: H - m - 146, r: 24 }
        : { cx: edge + side * (W * 0.5 - 158), cy: H - m - 58, r: 33 },
    };
  }
  // 联机单角色布局(整屏操作;guest 无冲刺键,「喊」放大)
  const isHost = (mpPid === 0);
  touchLayout.solo = {
    joyX1: W * 0.62,
    jump: { cx: W - m - 74, cy: H - m - 84, r: 48 },
    dash: isHost ? { cx: W - m - 176, cy: H - m - 60, r: 34 } : null,
    ping: isHost
      ? { cx: W - m - 148, cy: H - m - 152, r: 25 }
      : { cx: W - m - 176, cy: H - m - 60, r: 34 },
  };
}
let mpPid = 0; // relayout 依赖的当前角色(input 定义前就要可用)
relayout();
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', () => setTimeout(relayout, 250));

// 键盘按住状态独立记录,避免触摸摇杆回中时误清键盘方向
const keyHeld = [{ left: false, right: false, down: false }, { left: false, right: false, down: false }];

function keyMap(e) {
  switch (e.code) {
    case 'KeyA': return [0, 'left'];
    case 'KeyD': return [0, 'right'];
    case 'KeyS': return [0, 'down'];
    case 'KeyW': return [0, 'jump'];
    case 'KeyE': case 'ShiftLeft': return [0, 'dash'];
    case 'KeyQ': return [0, 'ping'];
    case 'ArrowLeft': return [1, 'left'];
    case 'ArrowRight': return [1, 'right'];
    case 'ArrowDown': return [1, 'down'];
    case 'ArrowUp': return [1, 'jump'];
    case 'Slash': case 'ShiftRight': return [1, 'dash'];
    case 'Period': return [1, 'ping'];
  }
  return null;
}

export const input = {
  players: [makePlayerState(), makePlayerState()],
  touchMode: false,
  anyPress: false,
  onPauseToggle: null,
  onRestart: null,
  // ---- 联机 ----
  mp: false,             // 联机模式
  myPid: 0,              // 本机角色
  remote: [null, null],  // 远端输入 {l,r,dn,j,jc,dc,pc}
  pressCount: [{ j: 0, d: 0, p: 0 }, { j: 0, d: 0, p: 0 }], // 本机按键沿计数(发给对方)
  _lastCount: [{ j: 0, d: 0, p: 0 }, { j: 0, d: 0, p: 0 }], // 远端计数上一次值

  setMp(on, myPid) {
    this.mp = on; this.myPid = myPid;
    mpPid = myPid;
    if (!on) { this.remote = [null, null]; }
    relayout();
  },

  _press(pid, btn) {
    const p = this.players[pid];
    this.anyPress = true;
    if (btn === 'jump' && !p.jumpHeld) { p.jumpPressed = true; p.jumpHeld = true; this.pressCount[pid].j++; }
    if (btn === 'dash') { p.dashPressed = true; this.pressCount[pid].d++; }
    if (btn === 'ping') { p.pingPressed = true; this.pressCount[pid].p++; }
  },

  init(canvas) {
    // ---- 键盘 ----
    window.addEventListener('keydown', e => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      const map = keyMap(e);
      if (map) {
        let [pid, btn] = map;
        if (this.mp) pid = this.myPid; // 联机:整组键盘控自己
        if (btn === 'jump') this._press(pid, 'jump');
        else if (btn === 'dash' || btn === 'ping') { this._press(pid, btn); this.players[pid][btn + 'Held'] = true; }
        else { this.players[pid][btn] = true; keyHeld[pid][btn] = true; }
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPauseToggle?.();
      if (e.code === 'KeyR') this.onRestart?.();
      this.anyPress = true;
    });
    window.addEventListener('keyup', e => {
      const map = keyMap(e);
      if (!map) return;
      let [pid, btn] = map;
      if (this.mp) pid = this.myPid;
      if (btn === 'jump') this.players[pid].jumpHeld = false;
      else if (btn === 'dash' || btn === 'ping') this.players[pid][btn + 'Held'] = false;
      else if (btn === 'left' || btn === 'right' || btn === 'down') { this.players[pid][btn] = false; keyHeld[pid][btn] = false; }
    });

    // ---- 触屏 ----
    const opts = { passive: false };
    const buttonsOf = pid => (this.mp ? touchLayout.solo : touchLayout.halves[pid]);
    const halfOf = x => (x < window.innerWidth / 2 ? 0 : 1);
    const pidOf = x => (this.mp ? this.myPid : halfOf(x));
    const hitButton = (pid, x, y) => {
      const h = buttonsOf(pid);
      for (const name of ['jump', 'dash', 'ping']) {
        const b = h[name];
        if (!b) continue;
        const dx = x - b.cx, dy = y - b.cy;
        if (dx * dx + dy * dy < (b.r + 16) ** 2) return name;
      }
      return null;
    };

    // 只接管落在画布上的触摸;落在 DOM 控件(菜单按钮等)上的触摸不拦截,
    // 否则 preventDefault 会抑制 click 合成,手机端所有按钮都会失灵
    const isGameTouch = e => e.target === canvas;

    const onDown = e => {
      if (!isGameTouch(e)) return;
      e.preventDefault();
      this.touchMode = true;
      this.anyPress = true;
      for (const t of e.changedTouches) {
        const pid = pidOf(t.clientX);
        const btn = hitButton(pid, t.clientX, t.clientY);
        if (btn) {
          this._press(pid, btn);
          if (btn === 'dash' || btn === 'ping') this.players[pid][btn + 'Held'] = true;
          touchLayout['_id' + pid + '_' + btn] = t.identifier;
        } else if (!this.mp || t.clientX < touchLayout.solo.joyX1) {
          // 联机时按钮区右侧不走摇杆;同屏时按钮优先已处理
          touchLayout.joysticks[pid] = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        }
      }
    };
    const onMove = e => {
      if (!isGameTouch(e)) return;
      e.preventDefault();
      for (const t of e.changedTouches)
        for (let pid = 0; pid < 2; pid++) {
          const j = touchLayout.joysticks[pid];
          if (j && j.id === t.identifier) { j.x = t.clientX; j.y = t.clientY; }
        }
    };
    const onUp = e => {
      if (!isGameTouch(e)) return;
      e.preventDefault();
      for (const t of e.changedTouches)
        for (let pid = 0; pid < 2; pid++) {
          const j = touchLayout.joysticks[pid];
          if (j && j.id === t.identifier) touchLayout.joysticks[pid] = null;
          for (const name of ['jump', 'dash', 'ping']) {
            if (touchLayout['_id' + pid + '_' + name] === t.identifier) {
              touchLayout['_id' + pid + '_' + name] = undefined;
              if (name === 'jump') this.players[pid].jumpHeld = false;
              else this.players[pid][name + 'Held'] = false;
            }
          }
        }
    };

    window.addEventListener('touchstart', onDown, opts);
    window.addEventListener('touchmove', onMove, opts);
    window.addEventListener('touchend', onUp, opts);
    window.addEventListener('touchcancel', onUp, opts);
    window.addEventListener('contextmenu', e => e.preventDefault());
  },

  // 帧首:触摸摇杆 → 方向键;联机时把远端输入写入伙伴位
  poll() {
    for (let pid = 0; pid < 2; pid++) {
      const p = this.players[pid];
      // 本机触摸摇杆
      const j = touchLayout.joysticks[pid];
      if (j) {
        const dx = j.x - j.ox, dy = j.y - j.oy;
        if (Math.abs(dx) > 10) { p.right = dx > 0; p.left = dx < 0; }
        else { p.right = false; p.left = false; }
        const pullingDown = Math.hypot(dx, dy) > 26 && dy > Math.abs(dx) * 1.2;
        if (pullingDown) p.down = true;
        else if (!keyHeld[pid].down) p.down = false;
      }
      // 联机:远端伙伴输入覆盖
      if (this.mp && pid !== this.myPid) {
        const r = this.remote[pid];
        const last = this._lastCount[pid];
        if (r) {
          p.left = !!r.l; p.right = !!r.r; p.down = !!r.dn;
          p.jumpHeld = !!r.j;
          p.pingHeld = !!r.ph; p.dashHeld = !!r.dh;
          if ((r.jc || 0) > last.j) { p.jumpPressed = true; last.j = r.jc; }
          if ((r.dc || 0) > last.d) { p.dashPressed = true; last.d = r.dc; }
          if ((r.pc || 0) > last.p) { p.pingPressed = true; last.p = r.pc; }
        } else {
          p.left = p.right = p.down = p.jumpHeld = p.pingHeld = p.dashHeld = false;
        }
      }
    }
  },

  // 联机:本机输入打包(30Hz 发送)
  packLocal() {
    const pid = this.myPid;
    const p = this.players[pid];
    const c = this.pressCount[pid];
    return { l: p.left, r: p.right, dn: p.down, j: p.jumpHeld, ph: p.pingHeld, dh: p.dashHeld, jc: c.j, dc: c.d, pc: c.p };
  },

  endFrame() {
    for (const p of this.players) { p.jumpPressed = false; p.dashPressed = false; p.pingPressed = false; }
    this.anyPress = false;
  },
};

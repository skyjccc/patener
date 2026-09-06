// DOM 界面层:标题 / 选关 / 帮助 / 暂停 / 结算 / 联机 / HUD / Toast
import { levelCount, levelMeta } from '../game/level.js';
import { save } from '../core/save.js';
import { net } from '../core/net.js';
import { play } from '../core/audio.js';
import { fmtTime } from '../core/utils.js';

const $ = id => document.getElementById(id);

const SCREENS = ['screen-title', 'screen-levels', 'screen-help', 'screen-pause', 'screen-complete', 'screen-net', 'screen-over'];

export class UI {
  constructor(actions) {
    this.actions = actions;
    $('btn-start').onclick = () => this.act('startGame');
    $('btn-net').onclick = () => this.act('openNet');
    $('btn-endless').onclick = () => this.act('startEndless');
    $('btn-levels').onclick = () => this.act('openLevels');
    $('btn-help').onclick = () => this.act('openHelp');
    $('btn-sound').onclick = () => this.act('toggleSfx');
    $('btn-help-ok').onclick = () => this.act('closeHelp');
    $('btn-back-title').onclick = () => this.act('toTitle');
    $('btn-pause').onclick = () => this.act('pause');
    $('btn-resume').onclick = () => this.act('resume');
    $('btn-restart').onclick = () => this.act('restart');
    $('btn-pause-levels').onclick = () => this.act('toLevels');
    $('btn-pause-music').onclick = () => this.act('toggleMusic');
    $('btn-pause-sfx').onclick = () => this.act('toggleSfx');
    $('btn-next').onclick = () => this.act('nextLevel');
    $('btn-replay').onclick = () => this.act('replay');
    $('btn-complete-levels').onclick = () => this.act('toLevels');
    $('btn-over-retry').onclick = () => this.act('overRetry');
    $('btn-over-title').onclick = () => this.act('overTitle');
    // 联机
    $('btn-net-create').onclick = () => this.act('netCreate');
    $('btn-net-join').onclick = () => this.act('netJoinView');
    $('btn-net-back').onclick = () => this.act('toTitle');
    $('btn-net-join-back').onclick = () => this.showNetHome();
    $('btn-net-leave').onclick = () => this.act('netLeave');
    $('btn-net-start').onclick = () => this.act('netStart');
  }

  act(name) { play('ui'); this.actions[name]?.(); }

  show(id) {
    for (const s of SCREENS) $(s).classList.toggle('show', s === id);
  }
  hideAll() { this.show(null); }

  // ---------- 联机 ----------
  showNetHome() {
    $('net-home').style.display = 'flex';
    $('net-join').style.display = 'none';
    $('net-wait').style.display = 'none';
    this.show('screen-net');
  }
  showNetJoin() {
    $('net-home').style.display = 'none';
    $('net-join').style.display = 'flex';
    $('net-wait').style.display = 'none';
    this.show('screen-net');
  }
  showNetWait() {
    $('net-home').style.display = 'none';
    $('net-join').style.display = 'none';
    $('net-wait').style.display = 'flex';
    this.show('screen-net');
  }
  netStatus(msg) { $('net-status').textContent = msg; }
  netCode(code) { $('net-code').textContent = code; }
  netReadyToStart(on) { $('btn-net-start').disabled = !on; }

  async refreshRooms(pick) {
    const list = await net.listRooms();
    const el = $('room-list');
    el.innerHTML = '';
    const joinable = list.filter(r => r.joinable);
    if (joinable.length === 0) {
      const d = document.createElement('div');
      d.className = 'room-item empty';
      d.textContent = '暂无房间,让伙伴先创建一个吧';
      el.appendChild(d);
      return;
    }
    for (const r of joinable) {
      const b = document.createElement('button');
      b.className = 'room-item';
      b.innerHTML = `<span>房间 <span class="code">${r.code}</span></span><span>加入 →</span>`;
      b.onclick = () => pick(r.code);
      el.appendChild(b);
    }
  }

  // ---------- 通用 ----------
  showHUD(on) { $('hud').classList.toggle('show', on); }

  showPause() {
    const guest = net.peer && net.role === 'guest';
    $('pause-host-btns').style.display = guest ? 'none' : '';
    $('pause-mp-tip').style.display = guest ? '' : 'none';
    this.show('screen-pause');
  }

  setEndlessHud(on) {
    $('hud-endless').style.display = on ? 'flex' : 'none';
    $('hud-gems').style.display = on ? 'none' : '';
  }

  updateEndlessHud(w) {
    $('hud-hearts').textContent = '❤'.repeat(Math.max(0, w.hearts)) + '🖤'.repeat(Math.max(0, 3 - w.hearts));
    $('hud-height').textContent = Math.round(w.maxClimb / 32) + 'm';
  }

  showOver(stats, best, isRecord, isGuest) {
    $('over-height').textContent = stats.height + 'm';
    $('over-gems').textContent = stats.gems;
    $('over-best').textContent = best + 'm';
    $('over-record').style.display = isRecord ? 'flex' : 'none';
    $('over-host-btns').style.display = isGuest ? 'none' : '';
    $('over-mp-wait').style.display = isGuest ? '' : 'none';
    this.show('screen-over');
  }

  setHud(idx) {
    const meta = levelMeta(idx);
    $('hud-name').textContent = `第 ${idx + 1} 关 · ${meta.name}`;
    this.setGems([false, false, false]);
  }

  setGems(mask) {
    const el = $('hud-gems');
    el.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('span');
      d.className = 'g' + (mask[i] ? ' on' : '');
      el.appendChild(d);
    }
  }

  buildLevels() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    const guestLocked = net.peer && net.role === 'guest';
    for (let i = 0; i < levelCount(); i++) {
      const unlocked = save.isUnlocked(i) && !guestLocked;
      const meta = levelMeta(i);
      const btn = document.createElement('button');
      btn.className = 'lv-card' + (unlocked ? '' : ' locked');
      const gems = save.gemMask(i);
      btn.innerHTML = `
        <div class="lv-num">${unlocked ? i + 1 : '🔒'}</div>
        <div class="lv-name">${meta.name}</div>
        <div class="lv-gems">${[0, 1, 2].map(k => `<span class="g ${gems[k] ? 'on' : ''}"></span>`).join('')}</div>`;
      btn.onclick = () => { play('ui'); this.actions.startLevel(i); };
      grid.appendChild(btn);
    }
  }

  showComplete(idx, stats, isLast) {
    const best = save.bestOf(idx);
    $('complete-title').textContent = isLast ? '全部通关!🏆' : '过关啦!🎉';
    // 勋章:限时达标 / 零失误
    const lv = LEVEL_PAR[idx];
    const medals = [];
    if (lv && stats.time <= lv) medals.push('<span class="medal gold">⚡ 限时达人 ≤' + lv + 's</span>');
    if (stats.fails === 0) medals.push('<span class="medal perfect">🌟 零失误</span>');
    $('complete-medals').innerHTML = medals.join('');
    $('complete-gems').innerHTML = [0, 1, 2]
      .map(k => `<span class="g ${stats.gems[k] ? 'on' : ''}"></span>`).join('');
    $('stat-time').textContent = fmtTime(stats.time);
    $('stat-fails').textContent = stats.fails;
    $('stat-best').textContent = best != null ? fmtTime(best) : fmtTime(stats.time);
    $('btn-next').style.display = isLast ? 'none' : '';
    const guest = net.peer && net.role === 'guest';
    $('complete-host-btns').style.display = guest ? 'none' : '';
    $('complete-host-btns2').style.display = guest ? 'none' : '';
    $('complete-mp-wait').style.display = guest ? '' : 'none';
    this.show('screen-complete');
  }

  refreshSoundBtns() {
    $('btn-sound').textContent = save.sfx ? '♪ 音效 开' : '♪ 音效 关';
    $('btn-pause-music').textContent = save.music ? '🎵 音乐 开' : '🎵 音乐 关';
    $('btn-pause-sfx').textContent = save.sfx ? '🔊 音效 开' : '🔊 音效 关';
  }

  toast(msg, ms = 1800) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
}

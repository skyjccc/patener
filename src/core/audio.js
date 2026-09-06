// 音频:WebAudio 全合成(音效 + 循环BGM),无任何素材文件
import { save } from './save.js';

let ctx = null, master, musicBus, sfxBus;
let musicOn = true, sfxOn = true;
let seq = null; // BGM 调度器

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = save.music ? 0.5 : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = save.sfx ? 0.85 : 0; sfxBus.connect(master);
    musicOn = save.music; sfxOn = save.sfx;
    startMusic();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch { } }

// ---------- 基础合成器 ----------
function tone({ freq, to = null, dur = 0.15, type = 'square', vol = 0.2, when = 0, attack = 0.004, dest = null, bend = 'exp' }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (to && to !== freq) {
    if (bend === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    else o.frequency.linearRampToValueAtTime(Math.max(20, to), t0 + dur);
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(dest || sfxBus);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

let noiseBuf = null;
function noise({ dur = 0.2, vol = 0.2, freq = 1200, q = 1, when = 0, sweepTo = null, dest = null }) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + when;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(dest || sfxBus);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

const midi = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------- 音效表 ----------
export const sfx = {
  jump()      { tone({ freq: 300, to: 560, dur: 0.13, type: 'square', vol: 0.13 }); },
  djump()     { tone({ freq: 420, to: 640, dur: 0.09, type: 'square', vol: 0.12 }); tone({ freq: 540, to: 820, dur: 0.11, type: 'square', vol: 0.11, when: 0.05 }); },
  boost()     { tone({ freq: 340, to: 900, dur: 0.2, type: 'triangle', vol: 0.2 }); tone({ freq: 680, to: 1400, dur: 0.18, type: 'sine', vol: 0.1, when: 0.03 }); },
  dash()      { noise({ dur: 0.18, vol: 0.16, freq: 2400, sweepTo: 500, q: 0.8 }); tone({ freq: 220, to: 90, dur: 0.16, type: 'sawtooth', vol: 0.09 }); },
  land()      { tone({ freq: 150, to: 95, dur: 0.07, type: 'triangle', vol: 0.14 }); },
  death()     { tone({ freq: 420, to: 70, dur: 0.4, type: 'square', vol: 0.16 }); noise({ dur: 0.3, vol: 0.1, freq: 900, sweepTo: 200 }); },
  gem()       { tone({ freq: 660, dur: 0.09, type: 'sine', vol: 0.14 }); tone({ freq: 880, dur: 0.1, type: 'sine', vol: 0.13, when: 0.06 }); tone({ freq: 1320, dur: 0.16, type: 'sine', vol: 0.12, when: 0.12 }); },
  checkpoint(){ tone({ freq: 523, dur: 0.1, type: 'triangle', vol: 0.15 }); tone({ freq: 784, dur: 0.18, type: 'triangle', vol: 0.15, when: 0.09 }); },
  plate()     { tone({ freq: 1100, to: 800, dur: 0.06, type: 'square', vol: 0.07 }); },
  lever()     { tone({ freq: 500, to: 300, dur: 0.09, type: 'square', vol: 0.1 }); tone({ freq: 300, to: 500, dur: 0.09, type: 'square', vol: 0.1, when: 0.09 }); },
  door()      { noise({ dur: 0.32, vol: 0.08, freq: 500, sweepTo: 1400, q: 2 }); tone({ freq: 160, to: 320, dur: 0.3, type: 'triangle', vol: 0.08 }); },
  spring()    { tone({ freq: 190, to: 880, dur: 0.2, type: 'sine', vol: 0.2, bend: 'exp' }); },
  crack()     { noise({ dur: 0.22, vol: 0.2, freq: 700, sweepTo: 180, q: 1.5 }); tone({ freq: 130, to: 60, dur: 0.16, type: 'square', vol: 0.1 }); },
  lie()       { tone({ freq: 300, to: 160, dur: 0.16, type: 'sine', vol: 0.16 }); },
  tramp()     { tone({ freq: 160, to: 900, dur: 0.24, type: 'sine', vol: 0.22 }); tone({ freq: 320, to: 1300, dur: 0.2, type: 'triangle', vol: 0.1, when: 0.02 }); },
  fire()      { noise({ dur: 0.3, vol: 0.1, freq: 900, sweepTo: 300, q: 0.7 }); },
  win()       { [523, 659, 784, 1047].forEach((f, i) => { tone({ freq: f, dur: 0.16, type: 'square', vol: 0.12, when: i * 0.11 }); tone({ freq: f * 2, dur: 0.14, type: 'sine', vol: 0.07, when: i * 0.11 }); }); tone({ freq: 1319, dur: 0.5, type: 'sine', vol: 0.1, when: 0.46 }); },
  ping()      { tone({ freq: 740, to: 988, dur: 0.09, type: 'triangle', vol: 0.14 }); },
  ui()        { tone({ freq: 700, dur: 0.05, type: 'square', vol: 0.08 }); },
  pop()       { tone({ freq: 500, to: 900, dur: 0.07, type: 'sine', vol: 0.1 }); },
};

// ---------- BGM:两条轨道 ----------
// A:C-G-Am-F 明快四小节循环(地表关)
// B:Am-F-C-E 小调循环(洞穴/黑夜/火山),更慢更神秘
const M = { C: 72, D: 74, E: 76, F: 77, G: 79, A: 81, C6: 84, B3: 71, GS4: 68 };
const MELODY = [
  [[0,M.E,2],[2,M.G,2],[4,M.A,2],[6,M.G,2],[8,M.E,2],[12,M.C,3]],
  [[0,M.D,2],[2,M.G,2],[4,M.G,2],[6,M.A,2],[8,M.G,3],[12,M.D,3]],
  [[0,M.A,2],[2,M.G,2],[4,M.E,2],[6,M.G,2],[8,M.A,2],[10,M.C6,2],[12,M.A,3]],
  [[0,M.A,2],[4,M.G,2],[8,M.E,2],[12,M.D,3]],
];
const BASS = [
  { bar: 0, root: 36 }, { bar: 1, root: 31 }, { bar: 2, root: 33 }, { bar: 3, root: 29 },
];
const MELODY_B = [
  [[0,M.A,3],[4,M.E,2],[6,M.G,2],[8,M.A,4],[12,M.G,3]],
  [[0,M.F,3],[4,M.A,2],[6,M.C6,2],[8,M.A,4],[12,M.G,2]],
  [[0,M.E,3],[4,M.C,2],[6,M.D,2],[8,M.E,4],[12,M.D,2]],
  [[0,M.D,2],[2,M.E,2],[4,M.GS4,4],[8,M.B3,4],[12,M.E,3]],
];
const BASS_B = [
  { bar: 0, root: 33 }, { bar: 1, root: 29 }, { bar: 2, root: 36 }, { bar: 3, root: 28 },
];
let curTrack = 'A';
export function setMusicTrack(name) {
  if (curTrack === name) return;
  curTrack = name === 'B' ? 'B' : 'A';
  if (seq) { seq.step = 0; } // 从头切换,避免小节错位
}

function scheduleStep(step, t) {
  const bar = Math.floor(step / 16) % 4, s = step % 16;
  const trackB = curTrack === 'B';
  const mel = trackB ? MELODY_B[bar] : MELODY[bar];
  const stepDur = (60 / (trackB ? 96 : 112) / 4);
  const when = t - ctx.currentTime;
  // 旋律
  for (const [st, m, len] of mel) {
    if (s === st) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = trackB ? 'triangle' : 'square';
      o.frequency.value = midi(m);
      f.type = 'lowpass'; f.frequency.value = trackB ? 1100 : 1500;
      const dur = len * stepDur;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(trackB ? 0.09 : 0.075, t + 0.01);
      g.gain.setValueAtTime(trackB ? 0.09 : 0.075, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f).connect(g).connect(musicBus);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  // 贝斯
  const bass = (trackB ? BASS_B : BASS)[bar];
  const hits = trackB ? [0, 8] : [0, 6, 10];
  if (hits.includes(s)) {
    tone({ freq: midi(bass.root + (s === 10 ? 7 : 0)), dur: 0.26, type: 'triangle', vol: 0.16, when, dest: musicBus, attack: 0.01 });
  }
  // 轻鼓
  if (s % 4 === 0) noise({ dur: 0.04, vol: s % 8 === 0 ? 0.05 : 0.03, freq: 6000, q: 0.6, when, dest: musicBus });
  if (s === 0 || s === 8) tone({ freq: 110, to: 45, dur: 0.1, type: 'sine', vol: trackB ? 0.16 : 0.22, when, dest: musicBus });
}

function startMusic() {
  if (!ctx || seq) return;
  seq = { step: 0, next: ctx.currentTime + 0.1 };
  // 由主循环每帧调用 musicTick()
}

export function musicTick() {
  if (!ctx || !seq) return;
  const trackB = curTrack === 'B';
  const stepDur = 60 / (trackB ? 96 : 112) / 4;
  while (seq.next < ctx.currentTime + 0.15) {
    scheduleStep(seq.step, seq.next);
    seq.step = (seq.step + 1) % 64;
    seq.next += stepDur;
  }
}

export function setMusic(on) {
  musicOn = on; save.setMusic(on);
  if (musicBus) musicBus.gain.linearRampToValueAtTime(on ? 0.5 : 0, ctx.currentTime + 0.1);
}
export function setSfx(on) {
  sfxOn = on; save.setSfx(on);
  if (sfxBus) sfxBus.gain.value = on ? 0.85 : 0;
}
export const getMusic = () => musicOn;
export const getSfx = () => sfxOn;

export function play(name) { if (ctx && sfxOn && sfx[name]) sfx[name](); }

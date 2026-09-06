// 存档:解锁进度 / 水晶 / 最佳时间 / 声音设置(localStorage)
const KEY = 'partnerQuest.save.v1';

const DEFAULTS = {
  unlocked: 1,          // 已解锁到的关卡数(从 1 计)
  gems: {},             // { levelIdx: [bool,bool,bool] }
  best: {},             // { levelIdx: 秒 }
  bestFails: {},        // { levelIdx: 最少失误 }
  bestHeight: 0,        // 无尽模式最高(米)
  music: true,
  sfx: true,
  seenHelp: false,
};

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 隐私模式等场景忽略 */ }
}

export const save = {
  get data() { return data; },
  get unlocked() { return data.unlocked; },
  isUnlocked(i) { return i < data.unlocked; },
  unlockNext(i) { if (i + 2 > data.unlocked) { data.unlocked = Math.min(i + 2, 99); persist(); } },
  gemsOf(i) { const g = data.gems[i]; return g ? g.filter(Boolean).length : 0; },
  gemMask(i) { const g = data.gems[i]; return g ? [...g] : [false, false, false]; },
  recordGems(i, mask) {
    const cur = this.gemMask(i);
    const merged = cur.map((v, k) => v || mask[k] || false);
    if (merged.some((v, k) => v !== cur[k])) { data.gems[i] = merged; persist(); }
  },
  bestOf(i) { return data.best[i] ?? null; },
  recordTime(i, t) { if (data.best[i] == null || t < data.best[i]) { data.best[i] = t; persist(); return true; } return false; },
  bestFailsOf(i) { return data.bestFails[i] ?? null; },
  recordFails(i, f) { if (data.bestFails[i] == null || f < data.bestFails[i]) { data.bestFails[i] = f; persist(); } },
  get bestHeight() { return data.bestHeight; },
  recordHeight(h) { if (h > data.bestHeight) { data.bestHeight = h; persist(); return true; } return false; },
  // 全收集水晶数(决定帽子)
  get totalGems() { return Object.values(data.gems).reduce((n, g) => n + g.filter(Boolean).length, 0); },
  get hat() { const t = this.totalGems; return t >= 30 ? 3 : t >= 18 ? 2 : t >= 8 ? 1 : 0; },
  get music() { return data.music; },
  get sfx() { return data.sfx; },
  setMusic(v) { data.music = v; persist(); },
  setSfx(v) { data.sfx = v; persist(); },
  markHelpSeen() { data.seenHelp = true; persist(); },
  get seenHelp() { return data.seenHelp; },
  reset() { data = { ...DEFAULTS }; persist(); },
};

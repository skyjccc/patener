// 关卡主题:天空渐变 / 远近山丘 / 云 / 瓦片配色 / 环境漂浮粒子
export const THEMES = {
  meadow: {
    sky: ['#7ec9f5', '#cdeffd'], sun: '#fff3b0', cloud: 'rgba(255,255,255,0.9)',
    hills: [
      { color: '#a8e063', base: 0.72, amp: 60, freq: 0.0045, parallax: 0.35 },
      { color: '#7ec850', base: 0.85, amp: 45, freq: 0.006, parallax: 0.6 },
    ],
    tile: { base: '#8a5a36', top: '#6dbf4b', topDeep: '#57a53b', edge: '#6d4527', speck: 'rgba(0,0,0,0.13)' },
    ambient: 'leaf', ambientColor: 'rgba(255,255,255,0.75)',
  },
  dusk: {
    sky: ['#f2a65a', '#f7d4a0'], sun: '#fff0c2', cloud: 'rgba(255,236,210,0.85)',
    hills: [
      { color: '#c97b4a', base: 0.72, amp: 70, freq: 0.004, parallax: 0.35 },
      { color: '#a05a3c', base: 0.85, amp: 50, freq: 0.0058, parallax: 0.6 },
    ],
    tile: { base: '#9c6b4f', top: '#e0906a', topDeep: '#c97a55', edge: '#7c5240', speck: 'rgba(0,0,0,0.15)' },
    ambient: 'dust', ambientColor: 'rgba(255,220,180,0.6)',
  },
  sky: {
    sky: ['#5aa9f2', '#a8dcff'], sun: '#fffbe0', cloud: 'rgba(255,255,255,0.95)',
    hills: [
      { color: '#bfe3ff', base: 0.7, amp: 80, freq: 0.0035, parallax: 0.3 },
      { color: '#93cdf7', base: 0.85, amp: 55, freq: 0.005, parallax: 0.55 },
    ],
    tile: { base: '#7f96c9', top: '#eef6ff', topDeep: '#c3d8f2', edge: '#5f76a8', speck: 'rgba(255,255,255,0.25)' },
    ambient: 'dust', ambientColor: 'rgba(255,255,255,0.8)',
  },
  cave: {
    sky: ['#242c47', '#3a4468'], sun: null, cloud: null,
    hills: [
      { color: '#2c3654', base: 0.7, amp: 90, freq: 0.004, parallax: 0.3 },
      { color: '#1f2740', base: 0.85, amp: 60, freq: 0.006, parallax: 0.55 },
    ],
    tile: { base: '#4a5578', top: '#5d6b94', topDeep: '#414d70', edge: '#333d5c', speck: 'rgba(255,255,255,0.08)' },
    ambient: 'dust', ambientColor: 'rgba(140,180,255,0.35)',
  },
  snow: {
    sky: ['#8fb8e8', '#dceafc'], sun: '#ffffff', cloud: 'rgba(255,255,255,0.9)',
    hills: [
      { color: '#e8f2fc', base: 0.7, amp: 75, freq: 0.004, parallax: 0.3 },
      { color: '#c9dcf0', base: 0.85, amp: 50, freq: 0.0055, parallax: 0.55 },
    ],
    tile: { base: '#6b7f9e', top: '#f4faff', topDeep: '#d4e4f4', edge: '#4f627e', speck: 'rgba(255,255,255,0.3)' },
    ambient: 'snow', ambientColor: 'rgba(255,255,255,0.9)',
  },
  sunset: {
    sky: ['#e8735e', '#f7b98a'], sun: '#ffe3a8', cloud: 'rgba(255,214,180,0.8)',
    hills: [
      { color: '#8a4a5e', base: 0.7, amp: 85, freq: 0.004, parallax: 0.3 },
      { color: '#63344a', base: 0.85, amp: 55, freq: 0.006, parallax: 0.55 },
    ],
    tile: { base: '#7c4a56', top: '#e88a6a', topDeep: '#c96f52', edge: '#5e3742', speck: 'rgba(0,0,0,0.16)' },
    ambient: 'leaf', ambientColor: 'rgba(255,200,150,0.7)',
  },
  night: {
    sky: ['#1c2340', '#3d4a7a'], sun: '#f4f0da', cloud: 'rgba(200,215,255,0.25)',
    hills: [
      { color: '#2a3358', base: 0.7, amp: 85, freq: 0.004, parallax: 0.3 },
      { color: '#1e2542', base: 0.85, amp: 55, freq: 0.006, parallax: 0.55 },
    ],
    tile: { base: '#3e4a70', top: '#5a6b9e', topDeep: '#465580', edge: '#2c3554', speck: 'rgba(255,255,255,0.1)' },
    ambient: 'star', ambientColor: 'rgba(255,255,220,0.85)',
    stars: true,
  },
  starry: {
    sky: ['#141a36', '#4a3a7a'], sun: '#fdf6c8', cloud: 'rgba(220,200,255,0.22)',
    hills: [
      { color: '#2e2650', base: 0.7, amp: 90, freq: 0.004, parallax: 0.3 },
      { color: '#221c3e', base: 0.85, amp: 60, freq: 0.006, parallax: 0.55 },
    ],
    tile: { base: '#4a3f72', top: '#8a76c9', topDeep: '#6b59a5', edge: '#372e58', speck: 'rgba(255,255,255,0.14)' },
    ambient: 'star', ambientColor: 'rgba(255,250,210,0.9)',
    stars: true,
  },
  volcano: {
    sky: ['#3a1410', '#8a2f1a'], sun: '#ff8a3d', cloud: 'rgba(255,140,80,0.18)',
    hills: [
      { color: '#4a1d14', base: 0.7, amp: 95, freq: 0.004, parallax: 0.3 },
      { color: '#33120c', base: 0.85, amp: 60, freq: 0.006, parallax: 0.55 },
    ],
    tile: { base: '#4a3038', top: '#8a4a3a', topDeep: '#6b382c', edge: '#38222a', speck: 'rgba(255,160,90,0.18)' },
    ambient: 'ember', ambientColor: 'rgba(255,150,60,0.8)',
  },
  dawn: {
    sky: ['#f7b8c4', '#ffe3b0'], sun: '#fff4cf', cloud: 'rgba(255,235,235,0.85)',
    hills: [
      { color: '#d88aa0', base: 0.7, amp: 80, freq: 0.004, parallax: 0.3 },
      { color: '#a86a8a', base: 0.85, amp: 55, freq: 0.006, parallax: 0.55 },
    ],
    tile: { base: '#8a5a70', top: '#ffcf9e', topDeep: '#e0a878', edge: '#6b4256', speck: 'rgba(255,255,255,0.2)' },
    ambient: 'leaf', ambientColor: 'rgba(255,230,200,0.8)',
  },
};

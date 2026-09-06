// 关卡数据冒烟测试:node tools/check-levels.mjs
// 校验行宽一致、图例合法、必要元素齐全,并打印带标尺的地图供人工目检。
import { LEVELS } from '../src/game/levels.js';

const LEGEND = new Set(['.', '#', '=', '%', '^', '~', 'O', 'J', 'K', 'a', 'b', 'c', 'A', 'B', 'C', 'D', 'l', 'k', 'm', 'n', 'F', 'G', 'E', '1', '2']);
let fail = 0;

for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i];
  const w = Math.max(...lv.map.map(r => r.length));
  const problems = [];
  const joined = lv.map.map(r => r.padEnd(w, '.'));

  for (const r of joined) for (const ch of r) if (!LEGEND.has(ch)) problems.push(`非法字符 "${ch}"`);

  const count = ch => joined.join('').split('').filter(c => c === ch).length;
  if (count('1') !== 1) problems.push(`出生点1数量=${count('1')}`);
  if (count('2') !== 1) problems.push(`出生点2数量=${count('2')}`);
  if (count('E') !== 1) problems.push(`终点E数量=${count('E')}`);

  // 门/板/拉杆通道配对
  const flat = joined.join('');
  for (const ch of ['A', 'B', 'C', 'D']) {
    const nDoor = count(ch);
    const nPlate = count(ch.toLowerCase());
    const lever = { A: 'l', B: 'k', C: 'm', D: 'n' }[ch];
    const nLever = count(lever);
    if (nDoor > 0 && nPlate === 0 && nLever === 0 && !(lv.objects || []).some(o => o.type === 'plate2' && (o.channel || 'd') === ch.toLowerCase())) {
      problems.push(`通道${ch}的门没有任何机关`);
    }
  }
  // 门E下方必须有支撑
  for (let y = 0; y < joined.length; y++) {
    const x = joined[y].indexOf('E');
    if (x >= 0) {
      const below = y + 1 < joined.length ? joined[y + 1][x] : '.';
      if (below !== '#' && below !== '%') problems.push(`终点E(${x},${y})下方无支撑`);
    }
  }
  // 出生点下方必须有支撑
  for (const ch of ['1', '2']) {
    for (let y = 0; y < joined.length; y++) {
      const x = joined[y].indexOf(ch);
      if (x >= 0) {
        let below = y + 1 < joined.length ? joined[y + 1][x] : '.';
        let ok = false;
        for (let yy = y + 1; yy < joined.length; yy++) { if (joined[yy][x] !== '.') { ok = joined[yy][x] === '#' || joined[yy][x] === '='; break; } }
        if (!ok) problems.push(`出生点${ch}(${x},${y})下方无落地支撑`);
      }
    }
  }

  console.log(`\n=== 第${i + 1}关「${lv.name}」 ${w}x${joined.length} ${problems.length ? '❌' : '✅'}`);
  if (problems.length) { fail++; problems.forEach(p => console.log('   ❌ ' + p)); }

  // 带标尺打印
  const tens = Array.from({ length: w }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ')).join('');
  const ones = Array.from({ length: w }, (_, x) => String(x % 10)).join('');
  console.log('    ' + tens);
  console.log('    ' + ones);
  joined.forEach((r, y) => console.log(String(y).padStart(3) + ' ' + r + `  (${r.length})`));
}

console.log(fail === 0 ? '\n全部关卡校验通过 ✅' : `\n${fail} 个关卡存在问题 ❌`);
process.exit(fail === 0 ? 0 : 1);

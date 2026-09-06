// 拍档大冒险 · 局域网联机服务器
// 功能:静态页面托管 + 双人房间配对 + 消息转发(中继,不参与模拟)
// 启动:node server.js   (默认端口 8642)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 8642;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

// ---------------- 静态文件 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webm': 'video/webm',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/api/rooms') {
    const list = [];
    for (const room of rooms.values()) {
      list.push({ code: room.code, joinable: !room.guest });
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(list));
    return;
  }
  let file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------- 房间 ----------------
// room = { code, host: ws|null, guest: ws|null }
const rooms = new Map();
function newCode() {
  let code;
  do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(code));
  return code;
}
function peerOf(ws) { return ws._room ? (ws === ws._room.host ? ws._room.guest : ws._room.host) : null; }
function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function leaveRoom(ws) {
  const room = ws._room;
  if (!room) return;
  if (room.host === ws) room.host = null;
  if (room.guest === ws) room.guest = null;
  ws._room = null;
  const peer = room.host || room.guest;
  if (peer) send(peer, { t: 'bye' });       // 通知剩下的人
  if (!room.host && !room.guest) rooms.delete(room.code);
  else if (!room.guest) send(room.host, { t: 'peer', on: false });
}

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'create': {
        leaveRoom(ws);
        const room = { code: newCode(), host: ws, guest: null };
        rooms.set(room.code, room);
        ws._room = room;
        send(ws, { t: 'created', room: room.code });
        break;
      }
      case 'join': {
        const room = rooms.get(String(m.room));
        if (!room) { send(ws, { t: 'err', msg: '房间不存在' }); break; }
        if (room.guest && room.guest !== ws) { send(ws, { t: 'err', msg: '房间已满' }); break; }
        leaveRoom(ws);
        room.guest = ws;
        ws._room = room;
        send(ws, { t: 'joined', room: room.code });
        send(room.host, { t: 'peer', on: true });
        break;
      }
      default:
        // 游戏消息原样转发给对方(Buffer → 文本,浏览器端好解析)
        const peer = peerOf(ws);
        if (peer) peer.send(raw.toString('utf8'));
    }
  });
  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// 心跳清理
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  const nets = Object.values(os.networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log('拍档大冒险服务器已启动:');
  console.log(`  本机:   http://localhost:${PORT}`);
  nets.forEach(ip => console.log(`  局域网: http://${ip}:${PORT}   ← 手机用这个`));
});

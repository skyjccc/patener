// 联机客户端:连接本页同源的 WebSocket 服务器,房间配对 + 消息收发
export const net = {
  ws: null,
  role: null,      // 'host' | 'guest' | null
  myPid: 0,        // host→0(阿橙) guest→1(阿蓝)
  code: '',
  peer: false,     // 对方已加入
  onStatus: null,  // (msg) => void
  onPeer: null,    // (on: bool) => void
  onBye: null,     // () => void
  onMsg: null,     // (msg) => void  游戏消息(输入/同步/动作)

  get connected() { return this.ws && this.ws.readyState === 1; },

  ensure() {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
      const ws = new WebSocket(url);
      ws.onopen = () => { this.ws = ws; resolve(); };
      ws.onerror = () => reject(new Error('无法连接服务器'));
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null; this.peer = false;
          this.onBye?.();
        }
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        switch (m.t) {
          case 'created': this.role = 'host'; this.myPid = 0; this.code = m.room; this.peer = false; this.onStatus?.(`房间码 ${m.room} · 等待伙伴加入…`); break;
          case 'joined': this.role = 'guest'; this.myPid = 1; this.code = m.room; this.peer = true; this.onPeer?.(true); this.onStatus?.(`已加入房间 ${m.room} · 等待房主…`); break;
          case 'peer':
            this.peer = m.on;
            this.onPeer?.(m.on);
            break;
          case 'bye':
            this.peer = false;
            this.onBye?.();
            break;
          case 'err': this.onStatus?.(m.msg || '出错'); break;
          default: this.onMsg?.(m);
        }
      };
    });
  },

  create() { return this.ensure().then(() => { this.role = 'host'; this.myPid = 0; this.ws.send(JSON.stringify({ t: 'create' })); }); },
  join(code) { return this.ensure().then(() => { this.role = 'guest'; this.myPid = 1; this.ws.send(JSON.stringify({ t: 'join', room: String(code) })); }); },
  leave() {
    if (this.ws) { try { this.ws.close(); } catch { } }
    this.ws = null; this.role = null; this.peer = false; this.code = '';
  },

  send(obj) { if (this.connected && this.peer) this.ws.send(JSON.stringify(obj)); },

  // 拉取可加入房间列表
  async listRooms() {
    try {
      const r = await fetch('/api/rooms');
      return await r.json();
    } catch { return []; }
  },
};

// ★★ R124 — 바깥 주소 소켓 왕복(로그인 없이 time.ping → time.pong · 로그인 안 된 소켓은 10초 뒤 끊김): node scripts/r124-rtt.mjs <URL> [N=25] [간격ms=300]
import { io } from 'socket.io-client';
const url = process.argv[2]; const N = Number(process.argv[3] ?? 25); const gap = Number(process.argv[4] ?? 300);
const s = io(url, { transports: ['websocket'], reconnection: false });
await new Promise((r) => s.on('server.hello', r));
const sent = new Map(); const got = [];
s.on('time.pong', (p) => { const a = sent.get(p.t0); if (a !== undefined) got.push({ i: p.t0, ms: Math.round(performance.now() - a) }); });
s.on('disconnect', (r) => console.log('disconnect', r));
for (let i = 0; i < N; i++) { sent.set(i, performance.now()); s.emit('time.ping', { t0: i }); await new Promise((r) => setTimeout(r, gap)); }
await new Promise((r) => setTimeout(r, 6000));
console.log(JSON.stringify(got));
const v = got.map((g) => g.ms).sort((a, b) => a - b);
console.log(JSON.stringify({ sent: N, got: got.length, median: v[v.length >> 1], max: v.at(-1), min: v[0] }));
process.exit(0);

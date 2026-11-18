// 찬종 결정 받기 — 작은 로컬 서버(설계 창 것 · 의존 0)
//   node web-desk/decide/serve.mjs   (또는 저장소 맨 위 decide.bat 두 번 누르기)
//   · 질문 = web-desk/decide/질문.json (설계 창이 그때그때 새로 쓴다)
//   · 답   = web-desk/decide/받은것/결정-<질문.json 의 id>.json (저장 단추를 누르면 여기 쓰고 서버는 꺼진다)
//   · 다시 열면 앞서 저장한 답이 채워져 있다(고쳐서 다시 저장하면 덮어쓴다)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3410; // 3158~3257 은 Windows 가 잡아 둘 때가 있어 피한다
const readQ = () => JSON.parse(fs.readFileSync(path.join(DIR, '질문.json'), 'utf8'));
const outPath = () => path.join(DIR, '받은것', `결정-${readQ().id}.json`);
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(body); };

const server = http.createServer((req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) return send(res, 200, 'text/html', fs.readFileSync(path.join(DIR, 'index.html')));
    if (req.method === 'GET' && req.url === '/questions') return send(res, 200, 'application/json', JSON.stringify(readQ()));
    if (req.method === 'GET' && req.url === '/saved') return send(res, 200, 'application/json', fs.existsSync(outPath()) ? fs.readFileSync(outPath()) : 'null');
    if (req.method === 'POST' && req.url === '/save') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          fs.mkdirSync(path.dirname(outPath()), { recursive: true });
          fs.writeFileSync(outPath(), JSON.stringify(data, null, 2) + '\n', 'utf8');
          const rel = path.relative(path.join(DIR, '..', '..'), outPath()).replace(/\\/g, '/');
          send(res, 200, 'application/json', JSON.stringify({ ok: true, path: rel }));
          console.log(`저장됨: ${rel}`);
          setTimeout(() => process.exit(0), 1500);
        } catch (e) { send(res, 400, 'application/json', JSON.stringify({ ok: false, error: String(e.message) })); }
      });
      return;
    }
    send(res, 404, 'text/plain', 'not found');
  } catch (e) { send(res, 500, 'text/plain', String(e.message)); }
});

server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `이미 열려 있습니다 → http://localhost:${PORT}` : e.message); if (e.code === 'EADDRINUSE') exec(`start "" http://localhost:${PORT}`); process.exitCode = 1; });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`결정 화면: http://localhost:${PORT}  (저장하면 이 창은 저절로 닫힙니다)`);
  if (!process.argv.includes('--no-open')) exec(`start "" http://localhost:${PORT}`);
});

// 해설 3단계 출처 원문 대조(설계) — node web-desk/vscript/_build/qcheck.mjs <받은것/해설/키-3.json>
// 사실마다 출처(배열이든 평평한 칸이든)의 주소를 열어 quote 가 글자 그대로 있는지. PDF 는 pdftotext 로 글자를 뽑아 본다.
// 결과 = 같은 폴더 <키>-3-대조.json · 화면에 사실 번호 · 상태 · OK/MISS
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const f = process.argv[2];
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const arr = Object.values(j).find(Array.isArray);
const norm = (s) => s.normalize('NFKC').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&#8217;|&rsquo;|&#39;|&apos;|[’‘]/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;|[“”]/g, '"')
  .replace(/&amp;/g, '&').replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').toLowerCase();
const cache = new Map();
async function page(url) {
  const u = url.split('#')[0];
  if (cache.has(u)) return cache.get(u);
  let res = { status: 'ERR', text: '' };
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'accept-language': 'en,ko,fr' }, signal: AbortSignal.timeout(25000) });
    const buf = Buffer.from(await r.arrayBuffer());
    let text;
    if (buf.subarray(0, 5).toString() === '%PDF-') {
      const p = path.join(os.tmpdir(), 'qcheck-' + cache.size + '.pdf');
      fs.writeFileSync(p, buf);
      try { execFileSync('pdftotext', ['-enc', 'UTF-8', p, p + '.txt'], { stdio: 'ignore' }); text = fs.readFileSync(p + '.txt', 'utf8'); } catch { text = ''; }
    } else text = buf.toString('utf8');
    res = { status: r.status, text: norm(text) };
  } catch (e) { res = { status: 'ERR ' + e.name, text: '' }; }
  cache.set(u, res);
  return res;
}
const out = [];
for (const [i, c] of arr.entries()) {
  let srcs = c['출처'] ?? c.sources ?? [c];
  if (!Array.isArray(srcs)) srcs = [srcs];
  for (const s of srcs) {
    const url = s['주소'] || s.url; const qs = (Array.isArray(s.quote) ? s.quote : [s.quote || '']).map(String); const q = qs.join(' / ');
    if (!url) continue;
    const pg = await page(url);
    const flat = pg.text.replace(/ /g, '');
    const ok = qs.every((x) => { const nq = norm(x); return !!nq && (pg.text.includes(nq) || flat.includes(nq.replace(/ /g, ''))); });
    out.push({ i, fact: c['사실'], url, status: pg.status, ok, quote: q });
    console.log(i, pg.status, ok ? 'OK' : 'MISS', url.slice(0, 80));
  }
}
fs.writeFileSync(f.replace(/\.json$/, '-대조.json'), JSON.stringify({ checked: new Date().toISOString(), rows: out }, null, 1));
const bad = [...new Set(out.filter((r) => !r.ok).map((r) => r.i))].filter((i) => !out.some((r) => r.i === i && r.ok));
console.log('사실', arr.length, '· 출처 하나도 안 맞은 사실', bad.length ? bad.join(',') : '없음');

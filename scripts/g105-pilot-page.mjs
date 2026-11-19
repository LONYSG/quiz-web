#!/usr/bin/env node
// =============================================================================
// G105 C — 상품 그림 시범 30 쪽지: data/pipeline/audit/g105-image-pilot.json + g105-raw/pilot-A.json · pilot-B.json
//   → 판정을 시범 목록에 합침(같은 파일 items[].found) · ai-out/G105-그림.html(고치기 전 / 찾은 사진 나란히 · 판정 · 라이선스 · 출처 링크)
//   사용 node scripts/g105-pilot-page.mjs
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './g023-common.mjs';

const P = (...x) => path.join(ROOT, ...x);
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const pilot = J(P('data/pipeline/audit/g105-image-pilot.json'));
const raw = ['A', 'B'].flatMap((k) => (existsSync(P(`data/pipeline/audit/g105-raw/pilot-${k}.json`)) ? J(P(`data/pipeline/audit/g105-raw/pilot-${k}.json`)).items : []));
const R = new Map(raw.map((x) => [x.image_id, x]));
for (const it of pilot.items) {
  const r = R.get(it.image_id);
  it.found = r ? { verdict: r.verdict, file: r.file ?? null, commonsPage: r.commonsPage ?? null, license: r.license ?? null, artist: r.artist ?? null, modified: r.modified ?? null, helps: r.helps ?? null, note: r.note ?? '' } : null;
}
const cnt = (v) => pilot.items.filter((x) => x.found?.verdict === v).length;
pilot.summary = { same: cnt('same'), similar: cnt('similar'), none: cnt('none'), missing: pilot.items.filter((x) => !x.found).length };
writeFileSync(P('data/pipeline/audit/g105-image-pilot.json'), JSON.stringify(pilot, null, 1) + '\n');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const rel = (f) => (f ? '../' + f.replace(/\\/g, '/') : null);
const V = { same: ['같은 상품', 'ok'], similar: ['같은 종류', 'mid'], none: ['못 찾음', 'no'] };
const rows = pilot.items.map((it, i) => {
  const f = it.found ?? { verdict: 'none', note: '결과 없음' };
  const [label, cls] = V[f.verdict] ?? ['?', 'no'];
  return `<article class="card">
  <h2><span class="n">${i + 1}</span> ${esc(it.name)} <small>${esc(it.kind)} · ${esc(it.item_id)}</small></h2>
  <div class="pair">
    <figure><img src="${esc(rel(it.before.file))}" alt="지금 그림" loading="lazy"><figcaption>지금 (${esc(it.before.attribution)})</figcaption></figure>
    <figure>${f.file ? `<img src="${esc(rel(f.file))}" alt="찾은 사진" loading="lazy">` : '<div class="empty">없음</div>'}<figcaption><b class="v ${cls}">${label}</b>${f.license ? ` · ${esc(f.license)}` : ''}${f.artist ? ` · ${esc(f.artist)}` : ''}${f.modified ? ` · ${esc(f.modified)}` : ''}</figcaption></figure>
  </div>
  ${f.helps ? `<p class="helps">알아보기: ${esc(f.helps)}</p>` : ''}
  <p class="note">${esc(f.note)}${f.commonsPage ? ` · <a href="${esc(f.commonsPage)}" target="_blank" rel="noopener">출처 파일 페이지</a>` : ''}</p>
</article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>상품 그림 시범</title>
<style>
:root{--bg:#f7f6f2;--fg:#1d1d1b;--muted:#6b6a65;--card:#fff;--line:#e3e1da;--ok:#1f7a4d;--mid:#a66a00;--no:#a23b3b}
@media (prefers-color-scheme:dark){:root{--bg:#18181a;--fg:#ecebe6;--muted:#a3a29c;--card:#222225;--line:#36363a;--ok:#5fc48f;--mid:#e0a84a;--no:#e07a7a}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Malgun Gothic",sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}.sum{color:var(--muted);margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.card h2{font-size:15px;margin:0 0 8px}.card h2 small{color:var(--muted);font-weight:400}
.n{display:inline-block;min-width:22px;color:var(--muted)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
figure{margin:0}img,.empty{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
.empty{display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--bg)}
figcaption{font-size:12px;color:var(--muted);margin-top:4px;word-break:break-word}
.v{font-weight:700}.v.ok{color:var(--ok)}.v.mid{color:var(--mid)}.v.no{color:var(--no)}
.helps,.note{font-size:13px;margin:6px 0 0}.note{color:var(--muted)}a{color:inherit}
</style></head><body><main>
<h1>'얼마게요' 상품 그림 바꾸기 — 시범 30</h1>
<p class="sum">G105 · 2026-11-19 · 왼쪽 = 지금 그림(제조사 · 판매처 상품 페이지) · 오른쪽 = 위키미디어 공용에서 찾은 자유 라이선스 사진 · 같은 상품 ${pilot.summary.same} · 같은 종류 ${pilot.summary.similar} · 못 찾음 ${pilot.summary.none}. DB 그림은 아직 바꾸지 않았습니다.</p>
<div class="grid">
${rows}
</div></main></body></html>
`;
writeFileSync(P('ai-out/G105-그림.html'), html);
console.log('[G105 C]', JSON.stringify(pilot.summary));

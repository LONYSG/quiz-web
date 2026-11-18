#!/usr/bin/env node
// =============================================================================
// G101 2 — 정답 표기 후보 목록(기계 · DB 쓰기 0 · 찬종 2026-11-18 "사전이 먼저 · 위키는 그다음")
//   가. quizweb 활성 정답(같은 정답은 한 번) → 표준국어대사전(scripts/dict-check.mjs) : dict-ok / dict-no / skip(한글 없음)
//   나. dict-no → 한국어 위키백과(action=query · redirects · 50개씩 · 0.5초) : same / redirect ⓐ ⓑ ⓒ / none
//   다. ⓑ 의 위키 표제어 → 사전 : 있으면 fix · 없으면 look
//   라. dict-ok → 위키 : ⓑ 면 variant(위키 표기를 맞는 답으로 더 받을 후보)
//   캐시 data/pipeline/audit/g101-raw/wiki/cache.jsonl · 사전 캐시는 dict-check 와 같다
//   출력 data/pipeline/audit/g101-spelling.json · ai-out/G101-표기후보.md
//   사용 node scripts/g101-build.mjs
// =============================================================================
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './g023-common.mjs';
import { dictOne, stats as dstats, squash as dsq } from './dict-check.mjs';

const WDIR = path.join(ROOT, 'data/pipeline/audit/g101-raw/wiki');
const WCACHE = path.join(WDIR, 'cache.jsonl');
const OUT = path.join(ROOT, 'data/pipeline/audit/g101-spelling.json');
const MD = path.join(ROOT, 'ai-out/G101-표기후보.md');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();

// ---------- 글자 견주기 ----------
const strip = (s) => String(s ?? '').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s·・‧\-^.,:'"!?~&]/g, '').toLowerCase();
function lev(a, b) {
  const A = [...a], B = [...b]; const d = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
  for (let j = 1; j <= B.length; j++) d[0][j] = j;
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  return d[A.length][B.length];
}
/** 우리 답 → 위키 표제어 차이: a(띄어쓰기 · 가운뎃점 · 괄호만) · b(한두 글자) · c(아주 다름) */
function diffKind(ours, theirs) {
  const x = strip(ours), y = strip(theirs);
  if (x === y) return 'a';
  const L = Math.max([...x].length, [...y].length);
  const dist = lev(x, y);
  return dist <= Math.max(1, Math.floor(L / 2)) && dist <= 2 ? 'b' : 'c';
}

// ---------- 위키 ----------
const WMEM = new Map();
if (existsSync(WCACHE)) for (const l of readFileSync(WCACHE, 'utf8').split('\n')) { if (!l.trim()) continue; try { const o = JSON.parse(l); WMEM.set(o.title, o); } catch {} }
let wcalls = 0;
const UA = 'quiz-web-spelling-check/1.0 (offline batch; contact via repository)';
async function wikiGet(params) {
  const u = 'https://ko.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let t = 0; t < 8; t++) {
    let wait = 5000 * (t + 1);
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }); wcalls++;
      if (r.status === 429) { wait = Math.max(wait, 1000 * Number(r.headers.get('retry-after') || 30)); throw new Error('HTTP 429'); }
      if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json();
    } catch (e) { if (t === 7) throw e; console.log(`  위키 ${e.message} — ${Math.round(wait / 1000)}초 쉼`); await sleep(wait); }
  }
}
/** titles → Map(title → {title, kind: same|redirect|none, to, cats[], disambig}) */
async function wikiCheck(titles) {
  const need = [...new Set(titles)].filter((t) => !WMEM.has(t));
  mkdirSync(WDIR, { recursive: true });
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const pages = new Map(); let norm = new Map(), redir = new Map();
    let cont = {};
    do {
      const j = await wikiGet({ action: 'query', redirects: '1', titles: batch.join('|'), prop: 'categories|pageprops', cllimit: 'max', clshow: '!hidden', ppprop: 'disambiguation', ...cont });
      for (const n of j.query?.normalized ?? []) norm.set(n.from, n.to);
      for (const r of j.query?.redirects ?? []) redir.set(r.from, r.to);
      for (const p of j.query?.pages ?? []) {
        const o = pages.get(p.title) ?? { missing: !!p.missing || !!p.invalid, cats: [], disambig: false };
        for (const c of p.categories ?? []) o.cats.push(c.title.replace(/^분류:/, ''));
        if (p.pageprops && 'disambiguation' in p.pageprops) o.disambig = true;
        pages.set(p.title, o);
      }
      cont = j.continue ?? null;
      await sleep(1500);
    } while (cont);
    for (const t of batch) {
      const n = norm.get(t) ?? t; const r = redir.get(n); const fin = r ?? n; const p = pages.get(fin);
      const o = !p || p.missing ? { title: t, kind: 'none', to: null, cats: [], disambig: false }
        : { title: t, kind: r ? 'redirect' : 'same', to: r ?? null, cats: [...new Set(p.cats)].slice(0, 30), disambig: p.disambig };
      WMEM.set(t, o); appendFileSync(WCACHE, JSON.stringify(o) + '\n');
    }
    if ((i / 50) % 20 === 0) console.log(`  위키 ${Math.min(i + 50, need.length)}/${need.length}`);
  }
  return WMEM;
}
const PROPER = /출생|사망|인물|배우|가수|선수|정치인|작가|화가|음악가|작곡가|감독|그룹|밴드|아이돌|영화|드라마|프로그램|노래|음반|싱글|앨범|소설|만화|애니메이션|게임|작품|캐릭터|등장인물|시리즈|기업|회사|브랜드|상표|제품|자동차|도시|시$|군$|구$|섬|산$|강$|호수|국가|나라|지역|역$|철도역|지명|행정 구역|건축물|궁궐|사찰|대학교|학교|팀|구단|클럽|대회|축제|왕|황제|왕조|신화|신$|종교|언어$/;
const subOf = (w) => (w.disambig ? 'disambig' : w.cats.some((c) => PROPER.test(c)) ? 'proper' : 'common');

// ---------- 정답 ----------
process.loadEnvFile?.(path.join(ROOT, '.env'));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query(`select q.id::int, q.display_answer a, coalesce(p.name_ko,'') || case when k.name_ko is not null then ' > ' || k.name_ko else '' end cat
  from questions q left join categories k on k.id=q.category_id left join categories p on p.id=k.parent_id where q.is_active order by q.id`)).rows;
await c.end();
const byA = new Map();
for (const r of rows) { if (!byA.has(r.a)) byA.set(r.a, { answer: r.a, ids: [], cat: r.cat }); byA.get(r.a).ids.push(r.id); }
const items = [...byA.values()];
console.log(`[G101] 활성 문항 ${rows.length} · 정답 ${items.length}`);

// 가. 사전
let k = 0;
for (const it of items) {
  if (!/[가-힣]/.test(it.answer)) { it.verdict = 'skip'; it.dict = null; continue; }
  const d = await dictOne(it.answer);
  it.dict = { found: d.found, headword: d.headword, origin: d.origin };
  if (++k % 500 === 0) console.log(`  사전 ${k} · 호출 ${dstats.calls}`);
}
const ok = items.filter((x) => x.dict?.found), no = items.filter((x) => x.dict && !x.dict.found);
console.log(`[G101] 사전 dict-ok ${ok.length} · dict-no ${no.length} · skip ${items.length - ok.length - no.length} · 호출 ${dstats.calls}`);

// 나 · 라. 위키(dict-no 전부 + dict-ok 전부)
await wikiCheck([...no, ...ok].map((x) => x.answer));
for (const it of [...no, ...ok]) {
  const w = WMEM.get(it.answer);
  it.wiki = { kind: w.kind, to: w.to, sub: w.kind === 'same' ? subOf(w) : w.kind === 'redirect' ? diffKind(it.answer, w.to) : null };
}
// 다. ⓑ 의 위키 표제어 → 사전
for (const it of no) {
  const w = it.wiki;
  if (w.kind === 'same') { it.verdict = 'same'; it.sub = w.sub; }
  else if (w.kind === 'none') it.verdict = 'none';
  else if (w.sub !== 'b') { it.verdict = `redirect-${w.sub}`; it.to = w.to; }
  else {
    const toWord = w.to.replace(/\s*\([^)]*\)\s*$/, '');
    const d = await dictOne(toWord);
    it.to = toWord; it.toDict = { found: d.found, headword: d.headword, origin: d.origin, def: d.def };
    it.verdict = d.found ? 'fix' : 'look';
  }
}
for (const it of ok) {
  if (it.wiki.kind === 'redirect' && it.wiki.sub === 'b') { it.verdict = 'variant'; it.to = it.wiki.to.replace(/\s*\([^)]*\)\s*$/, ''); }
  else it.verdict = 'dict-ok';
}

// ⓑ 를 둘로: swap(글자가 바뀜 — 표기 후보) · trim(한쪽이 다른 쪽을 품음 — 앞뒤 낱말이 붙거나 빠짐 · 대개 줄임/넓힘)
for (const it of items) if (it.to) { const x = strip(it.answer), y = strip(it.to); it.how = x.includes(y) || y.includes(x) ? 'trim' : 'swap'; }

// ---------- 쓰기 ----------
const cnt = (f) => items.filter(f).length;
const V = (v) => cnt((x) => x.verdict === v);
const summary = {
  activeQuestions: rows.length, answers: items.length,
  dictOk: ok.length, dictNo: no.length, skip: V('skip'),
  dictNoWiki: { same: V('same'), sameCommon: cnt((x) => x.verdict === 'same' && x.sub === 'common'), sameProper: cnt((x) => x.verdict === 'same' && x.sub === 'proper'), sameDisambig: cnt((x) => x.verdict === 'same' && x.sub === 'disambig'), redirectA: V('redirect-a'), redirectB: V('fix') + V('look'), redirectC: V('redirect-c'), none: V('none') },
  fix: V('fix'), look: V('look'), variant: V('variant'),
  swap: { fix: cnt((x) => x.verdict === 'fix' && x.how === 'swap'), look: cnt((x) => x.verdict === 'look' && x.how === 'swap'), variant: cnt((x) => x.verdict === 'variant' && x.how === 'swap') },
  dictCalls: dstats.calls, wikiCalls: wcalls, minutes: Math.round((Date.now() - t0) / 60000),
};
const clean = items.map(({ answer, ids, cat, dict, wiki, to, toDict, sub, how, verdict }) => ({ answer, ids, cat, dict, wiki, to, toDict, sub, how, verdict }));
writeFileSync(OUT, JSON.stringify({ done: true, round: 'G101', builtAt: new Date().toISOString(), db: 'quizweb', rule: '표준국어대사전 표제어 먼저 · 위키백과는 후보 찾기에만', summary, items: clean }, null, 1) + '\n');

const ids = (x) => x.ids.map((i) => '#' + i).join(' ');
const L = [];
L.push('# G101 — 정답 표기 후보 (2026-11-18 · quizweb 활성 · 기계로만 뽑음 · 고친 것 없음)', '');
L.push('기준: 표준국어대사전 표제어가 먼저 · 한국어 위키백과는 후보를 찾는 데만.', '');
L.push(`정답 ${summary.answers}(문항 ${summary.activeQuestions}) · 사전에 있음 ${summary.dictOk} · 없음 ${summary.dictNo} · 물을 수 없음(한글 없음) ${summary.skip}`, '');
L.push(`## 1. fix — 고칠 후보 ${summary.fix} (우리 표기는 사전에 없고, 한두 글자 다른 위키 표기가 사전에 있다)`, '');
L.push('| 지금 정답 | 사전 표제어 | 원어 | 문항 | 분류 | 사전 뜻 |', '|---|---|---|---|---|---|');
for (const h of ['swap', 'trim']) { L.push(`| **${h === 'swap' ? '가. 글자가 바뀐 것(표기 후보)' : '나. 앞뒤 낱말이 붙거나 빠진 것(대개 줄임 · 넓힘 — 고칠 것 아님이 많다)'}** ${items.filter((x) => x.verdict === 'fix' && x.how === h).length} | | | | | |`); for (const x of items.filter((x) => x.verdict === 'fix' && x.how === h)) L.push(`| ${x.answer} | ${x.toDict.headword} | ${x.toDict.origin ?? ''} | ${ids(x)} | ${x.cat} | ${(x.toDict.def ?? '').slice(0, 50)} |`); }
L.push('', `## 2. look — 사람이 볼 것 ${summary.look} (우리 표기 · 위키 표기 둘 다 사전에 없다 · 한두 글자 차이)`, '');
L.push('| 지금 정답 | 위키 표제어 | 문항 | 분류 |', '|---|---|---|---|');
for (const h of ['swap', 'trim']) { L.push(`| **${h === 'swap' ? '가. 글자가 바뀐 것' : '나. 앞뒤 낱말이 붙거나 빠진 것'}** ${items.filter((x) => x.verdict === 'look' && x.how === h).length} | | | |`); for (const x of items.filter((x) => x.verdict === 'look' && x.how === h)) L.push(`| ${x.answer} | ${x.to} | ${ids(x)} | ${x.cat} |`); }
L.push('', `## 3. variant — 맞는 답으로 더 받을 후보 ${summary.variant} (우리 표기는 사전에 있다 · 위키가 한두 글자 다른 표제어로 넘긴다 · 5222 펄서 꼴)`, '');
L.push('| 지금 정답(사전 표제어) | 위키 표제어 | 문항 | 분류 |', '|---|---|---|---|');
for (const h of ['swap', 'trim']) { L.push(`| **${h === 'swap' ? '가. 글자가 바뀐 것(맞는 답 후보)' : '나. 앞뒤 낱말이 붙거나 빠진 것'}** ${items.filter((x) => x.verdict === 'variant' && x.how === h).length} | | | |`); for (const x of items.filter((x) => x.verdict === 'variant' && x.how === h)) L.push(`| ${x.answer} | ${x.to} | ${ids(x)} | ${x.cat} |`); }
const sample = (title, f, show) => { const a = items.filter(f); L.push('', `### ${title} — ${a.length}`, ''); for (const x of a.slice(0, 20)) L.push(`- ${show(x)}`); };
L.push('', '## 4. 그 밖 (수와 본보기 20개씩)');
sample('사전 없음 · 위키 넘겨주기 ⓐ(띄어쓰기 · 가운뎃점 · 괄호만 다름)', (x) => x.verdict === 'redirect-a', (x) => `${x.answer} → ${x.to} (${ids(x)})`);
sample('사전 없음 · 위키 넘겨주기 ⓒ(아주 다른 이름)', (x) => x.verdict === 'redirect-c', (x) => `${x.answer} → ${x.to} (${ids(x)})`);
sample('사전 없음 · 위키 문서 그대로(고유 이름 · 작품 · 전문용어)', (x) => x.verdict === 'same' && x.sub !== 'common', (x) => `${x.answer} (${x.sub} · ${x.cat})`);
sample('사전 없음 · 위키도 없음', (x) => x.verdict === 'none', (x) => `${x.answer} (${ids(x)} · ${x.cat})`);
sample('물을 수 없음(한글 없음)', (x) => x.verdict === 'skip', (x) => x.answer);
L.push('', `## 5. 이 방법이 놓치는 것`, '');
L.push('우리 표기가 사전에 없고 위키도 우리와 같은 표기를 쓰는데, 사전에는 다른 표기로 실려 있는 낱말은 기계로 못 찾는다. 그 후보 자리 = 사전에 없고 위키 문서가 그대로 있는 것 가운데 위키 분류가 인물 · 작품 · 지명 · 상표 같은 고유 이름이 아닌 것(분류 이름 낱말로 어림):', '');
const common = items.filter((x) => x.verdict === 'same' && x.sub === 'common');
L.push(`**${common.length}개** (고유 이름으로 본 것 ${summary.dictNoWiki.sameProper} · 동음이의 문서 ${summary.dictNoWiki.sameDisambig}). 본보기 30개:`, '');
for (const x of common.slice(0, 30)) L.push(`- ${x.answer} (${ids(x)} · ${x.cat})`);
L.push('', `사전 호출 ${summary.dictCalls}(캐시 빼고) · 위키 호출 ${summary.wikiCalls} · 근거 data/pipeline/audit/g101-spelling.json`);
writeFileSync(MD, L.join('\n') + '\n');
console.log(`[G101] ${JSON.stringify(summary)}`);

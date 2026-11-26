// web-desk/newq 검사 — 받은것/결과-NN.json → web-desk/tone/보낼것/새재료-(59+NN).json (설계 창이 "web-desk 확인" 때 돌린다)
//   node web-desk/newq/_check.mjs 01 [02 …] [--dry] [--no-fetch]
//   G111 check.mjs 와 같은 검사(겹침 · 이름 · 출처 · 등급 · hintRisk · 표기) + ★ quote 원문 대조(주소를 열어 글자 그대로 있는지)
//   core quote 가 안 맞으면 뺀다 · story 줄은 안 맞는 줄만 빼고 2줄 아래면 뺀다 · hintIdea 안 맞으면 null
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// 이 PC 는 회사 VPN 이 켜지면 TLS 를 가로챈다(SELF_SIGNED_CERT_IN_CHAIN) — Windows 인증서 저장소를 쓰도록 다시 띄운다
if (!process.execArgv.includes('--use-system-ca')) {
  process.exit(spawnSync(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], { stdio: 'inherit' }).status ?? 1);
}
import { normalizeAnswer } from '../../shared/dist/normalize.js';
import { dictCheck } from '../../scripts/dict-check.mjs';
process.chdir('C:/work/quiz-web');
const H = 'web-desk/newq/';
const OUT = 'web-desk/tone/보낼것/';
const CACHE = H + '_cache/'; mkdirSync(CACHE, { recursive: true });
const DRY = process.argv.includes('--dry'), NOFETCH = process.argv.includes('--no-fetch');
const args = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const n = (s) => normalizeAnswer(String(s ?? ''));
const taken = new Map();
for (const l of readFileSync(H + '_taken.tsv', 'utf8').split('\n')) {
  if (!l) continue; const [s, , f] = l.split('\t');
  for (const x of (f || '').split('|')) if (x && !taken.has(n(x))) taken.set(n(x), s);
}
const mineOut = new Set(args.map((x) => `새재료-${59 + +x}.json`));
for (const f of readdirSync(OUT).filter((f) => /^새재료-\d+\.json$/.test(f) && mineOut.has(f) === false && +f.match(/\d+/)[0] >= 60)) {
  const j = JSON.parse(readFileSync(OUT + f, 'utf8'));
  for (const it of j.items) for (const s of [it.answer, ...(it.also || [])]) if (!taken.has(n(s))) taken.set(n(s), `${j.chunk}/${it.key}`);
}
const MAJ = new Set(['기술·의학', '문화·예술', '생활·상식', '스포츠·게임', '인문·사회', '자연과학', '한국']);
const MID = new Set(readFileSync('data/pipeline/audit/g107-raw/categories.txt', 'utf8').split('\n').filter(Boolean).map((l) => l.replace(/ \(\d+\)$/, '')));
const bad = /namu\.wiki|blog\.|tistory|brunch|dcinside|fandom\.com|fandom\.wiki|velog|cafe\.naver|kin\.naver/i;
const risky = (a) => /\s/.test(a.trim()) || /(효과|현상|법칙|의 ?날|증후군|역설|원리|이론|주의|딜레마|오류|편향|실험)$/.test(a.trim());

// ── 원문 받기(위키백과는 raw · 나머지는 html 을 글자로) · 캐시
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = new Map();
async function getText(url) {
  if (page.has(url)) return page.get(url);
  const key = CACHE + Buffer.from(url).toString('base64url').slice(0, 150) + '.txt';
  if (existsSync(key)) { const t = readFileSync(key, 'utf8'); page.set(url, t); return t; }
  let u = url, t = null;
  // 언어 없는 위키 주소(www.wikipedia.org · wikipedia.com — web 이 가끔 이렇게 적는다)는 영어판으로 본다
  const url2 = url.replace(/^https?:\/\/(?:(www|[a-z-]{2,12})\.)?(?:m\.)?wikipedia\.(?:org|com)\/wiki\//i, (m, l) => `https://${!l || /^www$/i.test(l) ? 'en' : l.toLowerCase()}.wikipedia.org/wiki/`);
  const w = url2.match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^#?]+)/);
  if (w) u = `https://${w[1]}.wikipedia.org/w/index.php?title=${w[2]}&action=raw`;
  for (let i = 0; i < 3 && t === null; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'quiz-research/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(30000); continue; }
      if (!r.ok) { t = ''; break; }
      t = await r.text();
    } catch { await sleep(2000); }
  }
  t ??= '';
  if (!w) t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'");
  else t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, ' ').replace(/\{\{[^{}]*\}\}/g, ' ');
  if (t) writeFileSync(key, t);
  page.set(url, t); await sleep(400);
  return t;
}
const sq = (s) => String(s ?? '').normalize('NFC').replace(/[\s"'“”‘’「」『』《》〈〉()\[\]·.,:;!?…—–\-]/g, '').toLowerCase();
async function quoteOk(o) {
  if (!o?.url || !o?.quote || bad.test(o.url)) return false;
  if (NOFETCH) return true;
  const t = await getText(o.url); if (!t) return null; // 못 엶(사이트가 막음) — 사람이 본다
  const q = sq(o.quote), T = sq(t);
  if (T.includes(q)) return true;
  // 긴 인용은 앞 · 뒤 반씩이라도
  if (q.length > 40 && (T.includes(q.slice(0, Math.floor(q.length / 2))) && T.includes(q.slice(Math.floor(q.length / 2))))) return true;
  return false;
}

for (const nn of args) {
  const p = `${H}받은것/결과-${nn}.json`;
  if (!existsSync(p) || !readFileSync(p, 'utf8').trim()) { console.log(nn, '비었음'); continue; }
  let raw = readFileSync(p, 'utf8').replace(/^﻿/, '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  let j; try { j = JSON.parse(raw); } catch (e) { console.log(nn, 'JSON 깨짐', e.message); continue; }
  const keep = [], cut = []; let qStat = { ok: 0, bad: 0, closed: 0 };
  const inChunk = new Map();
  for (const it of j.items || []) {
    const why = [];
    const forms = [it.answer, ...(it.also || [])].filter(Boolean);
    for (const s of forms) { const o = taken.get(n(s)); if (o) why.push(`겹침 ${o}(${s})`); const c = inChunk.get(n(s)); if (c) why.push(`조각 안 겹침 ${c}`); }
    if (!MAJ.has(it.major)) why.push('대분류 이름 ' + it.major);
    else if (it.mid && !MID.has(`${it.major} > ${it.mid}`)) why.push('중분류 이름 ' + it.mid);
    const g = +it.gradeGuess;
    if (j.grade && g !== +j.grade) why.push(`등급 ${j.grade} 조각인데 ${g}`);
    if (!why.length) {
      const c = await quoteOk(it.core); qStat[c === true ? 'ok' : c === null ? 'closed' : 'bad']++;
      if (c === false) why.push('core quote 원문에 없음');
      if (c === null) it.coreUnverified = true;
      const st = [];
      for (const s of it.story || []) { const r = await quoteOk(s); qStat[r === true ? 'ok' : r === null ? 'closed' : 'bad']++; if (r !== false) st.push(r === null ? { ...s, unverified: true } : s); }
      it.storyDropped = (it.story || []).length - st.length; it.story = st;
      if (st.length < 2) why.push(`story ${st.length}줄(대조 통과)`);
      if (it.hintIdea) { const r = await quoteOk(it.hintIdea); if (r === false) it.hintIdea = null; }
    }
    if (why.length) { cut.push({ key: it.key, answer: it.answer, why }); continue; }
    if (risky(it.answer)) it.hintRisk = true; else if (it.hintRisk !== true) delete it.hintRisk;
    keep.push(it); for (const s of forms) { inChunk.set(n(s), it.key); taken.set(n(s), `web${nn}/${it.key}`); }
  }
  let r = [];
  try { r = keep.length ? await dictCheck(keep.map((it) => it.answer)) : []; } catch (e) { console.log('   (사전 조회 실패 — 표기는 wiki/none 으로만:', e.cause?.code || e.message, ')'); }
  const hit = new Map(r.map((x) => [x.word, x]));
  for (const it of keep) { const x = hit.get(it.answer); it.spelling = x?.found ? 'dict' : (/wikipedia\.org/.test(it.core.url) ? 'wiki' : 'none'); }
  const no = 59 + +nn;
  const out = { done: true, chunk: `새재료-${no}`, lane: j.lane, grade: j.grade, made: `web newq 조각 ${nn} · ${new Date().toISOString().slice(0, 10)}`, items: keep };
  if (!DRY) {
    writeFileSync(`${OUT}새재료-${no}.json`, JSON.stringify(out, null, 1) + '\n');
    writeFileSync(`${H}받은것/검사-${nn}.json`, JSON.stringify({ cut, quote: qStat, dropped: j.dropped, opened: j.opened }, null, 1) + '\n');
  }
  console.log(`${nn} → 새재료-${no} · ${j.lane} ${j.grade} · 받음 ${(j.items || []).length} · 냄 ${keep.length} · 뺌 ${cut.length} · quote 맞음 ${qStat.ok} 틀림 ${qStat.bad} 못엶 ${qStat.closed} · 표기 dict ${keep.filter((x) => x.spelling === 'dict').length}`);
  for (const c of cut) console.log('   뺌', c.key, c.answer, c.why.join(' / '));
}

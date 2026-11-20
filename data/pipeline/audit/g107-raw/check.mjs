// G107 중앙 검사 — chunk-NN.json → 꼴 · 겹침(DB + 앞 묶음) · 사전 표기 → web-desk/tone/보낼것/새재료-NN.json
//   node data/pipeline/audit/g107-raw/check.mjs 01 [02 …]      (DB 는 읽지 않는다 — answers.tsv 를 쓴다)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { normalizeAnswer } from '../../../../shared/dist/normalize.js';
import { dictCheck } from '../../../../scripts/dict-check.mjs';

const D = 'data/pipeline/audit/g107-raw/';
const OUT = 'web-desk/tone/보낼것/';
const n = (s) => normalizeAnswer(String(s ?? ''));

// DB 정답(활성 · 꺼진 것)
const db = new Map(); // norm → {id, act}
for (const l of readFileSync(D + 'answers.tsv', 'utf8').split('\n')) {
  if (!l) continue; const [id, act, d, v] = l.split('\t');
  for (const s of [d, ...(v || '').split('|')]) { const k = n(s); if (!k) continue; const o = db.get(k); if (!o || (act === '1' && !o.act)) db.set(k, { id: +id, act: act === '1' }); }
}
// 이미 낸 새재료(누적)
const seen = new Map();
for (const f of readdirSync(OUT).filter((f) => /^새재료-\d+\.json$/.test(f)).sort()) {
  const j = JSON.parse(readFileSync(OUT + f, 'utf8'));
  for (const it of j.items) for (const s of [it.answer, ...(it.also || [])]) seen.set(n(s), `${j.chunk}/${it.key}`);
}

const MAJ = { '기술·의학':1, '문화·예술':1, '생활·상식':1, '스포츠·게임':1, '인문·사회':1, '자연과학':1, '한국':1 };
const bad = /namu\.wiki|blog\.|tistory|brunch|dcinside|fandom\.com\/wiki/i;
const log = [];
for (const nn of process.argv.slice(2)) {
  const p = `${D}chunk-${nn}.json`;
  if (!existsSync(p)) { console.log(nn, '없음'); continue; }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (!j.done) { console.log(nn, 'done 아님 — 건너뜀'); continue; }
  const keep = [], cut = [];
  for (const it of j.items) {
    const why = [];
    const forms = [it.answer, ...(it.also || [])].filter(Boolean);
    for (const s of forms) { const o = db.get(n(s)); if (o?.act) why.push(`활성 겹침 #${o.id}(${s})`); else if (o && !it.dupOff) it.dupOff = o.id; }
    for (const s of forms) { const o = seen.get(n(s)); if (o) why.push(`새재료 겹침 ${o}(${s})`); }
    if (!MAJ[it.major]) why.push('대분류 이름 ' + it.major);
    const lines = [it.core, ...(it.story || []), ...(it.hintIdea ? [it.hintIdea] : [])];
    if (!it.core?.url || !it.core?.quote) why.push('core 출처 없음');
    const st = (it.story || []).filter((s) => s?.url && s?.quote && !bad.test(s.url));
    if (st.length < (it.story || []).length) it.story = st;   // 출처 없는 줄 · 나무위키 줄은 뺀다
    if (st.length < 2) why.push(`story ${st.length}줄`);
    if (lines.some((s) => s?.url && bad.test(s.url)) && bad.test(it.core?.url || '')) why.push('core 가 받침 출처 아님');
    if (it.hintIdea && (!it.hintIdea.url || bad.test(it.hintIdea.url))) it.hintIdea = null;
    if (why.length) cut.push({ key: it.key, answer: it.answer, why }); else { keep.push(it); for (const s of forms) seen.set(n(s), `${j.chunk}/${it.key}`); }
  }
  // 사전 표기
  const r = await dictCheck(keep.map((it) => it.answer));
  const hit = new Map(r.map((x) => [x.word, x]));
  for (const it of keep) { const x = hit.get(it.answer); it.spelling = x?.found ? 'dict' : (/wikipedia\.org/.test(it.core.url) ? 'wiki' : 'none'); }
  const out = { done: true, chunk: `새재료-${nn}`, lane: j.lane, made: 'G107 · 2026-11-20', items: keep };
  writeFileSync(`${OUT}새재료-${nn}.json`, JSON.stringify(out, null, 1) + '\n');
  writeFileSync(`${D}cut-${nn}.json`, JSON.stringify({ cut, dropped: j.dropped, opened: j.opened }, null, 1) + '\n');
  const sp = keep.reduce((a, it) => ((a[it.spelling] = (a[it.spelling] || 0) + 1), a), {});
  const line = `${nn} ${j.lane} 받음 ${j.items.length} · 냄 ${keep.length} · 뺌 ${cut.length} · 표기 ${JSON.stringify(sp)} · dupOff ${keep.filter((x) => x.dupOff).length} · 에이전트 버림 ${JSON.stringify(j.dropped)} · 연 문서 ${j.opened}`;
  console.log(line); for (const c of cut) console.log('   뺌', c.key, c.answer, c.why.join(' / '));
  log.push(line);
}

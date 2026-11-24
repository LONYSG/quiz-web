// G111 중앙 검사(G107 check.mjs 에서 바꾼 것: 꺼진 카드 · vstock 과 겹쳐도 뺀다 · hintRisk 자동 표시 · spellNote 둔다)
//   node data/pipeline/audit/g111-raw/check.mjs 16 [17 …]   — chunk-NN.json → web-desk/tone/보낼것/새재료-NN.json
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { normalizeAnswer } from '../../../../shared/dist/normalize.js';
import { dictCheck } from '../../../../scripts/dict-check.mjs';

const D = 'data/pipeline/audit/g111-raw/';
const OUT = 'web-desk/tone/보낼것/';
const n = (s) => normalizeAnswer(String(s ?? ''));

// 이미 있는 정답: DB(활성 + 꺼진 것) + vstock (taken.tsv 의 db · vstock 줄) + 새재료 누적(파일에서 다시 읽는다)
const taken = new Map();
for (const l of readFileSync(D + 'taken.tsv', 'utf8').split('\n')) {
  if (!l) continue; const [s, d, , k] = l.split('\t'); if (s.startsWith('새재료')) continue;
  for (const x of (k || '').split('|')) if (x && !taken.has(x)) taken.set(x, `${s} ${d}`);
}
const seen = new Map();
const mine = new Set(process.argv.slice(2).map((x) => `새재료-${x}.json`));
for (const f of readdirSync(OUT).filter((f) => /^새재료-\d+\.json$/.test(f) && !mine.has(f)).sort()) {
  const j = JSON.parse(readFileSync(OUT + f, 'utf8'));
  for (const it of j.items) for (const s of [it.answer, ...(it.also || [])]) seen.set(n(s), `${j.chunk}/${it.key}`);
}
const MAJ = new Set(['기술·의학', '문화·예술', '생활·상식', '스포츠·게임', '인문·사회', '자연과학', '한국']);
const MID = new Set(readFileSync('data/pipeline/audit/g107-raw/categories.txt', 'utf8').split('\n').filter(Boolean).map((l) => l.replace(/ \(\d+\)$/, '')));
const bad = /namu\.wiki|blog\.|tistory|brunch|dcinside|fandom\.com\/wiki/i;
const risky = (a) => /\s/.test(a.trim()) || /(효과|현상|법칙|의 ?날|증후군|역설|원리|이론|주의|딜레마|오류|편향|실험)$/.test(a.trim());
for (const nn of process.argv.slice(2)) {
  const p = `${D}chunk-${nn}.json`;
  if (!existsSync(p)) { console.log(nn, '없음'); continue; }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (!j.done) { console.log(nn, 'done 아님 — 건너뜀'); continue; }
  const keep = [], cut = [];
  for (const it of j.items) {
    const why = [];
    const forms = [it.answer, ...(it.also || [])].filter(Boolean);
    for (const s of forms) { const o = taken.get(n(s)); if (o) why.push(`겹침 ${o}(${s})`); }
    for (const s of forms) { const o = seen.get(n(s)); if (o) why.push(`새재료 겹침 ${o}(${s})`); }
    if (!MAJ.has(it.major)) why.push('대분류 이름 ' + it.major);
    else if (it.mid && !MID.has(`${it.major} > ${it.mid}`)) why.push('중분류 이름 ' + it.mid);
    if (!it.core?.url || !it.core?.quote || bad.test(it.core.url)) why.push('core 출처 없음');
    const st = (it.story || []).filter((s) => s?.url && s?.quote && !bad.test(s.url));
    if (st.length < (it.story || []).length) it.story = st;
    if (st.length < 2) why.push(`story ${st.length}줄`);
    if (it.hintIdea && (!it.hintIdea.url || !it.hintIdea.quote || bad.test(it.hintIdea.url))) it.hintIdea = null;
    const g = +it.gradeGuess;
    if (j.lane === 'easy' && g !== 1) why.push(`쉬움 묶음인데 등급 ${g}`);
    if (j.lane === 'hard' && !(g >= 4)) why.push(`어려움 묶음인데 등급 ${g}`);
    if (j.grade && g !== +j.grade) why.push(`등급 ${j.grade} 묶음인데 등급 ${g}`);
    if (why.length) { cut.push({ key: it.key, answer: it.answer, why }); continue; }
    if (risky(it.answer)) it.hintRisk = true; else if (it.hintRisk !== true) delete it.hintRisk;
    delete it.dupOff;
    keep.push(it); for (const s of forms) seen.set(n(s), `새재료-${nn}/${it.key}`);
  }
  const r = await dictCheck(keep.map((it) => it.answer));
  const hit = new Map(r.map((x) => [x.word, x]));
  for (const it of keep) { const x = hit.get(it.answer); it.spelling = x?.found ? 'dict' : (/wikipedia\.org/.test(it.core.url) ? 'wiki' : 'none'); }
  const out = { done: true, chunk: `새재료-${nn}`, lane: j.lane, grade: j.grade, made: 'G111 · 2026-11-25', items: keep };
  writeFileSync(`${OUT}새재료-${nn}.json`, JSON.stringify(out, null, 1) + '\n');
  writeFileSync(`${D}cut-${nn}.json`, JSON.stringify({ cut, dropped: j.dropped, opened: j.opened }, null, 1) + '\n');
  const sp = keep.reduce((a, it) => ((a[it.spelling] = (a[it.spelling] || 0) + 1), a), {});
  console.log(`${nn} ${j.lane} 받음 ${j.items.length} · 냄 ${keep.length} · 뺌 ${cut.length} · 표기 ${JSON.stringify(sp)} · hintRisk ${keep.filter((x) => x.hintRisk).length} · spellNote ${keep.filter((x) => x.spellNote).length} · 에이전트 버림 ${JSON.stringify(j.dropped)} · 연 문서 ${j.opened}`);
  for (const c of cut) console.log('   뺌', c.key, c.answer, c.why.join(' / '));
}

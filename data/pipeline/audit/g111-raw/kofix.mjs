// G111 — kotitle.txt 결과를 재료에 반영: 넘겨주기 제목은 also 에 · 한국어 위키 문서 없음은 spelling none + spellNote
import { readFileSync, writeFileSync } from 'node:fs';
const O = 'web-desk/tone/보낼것/'; const rows = readFileSync('data/pipeline/audit/g111-raw/kotitle.txt', 'utf8').split('\n').filter(Boolean);
const swap = {};   // 위키 제목으로 정답을 바꾼다(옛 꼴은 also)
const byChunk = {};
for (const l of rows) { const [head, st] = l.split('\t'); const [nn, key] = head.split(' '); if (st === '제목') continue; (byChunk[nn] ??= []).push([key, st]); }
for (const [nn, list] of Object.entries(byChunk)) {
  const p = `${O}새재료-${nn}.json`; const j = JSON.parse(readFileSync(p, 'utf8'));
  for (const [key, st] of list) {
    const it = j.items.find((x) => x.key === key); if (!it) continue;
    const note = (s) => (it.spellNote = (it.spellNote ? it.spellNote + ' · ' : '') + s);
    if (st === '없음') { it.spelling = 'none'; note('한국어 위키백과 문서 없음 · 표준국어대사전에도 없음(2026-11-25 조회) — 국내 번역 표기'); }
    else { const t = st.replace('넘겨주기 → ', '');
      if (swap[key]) { it.also = [...new Set([it.answer, ...(it.also || [])])]; it.answer = swap[key]; note(`정답을 한국어 위키 제목 '${t}' 로 바꿈(옛 꼴은 also)`); }
      else { it.also = [...new Set([...(it.also || []), t])]; note(`한국어 위키 제목은 '${t}'(넘겨주기) — also 에 넣음`); } }
    console.log(nn, key, it.answer, '←', st);
  }
  writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
}

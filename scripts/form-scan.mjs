#!/usr/bin/env node
// =============================================================================
// G098 B-1 — 질문 형태 "꾸미는 말 + 쉼표 + 또 꾸밈"(~는, ~은) 세기 (모델 없음 · DB 읽기만 · 끄지도 고치지도 않는다)
//   식(설계 창 초안 data/pipeline/tone/g098-form-scan-draft.json 과 같은 방식):
//     질문의 마지막 문장에서 쉼표 바로 앞 낱말의 끝 글자가 ㄴ 받침(꾸밈꼴 ~는 · ~던 · ~한 · ~된 …)이면 걸림
//     "에서는 · 에는 · 로는 · 와는 …"처럼 조사로 끝난 낱말 · 접속 낱말(한편 · 반면 …)은 뺀다
//   export formHit(question) → 걸린 낱말 | null  (tone-build.mjs 게이트가 같은 식을 쓴다)
//   사용 node scripts/form-scan.mjs  → data/pipeline/tone/form-scan.json (활성 일반 상식 카드 · quizweb)
// =============================================================================
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_END = /(에서는|에게는|한테는|에는|으로는|로는|와는|과는|보다는|까지는|부터는|에선|만은|이란|론|지만|면|동안|전|반|년|분|천|만|권|런|틴|손|눈|번|단|연|원|근면)$/; // 조사 · 이음말(~지만 · ~면) · 때 · 수 낱말(전 · 후반 · 1992년 · 60분 …)
const SKIP_WORD = new Set(['한편', '반면', '그런', '이런', '저런', '그런데', '물론', '대신', '특히', '당연', '이른바', '흔히']);
const hasN = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 && c % 28 === 4; };

export function lastSentence(q) {
  const s = (q ?? '').normalize('NFC').trim();
  const parts = s.split(/(?<=[.!?])\s+/);
  return parts[parts.length - 1] ?? s;
}

export function formHit(question) {
  const s = lastSentence(question);
  const re = /([^\s,·]+),/g; let m;
  while ((m = re.exec(s))) {
    const w = m[1].replace(/[’'"”)\]」』]+$/, '');
    if (!w || SKIP_WORD.has(w) || SKIP_END.test(w)) continue;
    if (hasN(w.slice(-1))) return w;
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.loadEnvFile?.(path.join(ROOT, '.env'));
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
  // 일반 상식 주관식 = 카드 묶음(web-desk/tone/보낼것/카드-NNN.txt)의 7,147장 중 활성 — G097 과 같은 대상
  const { readdirSync, readFileSync } = await import('node:fs');
  const OUT = path.join(ROOT, 'web-desk/tone/보낼것'); const U = new Set();
  for (const f of readdirSync(OUT).filter((f) => /^카드-\d{3}\.txt$/.test(f))) for (const l of readFileSync(path.join(OUT, f), 'utf8').split(/\r?\n/)) { const h = l.match(/^\[(\d+)\]/); if (h) U.add(Number(h[1])); }
  const rows = (await c.query(`select id::int, question_text from questions where is_active and id = any($1::bigint[]) order by id`, [[...U]])).rows;
  await c.end();
  const hits = rows.map((r) => ({ id: r.id, word: formHit(r.question_text), question: r.question_text })).filter((x) => x.word);
  writeFileSync(path.join(ROOT, 'data/pipeline/tone/form-scan.json'), JSON.stringify({ round: 'G098', db, scanned: rows.length, hits: hits.length, items: hits }, null, 1) + '\n');
  console.log(db, '활성 새 글', rows.length, '· 걸림', hits.length, '→ data/pipeline/tone/form-scan.json');
}

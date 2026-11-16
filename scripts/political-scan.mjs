#!/usr/bin/env node
// =============================================================================
// G098 B-2 — 정치 낱말 세기 (모델 없음 · DB 읽기만 · 끄지 않는다 — 역사 사건은 그대로 두는 것이 기본 · 찬종이 본다)
//   활성 문항 전체의 질문 · 힌트 · 해설에서 탄핵 · 계엄 · 집회 · 시위 · 대통령 선거 · 정당 이름 · 현직/전직 대통령 이름
//   사용 node scripts/political-scan.mjs → data/pipeline/tone/political-scan.json
// =============================================================================
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const WORDS = {
  사건: ['탄핵', '계엄', '집회', '시위', '대통령 선거', '대선', '총선'],
  정당: ['더불어민주당', '국민의힘', '민주당', '새누리당', '한나라당', '정의당', '조국혁신당', '개혁신당', '자유한국당', '미래통합당', '열린우리당', '국민의당', '바른정당', '민주자유당', '민주정의당', '신한국당', '새천년민주당', '공화당'],
  대통령: ['이승만', '윤보선', '박정희', '최규하', '전두환', '노태우', '김영삼', '김대중', '노무현', '이명박', '박근혜', '문재인', '윤석열', '이재명', '트럼프', '바이든', '오바마'],
};
const ALL = Object.entries(WORDS).flatMap(([k, ws]) => ws.map((w) => [k, w]));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const db = new URL(process.env.DATABASE_URL).pathname.slice(1);
const rows = (await c.query(`select id::int, display_answer, question_text, general_hint, explanation from questions where is_active order by id`)).rows;
await c.end();
const items = []; const byWord = {};
for (const r of rows) {
  const hit = [];
  for (const [col, key] of [['question_text', '질문'], ['general_hint', '힌트'], ['explanation', '해설']]) {
    const t = r[col] ?? '';
    // 낱말만 같은 것(정치 아님)은 뺀다: 활시위 · 시위를 걸다 · 카드 트럼프 · 민주정의당 안의 정의당/민주당
    const u = t.replace(/활시위|시위를 (미리 )?걸|시위로/g, '').replace(/트럼프(의 (네|빨간|검은) 무늬| 카드)|패턴 트럼프/g, '').replace(/민주정의당/g, '민정#').replace(/더불어민주당|새천년민주당/g, (m) => m.replace('민주당', '#'));
    for (const [k, w] of ALL) if (u.includes(w)) hit.push({ in: key, kind: k, word: w });
    if (t.includes('민주정의당')) hit.push({ in: key, kind: '정당', word: '민주정의당' });
    if (/더불어민주당|새천년민주당/.test(t)) hit.push({ in: key, kind: '정당', word: t.match(/더불어민주당|새천년민주당/)[0] });
  }
  if (!hit.length) continue;
  for (const w of new Set(hit.map((h) => h.word))) byWord[w] = (byWord[w] ?? 0) + 1;
  items.push({ id: r.id, answer: r.display_answer, words: [...new Set(hit.map((h) => `${h.word}(${h.in})`))], question: r.question_text, hint: r.general_hint, explanation: r.explanation });
}
writeFileSync(path.join(ROOT, 'data/pipeline/tone/political-scan.json'), JSON.stringify({ round: 'G098', db, scanned: rows.length, hits: items.length, byWord, items }, null, 1) + '\n');
console.log(db, '활성', rows.length, '· 걸림', items.length, JSON.stringify(byWord));

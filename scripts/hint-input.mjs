#!/usr/bin/env node
// =============================================================================
// 힌트 작성 입력 보강 — G002 (V006 6절 4·5 → hint-v3 '입력' · DG-009)
//
//   힌트를 쓰는 하위 에이전트에게 문항마다 두 가지를 더 준다
//     questionWords     질문의 낱말 목록 (조사를 거칠게 뗀 것) — 질문 되풀이(H3)를 피하게
//     sameAnswerActive  같은 정답(normalizeAnswer)의 다른 **활성** 문항 — id · 질문 · 해설 · 힌트
//                       힌트가 그 질문·해설과 같은 사실이 되지 않게 (V006 5-2 — 앞 판에서 본 사람에게는 정답)
//
// 사용법
//   node scripts/hint-input.mjs <입력.json> <출력.json>
//     입력: [{ ref|id, question, answer, explanation? }]  (배열, 또는 { items: [...] })
//   DB 는 읽기만 한다.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

const JOSA = /(으로써|으로서|에서는|에게서|이라는|라는|으로|에서|에게|까지|부터|처럼|보다|이며|이고|이다|하는|했던|한|된|은|는|이|가|을|를|의|에|와|과|도|만|로)$/;
/** 질문의 낱말 목록 — 한글 낱말은 끝의 조사·어미를 하나 뗀다. 2글자 미만은 뺀다 */
export function questionWords(question) {
  const out = new Set();
  for (const raw of (question ?? '').split(/[\s·,.?!'"“”‘’()「」\-~]+/)) {
    if (!raw) continue;
    const w = /[가-힣]/.test(raw) && raw.length > 2 ? raw.replace(JOSA, '') : raw;
    if (w.length >= 2) out.add(w);
  }
  return [...out];
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/hint-input.mjs')) {
  const [inp, outp] = process.argv.slice(2);
  if (!inp || !outp) { console.error('사용법: node scripts/hint-input.mjs <입력.json> <출력.json>'); process.exit(1); }
  const raw = JSON.parse(readFileSync(inp, 'utf8'));
  const items = Array.isArray(raw) ? raw : raw.items;
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select q.id, q.question_text, q.explanation, q.general_hint, q.difficulty_score, a.answer_norm
         from questions q join question_answers a on a.question_id = q.id and a.is_primary where q.is_active`);
    const byNorm = new Map();
    for (const r of rows) { if (!byNorm.has(r.answer_norm)) byNorm.set(r.answer_norm, []); byNorm.get(r.answer_norm).push(r); }
    let withSame = 0;
    const out = items.map((it) => {
      const selfId = it.id != null ? String(it.id) : null;
      const same = (byNorm.get(normalizeAnswer(it.answer ?? '')) ?? []).filter((r) => String(r.id) !== selfId)
        .map((r) => ({ id: Number(r.id), difficulty: r.difficulty_score, question: r.question_text, explanation: r.explanation, hint: r.general_hint }));
      if (same.length) withSame++;
      return { ...it, questionWords: questionWords(it.question), sameAnswerActive: same };
    });
    writeFileSync(outp, JSON.stringify(out, null, 1));
    console.log(`[hint-input] ${out.length}건 · 같은 정답 활성 문항이 있는 것 ${withSame}`);
  } finally {
    await client.end();
  }
}

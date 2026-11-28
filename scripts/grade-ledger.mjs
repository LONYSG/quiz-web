// =============================================================================
// 등급 · 알가치 장부(G119 · 찬종 2026-11-28 "문장이 바뀌면 등급도 그 자리에서 다시")
//   파일 data/pipeline/audit/grade-judged.json = { note, items: { "<실 id>": { h, grade, worth, at } } }
//   h = 질문 글(question_text)의 sha1 앞 16자 — 등급 · 알가치를 매길 때 본 질문 글
//   ★ 키는 실 DB(quizweb) id 다 — dev 는 id 가 달라 장부에 넣지 않는다
//   쓰는 곳: g119-apply(첫 8,509 · at V117) · 새 카드 싣기(g118-apply 꼴 · at = 그 싣기 판 이름) · grade-fresh-check(읽기만)
//   ★ 기존 카드의 질문을 고치는 싣기는 같은 판에서 다시 매긴 등급 · 알가치가 있을 때만 싣고, 그 값으로 ledgerPut 한다
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER = path.join(ROOT, 'data/pipeline/audit/grade-judged.json');
export const qHash = (text) => createHash('sha1').update(String(text ?? ''), 'utf8').digest('hex').slice(0, 16);

export function ledgerRead() {
  if (!existsSync(LEDGER)) return { note: '', items: {} };
  return JSON.parse(readFileSync(LEDGER, 'utf8'));
}

/** rows = [{ id, question, grade, worth, at }] — 같은 id 는 덮어쓴다 · 실 DB 일 때만 부른다 */
export function ledgerPut(rows, db = 'quizweb') {
  if (db !== 'quizweb') return 0;
  const L = ledgerRead();
  L.note ||= '등급 · 알가치를 매길 때 본 질문 글의 해시(실 DB id) — scripts/grade-ledger.mjs · 검사 scripts/grade-fresh-check.mjs';
  for (const r of rows) L.items[String(r.id)] = { h: qHash(r.question), grade: r.grade ?? null, worth: r.worth ?? null, at: r.at };
  L.updatedAt = new Date().toISOString();
  writeFileSync(LEDGER, JSON.stringify(L, null, 0).replace(/\},"/g, '},\n"') + '\n');
  return rows.length;
}

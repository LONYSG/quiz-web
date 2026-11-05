#!/usr/bin/env node
// =============================================================================
// G030 ① 질문 다시 쓰기 · ③ 사실 3(3575 질문 · 6625 해설 · 4598 힌트) 반영
//   사용  node scripts/g030-apply-read.mjs --part fact|qe|q01|q02|…|q19 (qe = ⓔ 남은 것 GEN 직접) [--dry-run | --apply | --undo [--dry-run]]
//   입력  data/pipeline/audit/g030-plan-text.json 의 'read-<part>'
//   쓰는 열: question_text · explanation(일화를 해설로 옮길 때) · general_hint(fact 의 4598 만)
//   되돌리기 audit/g030-undo-read.json(모든 part 한 파일 · --undo 는 파일 전체를 되돌린다)
// =============================================================================
import { runText } from './g030-text-lib.mjs';
const pi = process.argv.indexOf('--part');
const PART = pi > 0 ? process.argv[pi + 1] : null;
if (!PART || !/^(fact|qe|q\d\d)$/.test(PART)) { console.error('--part fact|qe|qNN'); process.exit(1); }
await runText({
  part: `read-${PART}`, undoFile: 'g030-undo-read.json', tag: `g030 read ${PART}`,
  cols: PART === 'fact' ? ['question_text', 'explanation', 'general_hint'] : ['question_text', 'explanation'],
  grades: PART === 'fact' ? null : [3, 4, 5],
});

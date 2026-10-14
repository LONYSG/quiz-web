// 제안 문구 기계 검사 — 판정자와 VERIFY 가 쓴다 (DB 안 씀)
//   node chk.mjs hint <ref|id> "제안 힌트"        → checkHint 막힘/경고 + 120자 + 줄바꿈 + 해설·같은 정답 문항 겹침
//   node chk.mjs question <ref> "제안 질문"        → 정답 노출 · 정답 조각 · 빈칸 · 단정어
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { assertiveWords, answerFragments, blankCheck } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const { findAnswerInQuestion } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const [kind, key, text] = process.argv.slice(2);
if (!kind || !key || text == null) { console.log('사용법: node chk.mjs hint|question <ref|id> "문구"'); process.exit(1); }
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
let it;
if (/^\d+$/.test(key)) {
  const all = [...J(SC + '/sample50.json'), ...J(SC + '/pairs29.json')];
  it = all.find((x) => String(x.id) === key);
} else it = J(SC + '/items.json').find((x) => x.ref === key);
if (!it) { console.log('항목 없음', key); process.exit(1); }
const out = { len: [...text].length, newline: /\n/.test(text) };
if (kind === 'hint') {
  const r = checkHint({ hint: text, answer: it.answer, variants: it.variants || [], question: it.question, explanation: it.explanation || '' });
  out.block = r.block; out.warn = r.warn; out.tooLong = out.len > 120; out.ok = !r.block.length && !out.tooLong && !out.newline;
  const same = [...(it.sameAnswerActive || []), ...(it.others || [])];
  out.sameAnswerNote = same.length ? '같은 정답의 다른 문항 ' + same.map((s) => '#' + s.id).join(',') + ' — 질문·해설과 같은 사실인지 직접 읽을 것' : null;
} else {
  out.expose = findAnswerInQuestion(text, it.answer);
  out.exposeVariants = (it.variants || []).map((v) => [v, findAnswerInQuestion(text, v)]).filter((z) => z[1] !== 'none');
  out.frag = answerFragments(text, it.answer).map((h) => h.frag);
  out.blank = blankCheck(text, it.answer);
  out.assertive = assertiveWords(text).map((h) => h.words.join('/'));
  out.ok = out.expose === 'none' && !out.exposeVariants.length && out.blank.ok;
}
console.log(JSON.stringify(out));

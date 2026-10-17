// 제안 문구 기계 검사 (V009) — node chk.mjs hint|question <ref> "문구"   (DB 안 씀)
import fs from 'node:fs';
const SC = 'C:/work/quiz-web/data/pipeline/audit/v014-raw/g009a/_work';
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { assertiveWords, answerFragments, blankCheck } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const { findAnswerInQuestion } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const [kind, ref, text] = process.argv.slice(2);
if (!kind || !ref || text == null) { console.log('사용법: node chk.mjs hint|question <ref> "문구"'); process.exit(1); }
const it = JSON.parse(fs.readFileSync(SC + '/items.json', 'utf8')).find((x) => x.ref === ref);
if (!it) { console.log('항목 없음', ref); process.exit(1); }
const out = { len: [...text].length, newline: /\n/.test(text) };
if (kind === 'hint') {
  const r = checkHint({ hint: text, answer: it.answer, variants: it.variants || [], question: it.question, explanation: it.explanation || '' });
  out.block = r.block; out.warn = r.warn; out.tooLong = out.len > 120; out.ok = !r.block.length && !out.tooLong && !out.newline;
  out.sameAnswerNote = (it.sameAnswerActive || []).length ? '같은 정답 활성 ' + it.sameAnswerActive.map((s) => '#' + s.id).join(',') + ' — 질문·해설과 같은 사실인지 직접 읽을 것' : null;
} else {
  out.expose = findAnswerInQuestion(text, it.answer);
  out.exposeVariants = (it.variants || []).map((v) => [v, findAnswerInQuestion(text, v)]).filter((z) => z[1] !== 'none');
  out.frag = answerFragments(text, it.answer).map((h) => h.frag);
  out.blank = blankCheck(text, it.answer);
  out.assertive = assertiveWords(text).map((h) => h.words.join('/'));
  out.ok = out.expose === 'none' && !out.exposeVariants.length && out.blank.ok;
}
console.log(JSON.stringify(out));

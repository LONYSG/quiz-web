// 제안 문구 기계 검사 (V008) — node chk.mjs hint|question|explanation <id> "문구"   (DB 안 씀)
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v8';
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { assertiveWords, answerFragments, blankCheck } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const { findAnswerInQuestion } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const [kind, key0, text] = process.argv.slice(2);
if (!kind || !key0 || text == null) { console.log('사용법: node chk.mjs hint|question <id> "문구"'); process.exit(1); }
const key = String(key0).replace(/^#/, '').replace(/^g003-.*/, (m) => m);
const q = JSON.parse(fs.readFileSync(SC + '/qrows.json', 'utf8'));
const na = JSON.parse(fs.readFileSync(SC + '/na.json', 'utf8'));
let it;
if (/^\d+$/.test(key)) it = q[key] && { ...q[key], id: Number(key) };
else { const n = na.find((x) => x.key === key); it = n && { ...n }; }
if (!it) { console.log('항목 없음', key); process.exit(1); }
const sameIds = (() => { const all = JSON.parse(fs.readFileSync(SC + '/da-all.json', 'utf8')); return null; })();
const out = { len: [...text].length, newline: /\n/.test(text) };
if (kind === 'hint') {
  const r = checkHint({ hint: text, answer: it.answer, variants: it.variants || [], question: it.question, explanation: it.explanation || '' });
  out.block = r.block; out.warn = r.warn; out.tooLong = out.len > 120; out.ok = !r.block.length && !out.tooLong && !out.newline;
  out.note = '같은 정답의 다른 문항(입력의 sameAnswerActive/others)의 질문·해설과 같은 사실인지는 직접 읽을 것';
} else {
  out.expose = findAnswerInQuestion(text, it.answer);
  out.exposeVariants = (it.variants || []).map((v) => [v, findAnswerInQuestion(text, v)]).filter((z) => z[1] !== 'none');
  out.frag = answerFragments(text, it.answer).map((h) => h.frag);
  out.blank = blankCheck(text, it.answer);
  out.assertive = assertiveWords(text).map((h) => h.words.join('/'));
  out.ok = out.expose === 'none' && !out.exposeVariants.length && out.blank.ok;
}
console.log(JSON.stringify(out));

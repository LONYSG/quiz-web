// 제안 힌트 기계 검사 (V010) — node chk.mjs <id> "문구"   (DB 안 씀)
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v10';
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const [id, text] = process.argv.slice(2);
const it = JSON.parse(fs.readFileSync(SC + '/hint14.json', 'utf8')).find((x) => String(x.id) === String(id));
if (!it) { console.log('항목 없음', id); process.exit(1); }
const r = checkHint({ hint: text, answer: it.answer, variants: it.variants || [], question: it.question, explanation: it.explanation || '' });
const len = [...text].length; console.log(JSON.stringify({ len, newline: /\n/.test(text), block: r.block, warn: r.warn, ok: !r.block.length && len <= 120 && !/\n/.test(text), sameAnswerNote: (it.sameAnswerActive || []).length ? '같은 정답 활성 ' + it.sameAnswerActive.map((s) => '#' + s.id).join(',') + ' — 질문·해설과 같은 사실인지 직접 읽을 것' : null }));

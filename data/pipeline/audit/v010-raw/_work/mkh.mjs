import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json');
const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v10';
const W = 'C:/work/quiz-web/data/pipeline/audit/v010-raw';
const items = JSON.parse(fs.readFileSync(SC + '/hint14.json', 'utf8'));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const rows = (await c.query(`select q.id, q.question_text, q.explanation, a.answer_norm from questions q join question_answers a on a.question_id=q.id and a.is_primary where q.is_active`)).rows; await c.end();
const by = new Map(); for (const r of rows) { if (!by.has(r.answer_norm)) by.set(r.answer_norm, []); by.get(r.answer_norm).push(r); }
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
for (const it of items) it.sameAnswerActive = (by.get(normalizeAnswer(it.answer)) || []).filter((r) => Number(r.id) !== it.id).map((r) => ({ id: Number(r.id), question: r.question_text, explanation: r.explanation }));
fs.writeFileSync(SC + '/hint14.json', JSON.stringify(items, null, 1));
fs.writeFileSync(W + '/_work/h1.txt', items.map((x) => [`### #${x.id}  A=${x.answer}${x.variants.length ? ' 변형: ' + x.variants.join('|') : ''}  난이도 ${x.dif}`, `Q: ${one(x.question)}`, `E: ${one(x.explanation)}`, `before(GEN 이 바꾸기 전 힌트): ${one(x.before)}`, `AFTER(지금 DB 힌트 — 판정 대상, GEN 이 쓴 문구): ${one(x.after)}`, `GEN 사유: ${one(x.why)}   sources: ${x.sources.join(' ; ')}`, ...x.sameAnswerActive.map((s) => `  sameAnswerActive #${s.id}: Q: ${one(s.question)} | E: ${one(s.explanation)}`), ''].join('\n')).join('\n'));
fs.writeFileSync(W + '/_work/h1.refs.json', JSON.stringify(items.map((x) => String(x.id))));
fs.writeFileSync(W + '/_work/h1.prompt.txt', `너는 V010 판정자다 (VERIFY 세션 하위 에이전트). G006 에서 GEN 이 직접 쓴 활성 힌트 14건을 **판정만** 한다 — DB 쓰기 · 파일 수정(아래 출력 파일 외)·서버·빌드 금지. 찬종에게 묻지 않는다. 모든 응답은 한국어.

## 읽을 것
1. \`${W}/RUBRIC.md\` 맨 아래 "(나)" 절(판정 기준 · 결과 형식) — 그리고 \`C:/work/quiz-web/data/pipeline/audit/v009-raw/RUBRIC.md\` 의 "힌트 판정" 절(H9 판정 문장 · CV-11 · CV-12 · 새 규칙 ①②③ · 제안 힌트 규칙)과 \`C:/work/quiz-web/docs/15-QUALITY-STANDARD.md\` §4-1(H0~H12).
2. 입력: \`${W}/_work/h1.txt\`(14건, \`###\` 가 한 항목) · 순서 \`${W}/_work/h1.refs.json\`.

## 방법
- 입력 순서대로 한 항목에 한 객체(RUBRIC (나) 결과 형식). 판정 문장: **"질문을 모르는 보통 한국 성인이 그 힌트만 보고 정답을 바로 말하는가"**(세기만으로 fix 하지 않는다 — 교훈 B). CV-11: 나라·도시의 기본 정체·대표 제품·대표 사건 힌트는 fix. 질문·해설·sameAnswerActive 의 질문·해설과 같은 사실이면 fix(H12).
- ★★ **사실은 \`sources\` 를 WebFetch 로 직접 열어 주장마다 대조한다. 지식(내 기억)으로 true 를 달면 무효다 — 문서를 못 열었거나 문서에 없으면 unverified(basis 는 web 일 때만 true/false).** 힌트의 숫자·연도·직함·단정어는 문서 문장과 글자 대조. WebSearch 는 5회 이내.
- fix 면 \`proposal.hint\`(한 문장 · 120자 · 줄바꿈 없음 · 정답 글자·조각·다른 이름 없음 · 두 번째 줄 사실 · 새 사실은 url 을 열어 확인): 쓰기 전 \`node ${W}/_work/chk.mjs <id> "문구"\` 로 검사(막힘 0).
- afterVsBefore: 이전 힌트보다 나은가 better/same/worse + 한 줄.
- 출력 \`${W}/h1.out.json\` — 입력 순서 그대로 JSON 배열(Write 도구). 429 가 나면 멈추고 저장된 곳까지 보고(모델을 바꾸지 않는다).
- 마지막 보고(6줄 이내): ok/fix 개수 · fix 의 id 와 사유 · better/same/worse 개수 · 못 연 문서 · WebFetch/WebSearch 횟수.
`);
console.log(items.length, items.map((x) => x.id + ':' + x.sameAnswerActive.length).join(' '));

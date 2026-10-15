import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v9';
const R = 'C:/work/quiz-web/data/pipeline/audit/v009-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = Object.fromEntries(J(SC + '/items.json').map((x) => [x.ref, x]));
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = [];
for (let i = 1; i <= 8; i++) { const refs = J(`${R}/_work/p${i}.refs.json`); const s = [...refs]; for (let k = s.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [s[k], s[j]] = [s[j], s[k]]; } pick.push(...s.slice(0, 12)); }
const sh = [...pick]; for (let k = sh.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [sh[k], sh[j]] = [sh[j], sh[k]]; }
fs.writeFileSync(R + '/_work/r2.refs.json', JSON.stringify(sh));
fs.writeFileSync(R + '/_work/r2.txt', sh.map((ref) => { const t = items[ref]; return `### ${ref}  [${t.topic}/${t.sub}]${t.layer ? ' layer=' + t.layer : ''}\nQ: ${one(t.question)}\nA: ${t.answer}${t.variants?.length ? '   변형: ' + t.variants.join(' | ') : ''}\nE: ${one(t.explanation)}\n`; }).join('\n'));
fs.writeFileSync(R + '/_work/r2.prompt.txt', `너는 V009 두 번째 채점자다 (VERIFY 세션 하위 에이전트). 문항 난이도만 **독립적으로** 매긴다 — 파일 수정(아래 출력 파일 외)·DB·서버 금지. 웹은 쓰지 않는다. 모든 응답은 한국어.

## 읽을 것
1. \`C:/work/quiz-web/docs/15-QUALITY-STANDARD.md\` §5-1(난이도 표 · "묻는 사실의 단계 = 풀이에 필요한 가장 쉬운 충분 단서가 요구하는 지식의 단계").
2. 입력: \`${R}/_work/r2.txt\` — 96건 (\`###\` 가 한 항목). 순서 \`${R}/_work/r2.refs.json\`.

## 방법
- 항목마다 질문 \`Q\` 만 보고(해설 \`E\` 는 정답 확인용으로만) 먼저 **풀이에 필요한 가장 쉬운 충분 단서 하나**를 질문에서 그대로 인용해 고른다(\`easiestCue\`). 단서가 여럿이면 가장 흔히 접하는 하나가 단계를 정한다. 그 단서를 어디서 접하는지 §5-1 표(1 초등 · 2 중학 · 3 고교 교과/관심 있는 사람 · 4 대학 교양·수능 심화/애호가 · 5 전공·자격증/마니아도 헷갈림)로 \`dif\` 를 매긴다. 이름이 흔해도 단서가 교과서 밖 세부(경위·수치·수상 순서)뿐이면 4, 깊은 단서 옆에 정의·유명 일화가 같이 있으면 3 이하.
- 애매하면 한쪽을 고르고 \`difWhy\` 끝에 "(경계 3)" / "(경계 4)".
- 출력 \`${R}/r2.out.json\` — 입력 순서 그대로 JSON 배열(Write 도구, 24건마다 \`r2.pNN.json\` 중간 저장도 좋다): \`{"ref":"…","easiestCue":"질문에서 인용","dif":3,"difWhy":"묻는 사실: … — 단계명"}\`.
- 마지막 보고(4줄 이내): 난이도 분포(1~5) · 4 이상 개수.
`);
console.log(sh.length);

import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit', W = A + '/v028-raw/_work/';
const I = JSON.parse(fs.readFileSync(W + 'items.v028.json', 'utf8')); const T = JSON.parse(fs.readFileSync(A + '/v028-targets.json', 'utf8')).items;
const ids = Object.keys(I).filter((i) => I[i].flags.read.grade !== 'a'); const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const NR = Math.ceil(ids.length / 50); const parts = Array.from({ length: NR }, (_, k) => ids.slice(k * 50, k * 50 + 50));
parts.forEach((part, k) => { const name = 'r' + (k + 1);
  fs.writeFileSync(W + name + '.txt', `## 읽기 제안 검토 ${name} (${part.length}건)\n\n` + part.map((i) => `### ${i}\n정답: ${T[i].answer}${T[i].variants?.length ? ' (변형: ' + T[i].variants.join(' / ') + ')' : ''}\n해설: ${one(T[i].explanation)}\n지금 질문: ${one(T[i].question)}\n제안 질문: ${one(I[i].flags.read.proposal)}\n`).join('\n'));
  fs.writeFileSync(W + name + '.keys.json', JSON.stringify(part));
  fs.writeFileSync(W + name + '.prompt.txt', `너는 퀴즈 문장 **고침 제안 검토자**다(VERIFY 하위 에이전트). 이 파일이 지시 전체다. 모든 응답은 한국어. 도구는 Read · Write 뿐(웹 금지).
입력 ${W}${name}.txt — ### 숫자 블록 ${part.length}개: 정답 · 해설 · 지금 질문 · 제안 질문(판정자가 읽기 쉽게 고쳐 쓴 것). 제안은 다음 규칙을 지켜야 한다: 정답·한정어·단서의 **사실은 바꾸지 않는다**; **정답이 새면 안 된다**; 묻는 문장이 마지막에 한 개; 한 문장에 정보 하나.
블록마다 판정: 
- leak: 제안이 정답을 드러내는가(정답 글자·조각·유의어, 또는 **정답의 정의/뜻풀이를 문장에 써서 답이 곧 보이는 경우**, 지금 질문에는 없던 결정적 단서를 새로 넣음). true/false + 한 줄.
- factChange: 지금 질문에 없던 **새 사실**(연도·수치·사람·평가)을 넣거나, 있던 단서를 다른 뜻으로 바꾸거나, 한정어를 지웠는가. true/false + 한 줄(무엇이 달라졌나).
- better: 지금 질문보다 처음 읽는 사람이 이해하기 쉬운가. "yes" / "same"(거의 같음) / "no"(더 나쁨).
- verdict: ok(그대로 써도 됨) / fix(사소하게 고치면 됨 — fixText 에 고친 전문) / reject(쓰면 안 됨 — leak 또는 사실 변경).
결과 ${W}${name}.out.json 에 JSON 배열(입력 순서)을 Write 로 직접: {"id":숫자,"leak":bool,"leakNote":"…","factChange":bool,"factNote":"…","better":"yes|same|no","verdict":"ok|fix|reject","fixText":null|"…"}. 마지막 답변에는 "개수 · ok/fix/reject 수"만 적는다.
`); });
console.log(ids.length, NR);

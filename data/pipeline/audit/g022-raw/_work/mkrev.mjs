// G022 둘째 검토자 조각(r01~ · 50건씩) — 읽기 ⓑⓒ 제안 전수 · V027 r1.prompt + 지시서 읽기 보강 ㄱ·ㄴ
import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit', W = A + '/g022-raw/_work/';
const M = JSON.parse(fs.readFileSync(W + 'merged.json', 'utf8')).res; const T = JSON.parse(fs.readFileSync(A + '/g022-raw/targets.json', 'utf8')).items;
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const ids = Object.keys(M).filter((i) => M[i].read.grade !== 'a').sort((a, b) => a - b);
const PER = 50, N = Math.ceil(ids.length / PER);
for (let k = 0; k < N; k++) {
  const part = ids.slice(k * PER, (k + 1) * PER); const name = 'r' + String(k + 1).padStart(2, '0');
  fs.writeFileSync(W + name + '.txt', `## 읽기 제안 검토 ${name} (${part.length}건)\n\n` + part.map((i) => `### ${i}\n정답: ${T[i].answer}${T[i].variants?.length ? ' (변형: ' + T[i].variants.join(' / ') + ')' : ''}\n해설: ${one(T[i].explanation)}\n지금 질문: ${one(T[i].question)}\n제안 질문(${M[i].read.grade}${M[i].read.glossed ? ' · 용어 풀이' : ''}): ${one(M[i].read.proposal)}\n`).join('\n'));
  fs.writeFileSync(W + name + '.keys.json', JSON.stringify(part));
  fs.writeFileSync(W + name + '.prompt.txt', `너는 퀴즈 문장 **고침 제안 검토자**다(GEN 하위 에이전트). 이 파일이 지시 전체다. 모든 응답은 한국어. 도구는 Read · Write 뿐(웹 · 스크립트 금지).
입력 ${W}${name}.txt — ### 숫자 블록 ${part.length}개: 정답 · 해설 · 지금 질문 · 제안 질문(판정자가 읽기 쉽게 고쳐 쓴 것). 제안은 다음 규칙을 지켜야 한다: 정답·한정어·단서의 **사실은 바꾸지 않는다**; **정답이 새면 안 된다**; 묻는 문장이 마지막에 한 개; 한 문장에 정보 하나; 200자 안(용어 풀이 때문이면 240자까지).
특히 본다(2라운드 보강):
ㄱ. 정답이 그 용어이면 **정답의 정의 · 뜻풀이를 문장에 쓰면 안 된다**(쿠키를 "방문한 사람을 기억하도록 브라우저에 저장하는 작은 정보" 로, 상여를 "죽은 사람을 묻을 곳까지 나르는 도구" 로 풀면 답이 곧 보인다). 정답 · 변형의 글자나 조각이 제안에 새로 들어갔는지도 본다(텔레비전 → "텔레").
ㄴ. 지금 질문에 없던 사실(연도 · 수치 · 칭호 · 평가 · 일화)을 넣으면 안 된다 — 고치기는 다시 쓰기지 보태기가 아니다(마이센에 왕 칭호 · 아르키메데스에 "가장 자랑스러워해" 를 넣어 폐기됐다). 단 어려운 용어를 쉬운 말로 푸는 괄호 풀이(정답이 아닌 용어)는 새 사실이 아니다.
블록마다 판정:
- leak: 제안이 정답을 드러내는가(정답 글자·조각·유의어, 또는 정답의 정의/뜻풀이를 써서 답이 곧 보이는 경우, 지금 질문에는 없던 결정적 단서를 새로 넣음). true/false + 한 줄.
- factChange: 지금 질문에 없던 새 사실을 넣거나, 있던 단서를 다른 뜻으로 바꾸거나, 한정어를 지웠는가. true/false + 한 줄(무엇이 달라졌나).
- easier: 지금 질문보다 처음 읽는 사람이 이해하기 쉬운가. "yes" / "same"(거의 같음) / "no"(더 나쁨).
- verdict: ok(그대로 써도 됨) / fix(사소하게 고치면 됨 — fixText 에 고친 질문 전문) / reject(쓰면 안 됨 — leak 또는 사실 변경, 또는 easier no).
결과 ${W}${name}.out.json 에 JSON 배열(입력 순서)을 Write 로 직접: {"id":숫자,"leak":bool,"leakNote":"…","factChange":bool,"factNote":"…","easier":"yes|same|no","verdict":"ok|fix|reject","fixText":null|"…"}. 마지막 답변에는 "개수 · ok/fix/reject 수"만 적는다.
`);
}
console.log(ids.length, 'proposals in', N, 'pieces');

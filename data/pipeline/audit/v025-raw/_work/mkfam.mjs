// V025 — 친숙도 둘째 판정자 조각(f01~f06) + 힌트만 보고 맞혀 보기 조각(h01~h05) 입력·프롬프트
import fs from 'node:fs';
const ROOT = 'C:/work/quiz-web';
const RAW = ROOT + '/data/pipeline/audit/v025-raw';
const W = RAW + '/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const T = J(ROOT + '/data/pipeline/audit/g019a-verify-targets.json').targets;
const TOPIC_KO = { history: '역사·사회', media: '미디어·콘텐츠', science: '과학·기술', sports: '스포츠', life: '생활', korea: '한국', arts: '문화·예술' };
const MIDS = new Map(J(ROOT + '/tmp/g019/active.json').map((r) => [r.l2key, r.l2name]));
const midName = (m) => MIDS.get(m) ?? m;
const CAL = J(ROOT + '/data/pipeline/audit/v023-raw/_work/cal1.json'); // V022 보정 예 10 (기대 3 둘 · 2 셋 · 1 다섯)
let seed = 20261024; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const sh = (a) => { const s = [...a]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };

// ---- 친숙도 둘째 판정자 ----
const base = sh(T.map((t) => ({ id: 1000 + T.indexOf(t) + 1, ref: t.ref, answer: t.answer, topicKo: TOPIC_KO[t.topic], mid: midName(t.mid), first: one(t.identity) })));
const NF = 6, per = Math.ceil(base.length / NF);
const fam = [];
for (let i = 0; i < NF; i++) {
  const part = base.slice(i * per, (i + 1) * per);
  const mix = sh([...part, ...CAL.map((c) => ({ id: c.id, answer: c.answer, topicKo: c.topicKo, mid: c.mid, first: c.first, cal: true, expected: c.expected }))]);
  const name = 'f' + String(i + 1).padStart(2, '0');
  fs.writeFileSync(`${W}/${name}.txt`, `## 정답 친숙도 조각 ${name} (${mix.length}건)\n\n` + mix.map((x) => `### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n한 줄 정체(구별용): ${x.first}\n`).join('\n'));
  fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(mix.map((x) => x.id)));
  fam.push({ name, n: mix.length });
  fs.writeFileSync(`${W}/${name}.prompt.txt`, `너는 퀴즈 **정답 친숙도** 판정자다(VERIFY 세션 하위 에이전트 — 둘째 판정자). 이 파일이 지시 전체다. 모든 응답은 한국어. 도구는 Read · Write 뿐이다(웹·검색·다른 파일 열기 금지 — 입력 파일 하나와 결과 파일 하나만).
## 일
입력 ${W}/${name}.txt (### 숫자 로 시작하는 블록 ${mix.length}개 — 순서 ${name}.keys.json). 블록마다 정답 · 묶음 · 중분류 · 한 줄 정체(같은 이름의 다른 대상을 구별하기 위한 것)가 있다. **질문·난이도·힌트는 없다(일부러 뺐다).** 정답이 "무엇인지"를 한 줄 정체로만 알고, 아래 물음에 답한다.
## 판정 물음
**"한국 성인 100명(대졸 30대 · 퀴즈 프로를 가끔 봄)에게 이 정답의 이름만 보여 주면 몇 명이 '들어 봤다'고 할까?"** 판정자(너) 자신의 지식이 아니라 그 보통 성인을 어림한다. 어림한 수 pct(0~100)를 적고, pct 70 이상이면 familiarity 3 · 30 이상 70 미만이면 2 · 30 미만이면 1 이다.
- **3** = 보통 성인 대부분이 이름을 알고 무엇인지 대강 안다. 예: 나폴레옹 · 임진왜란 · 번아웃.
- **2** = 이름을 들어 봤거나 정답을 보면 "아 그거" 한다. 예: 예니체리 · 우신예찬 · DSM.
- **1** = 처음 듣는다. 예: 뒤베르제의 법칙 · 시뇨리지 · 음의 소득세.
- 질문이 쉬운지·어려운지는 보지 않는다(이 축은 정답 이름의 친숙함뿐). 전문 분야 사람만 아는 이름(학술 용어 · 작은 지역 · 마이너 인물 · 옛 제도)은 1~2 쪽이다. 한 번이라도 뉴스·교과서·영화·게임에서 접했을 법한 이름은 2 이상이다. 같은 이름이 여러 대상일 때는 한 줄 정체의 대상을 기준으로 한다.
- 어림이 흔들리면 pct 로 솔직하게 적는다(경계를 일부러 올리거나 내리지 않는다).
## 결과
${W}/${name}.out.json 에 JSON 배열(입력 순서 · ${mix.length}개)을 Write 로 직접 쓴다(스크립트 금지): {"id":숫자(### 뒤 숫자 그대로 — 음수도 그대로),"familiarity":1|2|3,"pct":0~100,"why":"한 줄(어디서 접했을 법한가 / 왜 낯선가)"}. 쓴 뒤 개수·순서를 확인하고 마지막 답변에는 "개수 · 1/2/3 수"만 짧게 적는다.
`);
}
fs.writeFileSync(W + '/fam.map.json', JSON.stringify(Object.fromEntries(base.map((x) => [x.id, x.ref]))));

// ---- 힌트만 보고 맞혀 보기 (320) ----
const hs = sh(T.filter((t) => t.hint).map((t, i) => ({ key: 'h' + String(i + 1).padStart(3, '0'), ref: t.ref, topicKo: TOPIC_KO[t.topic], hint: one(t.hint) })));
const NH = 5, ph = Math.ceil(hs.length / NH); const gu = [];
for (let i = 0; i < NH; i++) {
  const part = hs.slice(i * ph, (i + 1) * ph); const name = 'h' + String(i + 1).padStart(2, '0');
  fs.writeFileSync(`${W}/${name}.txt`, `## 힌트 맞혀 보기 조각 ${name} (${part.length}건)\n\n` + part.map((x) => `### ${x.key}\n묶음: ${x.topicKo}\n힌트: ${x.hint}\n`).join('\n'));
  fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(part.map((x) => x.key)));
  gu.push({ name, n: part.length });
  fs.writeFileSync(`${W}/${name}.prompt.txt`, `너는 퀴즈 "정답 모르는 판정자"다(VERIFY 세션 하위 에이전트). 이 파일이 지시 전체다. 모든 응답은 한국어. 도구는 Read · Write 뿐이다(웹·검색·다른 파일 열기 금지 — 입력 파일 하나와 결과 파일 하나만. 정답이 든 파일을 열면 안 된다).
## 일
입력 ${W}/${name}.txt (### 키 로 시작하는 블록 ${part.length}개 — 순서 ${name}.keys.json). 블록마다 **묶음 이름과 힌트 한 문장만** 있다. 질문은 없다. 보통 한국 성인이 이 힌트 한 문장만 보고 **정답이 무엇일지** 맞혀 본다.
- guess: 정답 하나(한국어 이름). 모르면 가장 그럴듯한 이름을 적고 confidence 를 low 로.
- confidence: high | medium | low.
- how: 맞히게 된 경로 하나 — "A" = 힌트가 그 대상의 정체·정의·대표 사건·대표작·이름 뜻풀이를 그대로 말해서 바로 떠올랐다 · "B" = 힌트의 구체 사실(조연 인물·다른 작품·숫자·제도 세부·뒷이야기)에서 한 번 추론했다 · "C" = 그 사실을 이미 알고 있어서 추론 없이 바로 알았다(힌트가 사실상 정답) · "X" = 짐작 · 못 맞힐 것 같다.
- note: 한 줄(왜 그렇게 봤나 · 대안 후보).
## 결과
${W}/${name}.out.json 에 JSON 배열(입력 순서 · ${part.length}개)을 Write 로 직접 쓴다(스크립트 금지): {"key":"h001","guess":"…","confidence":"high","how":"B","note":""}. 쓴 뒤 개수·순서를 확인하고 마지막 답변에는 "개수 · high/medium/low 수 · A/B/C/X 수"만 짧게 적는다.
`);
}
fs.writeFileSync(W + '/guess.map.json', JSON.stringify(Object.fromEntries(hs.map((x) => [x.key, x.ref]))));
console.log(JSON.stringify({ fam, guess: gu, per, ph }));

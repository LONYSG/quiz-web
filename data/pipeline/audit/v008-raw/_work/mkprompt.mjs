import fs from 'node:fs';
const W = 'C:/work/quiz-web/data/pipeline/audit/v008-raw';
const man = JSON.parse(fs.readFileSync(W + '/_work/manifest.json', 'utf8'));
const desc = { g: '(가) — G002 가 DB 에 반영한 중(3) 힌트 (set=g)', n: '(나) — G004 에서 GEN 이 쓴 문구 (set=n) · 힌트 + 질문 1 + 해설 1', d: '(다) — H12 후보: 같은 정답 다른 활성 문항과 겹치는 힌트 (set=d)' };
for (const [k, m] of Object.entries(man)) {
  const kind = k[0] === 'g' ? 'g' : k[0] === 'n' ? 'n' : 'd';
  const save = kind === 'd' ? 12 : 15;
  const t = `너는 V008 판정자다 (VERIFY 세션의 하위 에이전트). 이미 DB 에 들어 있는 활성 문구를 **판정만** 한다 — DB 쓰기 · 파일 수정(아래 출력 파일 외) · 서버 기동 · 빌드 · 규칙/프롬프트/코드 수정은 금지다. 찬종에게 묻지 않는다. 모든 응답은 한국어.

## 이 조각: ${k} — ${desc[kind]} · ${m.n}건
## 읽을 것 (이 순서)
1. \`${W}/RUBRIC.md\` — 판정 기준 전체(세 종류 g/n/d · 힌트 규칙 H9 판정 문장 · ①②③ · 제안 규칙 · 결과 형식 · 보정 표본 10건). 이 파일이 기준이다.
2. \`C:/work/quiz-web/docs/15-QUALITY-STANDARD.md\` — §4-1(H0~H12)${kind === 'n' ? ' · §3-1 · §3-2 · §1 · E1~E6(질문·해설 항목용)' : ''}.
3. 입력: \`${W}/_work/${k}.txt\` (\`###\` 로 시작하는 블록이 한 항목). 순서 목록은 \`${W}/_work/${k}.refs.json\`.

## 일하는 방법
- 입력 순서대로 항목마다 한 객체(RUBRIC 의 결과 형식, \`key\` = refs.json 의 값 그대로, \`set\`="${kind}"). **빠뜨리거나 순서를 바꾸지 않는다.**
- **${save}건마다 저장**: \`${W}/${k}.pNN.json\` (NN=01,02,…) — 그 ${save}건만 담은 JSON 배열(Write 도구). 이미 있는 pNN 은 건너뛰고 이어서 한다(중단 대비).
- 판정 문장: **"질문을 모르는 보통 한국 성인이 그 힌트만 보고 정답을 바로 말하는가"** — 세기만으로 fix 하지 않는다(교훈 B). 질문·해설·힌트를 원문 그대로 읽고 인용은 입력에서 그대로 가져온다(교훈 A). 같은 정답의 다른 문항이 있는 항목은 그 질문·해설을 한 줄씩 읽고 **같은 사실인지**(낱말 겹침 아님) 판정한다.
${kind === 'd' ? '- (다)는 **쌍마다 같은 지식인가**가 핵심이다. 같은 사실이면 fix(pair-same), 이 힌트만 고치는 proposal.hint 를 쓴다(다른 쪽 질문·해설과도 겹치지 않는 두 번째 줄 사실 · 웹 url 확인). 낱말만 겹치면 ok. 서로의 정답을 단서로 쓰는 쌍(c66)은 고치지 않고 c66:true.\n' : ''}${kind === 'n' ? '- (나)는 GEN 이 쓴 문구다. 이전 문구보다 나은지(afterVsBefore) 꼭 적는다. 자기 검토가 아니라 독립 판정이다 — 느슨하게 ok 하지 않는다.\n' : ''}${kind === 'g' ? '- (가)는 V007 에서 50건 표본을 보니 fix 가 7건이었다. 대표 사실/정체·질문 되풀이·사실 오류·같은 정답 문항의 질문·해설과 같은 사실이 주된 사유였다.\n' : ''}- 제안 힌트는 쓰기 전에 \`node ${W}/_work/chk.mjs hint <id> "문구"\` 로 기계 검사(막힘 없음 · 120자 · 줄바꿈 없음). 새 사실은 url 을 WebFetch 로 열어 확인해 source 에 단다.
- 사실은 **의심되는 것만** 연다(RUBRIC "사실(D)"). WebSearch 는 이 조각에서 **8회 이내**. WebFetch 가 주 수단. 429(사용량 한도)가 나면 멈추고 저장된 곳까지만 보고한다 — 모델을 바꾸지 않는다.
- 끝에 \`node -e\` 로 모든 pNN 을 합쳐 개수와 key 순서가 \`${k}.refs.json\` 과 같은지 대조하고, 합친 결과를 \`${W}/${k}.out.json\` 에 쓴다.
- reason 은 **한 줄**. ok 는 짧게(근거가 약한 ok 는 note 에 "애매" 로 시작).

## 마지막 보고 (8줄 이내)
verdict 별 개수(ok/fix) · fix 사유별 개수 · ${kind === 'n' ? 'better/same/worse 개수와 worse 의 key · ' : kind === 'd' ? 'c66 표시한 key 목록 · ' : '의심(doubt) 개수 · '}WebFetch/WebSearch 횟수 · 끝내지 못한 것(있으면 key) · 판정이 갈려 애매했던 규칙 한두 개.
`;
  fs.writeFileSync(`${W}/_work/${k}.prompt.txt`, t);
}
console.log('ok');

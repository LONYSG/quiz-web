import fs from 'node:fs';
const ins=(f,afterRe,text)=>{ const L=fs.readFileSync(f,'utf8').split('\n'); const i=L.findIndex(l=>afterRe.test(l)); if(i<0) throw new Error(f+' 앵커 없음'); L.splice(i+1,0,...text); fs.writeFileSync(f,L.join('\n')); };
ins('docs/13-PENDING-CHECKS.md',/^\| CV-171 \|/,[
'| CV-172 | ★ V043 fixes 묶음 → **G045(아침)가 기계 적용** | 세트 30 의 `verify.fixes`(round V043 · op variant / variant-remove) — add 171 · remove 1 · 적용 순서 = 플레이 노출 큰 세트부터: mcu-film 37 · lol-champion 16 · mountain-100 16 · seoul-subway-station 12 · world-capital 12 · country 10 · river-national 9 · 나머지. 적용 전 확인: `latinAbbr:true` 6건(KBO LG · KIA · SSG · NC · kt · EPL QPR · 지하철 DMC)은 18 §9 라틴 예외 밖 — CV-173 결정 뒤 적용 · conf mid 는 웹 확인 안 됨. 항목 단위: `audit/v043-topics.json` | V043 | 적용 뒤 topics-check 막힘 0 · items 불변 확인(변형 칸만) |',
'| CV-173 | ★ V043 규칙 후보 (설계 결정) | ① **15 §2 를 주제 세트에 맞게**: 주제 세트 변형은 "플레이어가 입력칸에 치는 꼴" — 콜론(:)·하이픈·아포스트로피는 정규화가 안 지우니 **부제 있는 작품은 콜론 뺀 꼴을 변형에 넣는다** · 음차 두 꼴(저/져 · 즈/스 · 썬/선) · 번호 약칭 · 산/강/역/앞 뺀 꼴 · 조선 왕 본명 · 롤 영문 아포스트로피 뺀 꼴. ② **구단·기업 영문 약칭(LG · KIA · SSG · NC · kt · QPR · DMC)** — 18 §9 라틴 예외(사람·작품 이름·원소 기호)에 "구단 약칭" 추가 여부(권장: 허용 — 2~4글자 약칭만). ③ 세트 종류별: open 은 동의어(핸드폰 꼴)만 · closed 지명은 접미사 뺀 꼴 · 다른 항목과 겹치는 말(중구 · 동구 · 콩고 · 델리)은 넣지 않음. ④ 정규화 한계: 조사 · 하이픈 · 로마숫자 · 콜론 · 아포스트로피는 안 받음 → 코드로 콜론 무시를 넣을지(퀴즈 쪽 영향 측정 필요 — 설계 판단) | V043 | 설계 결정 뒤 18 §9 · 15 §2 |']);
ins('docs/13-PENDING-CHECKS.md',/^\| C109 \|/,[
'| C111 | ★ **끝(V043 — 2026-11-09 · 주제 세트 변형 완전성 전수 · 세트 30(us-state 제외) · 항목 2,554 · 청크 26(에이전트 8 + 직접 3 세트) · 웹 0) — add 제안 171 · remove 1 · 재독에서 9 빼거나 되돌림(당고개 remove 는 세트 note 와 어긋나 철회) · 제안 0 세트: seoul-gu · kr-municipality · solar-system · kr-president)** | `ai-out/V043.txt` · `audit/v043-topics.json` · `audit/v043-raw/v043-proposals.json` · CV-172 · CV-173 | 세트 파일 verify 칸만 씀 — status · items 불변(전후 비교 코드) · topics-check 막힘 0 |']);
ins('ai-out/README.md',/^\| V042\.txt \|/,['| V043.txt | ★ **주제 세트 변형 완전성 전수** VERIFY — 세트 30 · 항목 2,554 · add 제안 171 · remove 1 · 정규화가 안 받는 꼴(콜론 · 하이픈 · 아포스트로피) 실측 · latinAbbr 6 · C111 · CV-172~173 |']);
const sec=`
## 2026-11-09 — V043 주제 세트 변형 완전성 전수 (VERIFY · 판정만 · DB 없음)
- 세트 30(us-state 제외) 항목 2,554 전부를 "플레이어가 치는 표기" 로 훑음 — 청크 26(에이전트 8 + 직접 3 세트) · 정규화 기준선(canon.mjs)으로 이미 받는 꼴 제외 · 제안 add 171 · remove 1(재독에서 9 뺌).
- 쓴 것: 세트 30 파일의 \`verify\` 칸만(round V043 · 앞 verify 는 history) · status · items 불변 · topics-check 막힘 0 · \`ai-out/V043.txt\` · \`audit/v043-topics.json\` · 13 C111 · CV-172~173.
- 남은 것: CV-172(G045 적용) · CV-173(설계 결정 — 구단 영문 약칭 · 콜론).
`;
for (const f of ['docs/06-WORKLOG.md']) { const L=fs.readFileSync(f,'utf8').split('\n'); const i=L.findIndex(l=>l.startsWith('## 2026-11-09 — V041')); L.splice(i,0,...sec.trimStart().split('\n'),''); fs.writeFileSync(f,L.join('\n')); }
let s=fs.readFileSync('docs/05-STATUS.md','utf8'); const k=s.indexOf('> ★ Track D 추가: **V042**'); s=s.slice(0,k)+'> ★ Track D 추가: **V043**(2026-11-09 · 주제 세트 변형 완전성 전수 — 세트 30 · 항목 2,554 · add 제안 171 · remove 1 · 파일 verify 칸만 · `ai-out/V043.txt` · CV-172~173 · G045 가 적용)\n'+s.slice(k); fs.writeFileSync('docs/05-STATUS.md',s);

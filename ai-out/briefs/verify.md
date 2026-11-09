[VERIFY V044 — ★ **라이어 제시어 15 세트 전수 판정**(G047 결과 ≈750 — docs/18 §12 기준: **보편성(era) · 게임성(한마디 설명 거리 · 너무 넓음/좁음) · `fool` 거리**("바보 단어를 받은 사람이 정답을 2개 안으로 좁힐 수 있나" · 1:1 짝 · 같은 작품) · `diff` · 중복 · 변형) → 세트마다 verify 칸 + status(verified / candidate+fixes) **파일에 쓴다** · 판정만 · 웹 적음 · DB 없음 · C112 · CV-174~175 · Sonnet · 2시간 · ★ **G047 이 끝나 있어야 시작**(README G 표 · ai-out/G047.txt — 없으면 10분마다 확인 · 최대 1시간 · 그래도 없으면 "V044 대기" 한 줄로 멈춤)]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 찬종 2026-11-09 — 라이어 제시어를 외부 목록(toz)과 우리 open 세트를 씨앗으로 **다시 만들었다**(G047 · 주제 15 · 각 40~60 · 항목마다 바보형 `fool` 2~3 · `era` · `sub` · `diff`). 라이어 게임은 두 모드가 생긴다 — 기본형(라이어는 주제만) · **바보형**(라이어에게 정답 아닌 비슷한 단어 · 라이어라는 사실도 안 알려 줌). 찬종의 걱정 그대로: **"호날두를 받았는데 정답이 메시일 수 있겠다 싶으면 라이어가 바로 눈치챈다"** — fool 이 너무 가까우면 안 되고(1:1 짝) 너무 멀면(다른 종목) 한마디에 들킨다. 이 라운드의 핵심은 **fool 거리 판정**이다. 생성자(GEN)의 자기 판정은 1차 점검일 뿐(16 0장).
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-3 그대로 + 예외(V039 꼴): 15 파일의 **`verify` 칸과 `status`** 만(앞 verify 는 history · items 는 안 바꿈 · 들여쓰기 그대로 · 쓴 뒤 `node scripts/topics-check.mjs` 막힘 0). 13 **C112** · **CV-174**(fixes 묶음 → G049) · **CV-175**(규칙 후보 — fool 거리 기준 다듬기 · era 경계 · 2026 센스 단어의 수명) · README V · 05 · 06. 조각 `audit/v044-raw/`. DB 없음 · 웹 ≤ 30(인지도 의심 항목 · 인물 논란 확인).
■ 동시 라운드 — GEN **G048**(`draw-*.json` 새 파일 · proverb/idiom4 삭제 — 라이어 15 파일은 안 건드림) · MAIN 다음 라운드(코드) → 겹침 없음. 문서 분담: V044 = 13 C112 · CV-174~175 · README V · 라이어 15 파일 verify/status.

■ 먼저 읽기: `ai-out/G047.txt`(0절 ①~⑤ · 2절 결정 필요 — 연예인 · modern) · docs/18 **§12**(칸 · 기준 ①~④ · fool 규칙) · `audit/g047-dropped.json`(뺀 씨앗 — 아까운 것 복구 제안용) · `audit/g047-raw/seed/seed.json`(씨앗 — 참고) · 15 파일 전부 · docs/15 §2(변형).

■ 판정 틀(항목마다 · 조각 sonnet · 세트당 1 조각 · 동시 2 · 첫 조각(동물 — 뻔한 것)은 VERIFY 가 전부 읽고 기준 맞춤)
 (1) **보편성·era**: 20~50대 한국인 대부분이 아는가(아니면 remove) · `era` 가 맞나(classic 인데 2015 이후 것 · modern 인데 한철 유행 → fix/remove) · 논란 인물(정치 · 사건 · 범죄) → remove.
 (2) **게임성**: 한마디로 돌려 설명할 거리가 있나 · 너무 넓은 상위어(물건 · 음식) · 너무 좁은 것(모델명 · 특정 회차) → remove/fix · `diff` 1·2·3 이 맞나(표본 아니라 전부 — 짧다).
 (3) ★ **fool 거리**(fool 하나하나): ⓐ 같은 소분류(`sub`)인가 ⓑ **1:1 짝·라이벌·같은 작품 아닌가**(호날두↔메시 · 코카콜라↔펩시 · 해리↔론 · 짱구↔철수) ⓒ **"이 fool 을 받고 남들 설명을 들으면 정답을 2개 안으로 좁힐 수 있나"** — 좁힐 수 있으면 `tooClose` ⓓ 너무 멀어 첫 한마디에 들키나(다른 종목 · 다른 장르) → `tooFar` ⓔ fool 이 그 세트의 다른 항목 name 과 같아도 됨(허용) · 정답과 정규화가 같은 꼴이면 X → fool 마다 ok/tooClose/tooFar/bad + 대안 1(제안).
 (4) **중복·변형**: 세트 안 같은 대상 두 번(음차 다름) · variants 15 §2 · 라이어 키워드 맞히기에서 받아야 할 흔한 표기 빠짐 → fixes.
 (5) **status**: 문제 항목 ≤ 3 → verified(fixes 동봉) · 그 이상 → candidate + fixes · fool 문제는 항목 문제로 센다(fool 하나 바꾸기 = fix 1).
■ 재독(VERIFY): fix·remove 전부 + **fool tooClose 판정 전부** + 세트마다 ok 10 + 연예인 세트 전부(논란) → `audit/v044-topics.json`(항목 전부 키 · fool 별 판정 포함).
■ 할 일: A 준비(G047 끝 확인 · 15 세트 · 항목 수 · fool 수 · 13 마지막(C111 → **C112** · CV-173 → **CV-174~**) · README V 마지막 V043 · 지시서) · B 조각 → 재독 → json(커밋 1) · C 파일 15 verify/status 한 번에 → topics-check 막힘 0(커밋 2) · D 13 C112 · CV-174(fixes 묶음 — 세트별 remove/fix/fool 교체 수 → **G049**) · CV-175(규칙 후보) · README V · 05 · 06 · `ai-out/V044.txt`(0 ★ 찬종이 볼 것: ① 세트 15 verdict 표(항목 · remove · fix · fool 교체 · verified 여부) → "**G049 적용 뒤 메뉴 1 때 라이어 주제 n · 단어 n**" ② fool tooClose 예 10 · tooFar 예 5(어떤 짝이 걸렸나) ③ 뺀 것 예 10(사유) ④ era 바꾼 것 예 5 ⑤ 연예인 세트 소견 · 1~7절 — 표본으로만 본 것 · 웹으로 본 것 수)(커밋 3).
■ 하지 말 것: items 고치기(제안만) · draw-* 세트(V045) · closed 세트 · proverb/idiom4 · 코드 · 18 · 13 A · C115 · C116 · README G · R · 같은 항목 두 번 판정.
■ 커밋: 위 파일만 · 1~3 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): G047 끝(G047.txt · README G) · 15 파일 · 항목 ≈750 · fool 2~3/항목 · era/sub/diff 전부 있음 · closed 태그 0 · 13 마지막 · README V 마지막 V043 · GEN G048 돎.
■ 지난 피드백(V043): 잘한 것 — 정규화 기준선을 기계로 먼저 재고 제안 · 재독에서 9 뺌 · 웹 0 을 숨기지 않음. 이번엔 **fool 하나하나가 게임성**이다 — 애매하면 tooClose 쪽으로 엄하게.
■ ★ 이어서: 보고서 · 커밋 · push 뒤 **`ai-out/briefs/verify-next.md`(V045 캐치마인드 풀 판정)를 읽고 같은 창에서 바로 시작**(없거나 첫 줄 "보류" 면 멈춤 · G048 이 안 끝났으면 그 브리프의 대기 규칙대로). 그 전 터미널 마지막 줄 "V044 끝 — verify-next(V045) 이어서 · /clear 아직".
■ 답변: 한국어 · 터미널 5줄 이내.

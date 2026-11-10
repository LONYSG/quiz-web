[GEN G051 — ★ **캐치마인드 2차 합치기 + 지하철 두 세트 마무리** — ① V046 fixes 2(4호선 과천정보타운 remove · 경의중앙 한국항공대 + "항공대") → 두 세트 verified ② 웹 계정이 다시 고른 캐치 씨앗 **4,621 단어**(web-desk/catch2 — 찬종 "일단 전부 넣고 태그 정보만 가지고 있어 · 나중에라도 수정 가능하게")를 `draw-*` 세트에 합침 · 항목 칸 **`g`**(게임성 1~3) · `draw-etc` 는 새 세트 3~5 로 나눔 · 실존 연예인·선수는 2026 에도 누구나 아는 사람만 · candidate · DG-089 · C121 · 2시간 · 끝나면 VERIFY V047(표본 300)]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: G048 은 나무위키 씨앗 8,122 에서 "추상 · 그리기 어려움" 으로 5,500 을 떨궜다. 찬종 기준은 "아는 단어인가" 하나(18 §12 ★ 캐치 단어 기준 개정 2026-11-10) → 떨군 5,829 를 찬종의 웹 Claude 계정(Sonnet 5.5)이 그 기준으로 다시 판정했다(21 조각 · 조각마다 숨긴 확인 단어 10 — 18 조각 178/180 일치 · 3 조각(02 · 18 · 21)은 확인 단어를 "같은말:자기 자신" 으로 표시해 점수 없음 · 남김 비율은 다른 조각과 같음 · 빠진 단어 13). 결과: **남김 4,621**(세트: etc 1,515 · object 881 · character 543 · action 488 · place 278 · food 255 · job 232 · nature 204 · animal 111 · proverb 77 · vehicle 37 / diff 1:399 · 2:2,251 · 3:1,971 / g 3:93 · 2:1,774 · 1:2,754) · 뺌 1,197(낯섦 916 · 같은말 87 · 논란 66 · 조각 53 · 상표 47 · 비속 28). 찬종 결정(2026-11-10 submit): **전부 넣는다 · g 태그는 보관만**(추첨에 아직 안 씀 — 나중에 거를 수 있게) · **실존 연예인·선수는 2026 년에도 누구나 아는 사람만** · 검증은 **VERIFY 표본 300**.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-2 그대로. 번호(확인): 07 **DG-089** · 13 **C121** · **CV-178 줄 끝** · README G · 05 Track D · 06 · 18 §9 · §12 "★ G051 실측" 한 줄씩. DB 없음. 하위 에이전트 0 · 웹 0.
■ 동시 라운드: 없음(찬종은 테스트 2 중일 수 있음 — 파일만).

■ 먼저 읽기: `web-desk/README.md` · `web-desk/catch2/지시서.md`(웹이 받은 기준 · 칸 뜻 — keep · set · diff · g · var · why) · `web-desk/catch2/_merged.json`(설계가 21 조각을 합친 것 — 확인 단어 뺌 · 항목 `{w, keep, set, diff, g, var, why, chunk}` 5,818) · docs/18 §12(캐치 단어 기준 개정 줄 · 칸 표) · §9(변형 규칙 · 유일성) · `ai-out/V046.txt`(3절 fix 2) · `scripts/g048-build.mjs`(세트 조립 꼴 · id 매기기) · `scripts/topics-check.mjs`(ITEM_OK · 캐치 세트 수 상한) · `scripts/g044-topics-cross.mjs`(세트 사이 겹침).

■ 할 일
A. **준비**: 번호 · topics-check 막힘 0(세트 62) · _merged.json 수(keep 4,621)가 맞는지.
B. **지하철 fix 2**: metro-line4-035 과천정보타운 remove · metro-gyeongui-jungang-017 한국항공대 변형 "항공대" → `applied: "G051"` · appliedRound · **두 세트 status verified** · topics-check. 커밋 1.
C. **캐치 2차 합치기**(`scripts/g051-catch2.mjs`):
   - 넣는 것 = keep 전부. 단 **실존 연예인 · 운동선수 · 방송인**(주로 set draw-character)은 GEN 이 이름 목록을 한 번 읽어 **2026 년 20~40대가 세대 불문 아는 사람만**(강호동 · 유재석 · 원빈 · 아이유 · 박지성급 — 2000 년대 한때 유명인 · 은퇴 선수 · 조연 배우는 뺌 · 위인 · 역사 인물 · 캐릭터 · 역할 낱말(할머니 · 자객)은 전부 유지). 뺀 이름은 `audit/g051-celeb-drop.json` 에 전부.
   - GEN 재독은 **논란 · 비속 · 단어 아님 · 기존 항목과 완전히 같은 말**만 더 거른다(낯섦 · 그리기 어려움 · 밋밋함으로는 빼지 않는다 — 찬종 결정). 웹이 `같은말:<기존>` 으로 뺀 87 은 기존 항목의 변형으로 더한다(유일성 통과하는 것만).
   - 항목 칸: name · variants(웹 `var` — 다른 항목 name·변형과 겹치면 뺌) · `diff` · **`g`**(1 밋밋 · 2 무난 · 3 재미 — 새 칸 · topics-check ITEM_OK 에 · 기존 1,639 항목에는 넣지 않는다(없음 = 판정 안 함)) · `createdRound: "G051"` · `sources`/tags 는 G048 꼴 · id 는 세트 안 이어서.
   - **`draw-etc` 1,515 는 세트 이름이 힌트([주제] 버튼)로 쓰이므로 "기타" 로 두지 않는다** → 새 세트 3~5 로 나눔(GEN 이 훑어 정함 — 예: `draw-concept` 개념·상태 · `draw-title` 영화·드라마·노래 제목 · `draw-world` 나라·도시·명소 · `draw-body` 몸·건강 · 남는 것은 가장 가까운 기존 세트로). 세트 이름은 플레이어가 힌트로 봤을 때 뜻이 통하는 말.
   - 세트 수 상한: 캐치 세트 40~400 검사는 **상한을 없애거나 2,000 으로**(사물이 1,270 쯤 된다 — GEN 판단 기록). 세트 **사이** 같은 이름 · 변형 0(g044-topics-cross) · 세트 안 유일성.
   - 늘어난 세트는 **status candidate**(기존 항목은 그대로 두되 세트 단위 status 라 세트가 candidate 가 된다 — ★ 그러면 V047 전에 메뉴 1 을 돌릴 때 캐치 세트가 빠지는지 `topics-load` dry-run 으로 확인하고, **빠진다면 새 항목을 별도 파일 `draw-*-2.json`(같은 nameKo · candidate)로 두어 기존 verified 10 세트가 그대로 적재되게** 한다 — 어느 쪽으로 했는지 보고서 맨 위에).
   - 전후 표: 세트별 수 · diff 분포 · g 분포. 커밋 2~3.
D. **문서 · 보고서**: 07 DG-089 · 13 C121 · CV-178 줄 끝 · 18 §9(지하철 13 verified) · §12 실측(수 · `g` 칸 뜻 · 새 세트) · 05 · 06 · README G · `ai-out/G051.txt`(0 ★ 찬종이 볼 것: ① 지금 메뉴 1 을 돌리면 들어가는 것(지하철 13 · 캐치 기존 1,639 가 그대로인지) ② 캐치 2차 세트 표(수 · diff · g · 예 5) · 새 세트 이름 ③ 뺀 연예인 수 · 남긴 사람 전부 ④ GEN 재독으로 뺀 것 전부 ⑤ V047 뒤 캐치 단어 합계 · 1 원칙 7 · 2 결정 필요).
■ 산출물: metro 2 세트 · draw-* (또는 draw-*-2) · 새 세트 · scripts/g051-catch2.mjs · topics-check.mjs · audit/g051-* · 문서 · ai-out/G051.txt.
■ 하지 말 것: g 로 거르기 · "그리기 어렵다" 로 빼기 · 웹 판정을 조각으로 다시 돌리기 · 기존 1,639 항목 고치기(변형 더하기만) · 라이어 세트 · 코드(server · web · shared) · topics-load.mjs · web-desk 파일 고치기 · 13 A · CV-179 · 20.
■ 확인할 것 (원칙 7): _merged.json 수 · 웹 `set` 값이 11 가지뿐인지 · var 가 상위어를 넣은 것은 없는지(표본 50) · topics-load 가 모르는 항목 칸 `g` 를 무시하는지 · 세트 status candidate 일 때 적재 동작 · 13 마지막 C · 07 맨 위 · README G 마지막 G050.
■ 커밋: 단계마다 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 이어서 없음 — 터미널 마지막 줄 "G051 끝 — ★ 찬종: VERIFY 창 `ai-out/briefs/verify.md 읽고 진행`(V047 표본 300) · 메뉴 1 은 지금 돌려도 됨(지하철 13) · /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.

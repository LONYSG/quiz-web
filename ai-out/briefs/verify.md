[VERIFY V044 — ★ **라이어 · 캐치마인드 제시어 2차 적정성**(G044 가 만든 open 세트 **8** — 사물 · 탈것 · 영화·드라마 · 캐릭터 · 과일·채소 · 간식·음료 · 속담 · 사자성어 ≈ 550 항목 · 출처 대조가 아니라 **"모두가 아는가 · 한마디로 설명되나(liar) · 그릴 수 있나(draw) · 겹침·상하위 · 변형"** 전수) + **태그 정리 확인**(G044 가 끈 closed 세트 liar/draw — 남은 것 표본) → 세트마다 verify 칸 + status(verified / candidate+fixes) · C112 · CV-174~175 · Sonnet · 40~60분 · V043 과 같은 창에서 이어서 · ★ **G044 가 끝나 있어야 시작**(README G 표 · ai-out/G044.txt — 없으면 10분마다 확인 · 최대 1시간 · 그래도 없으면 "V044 대기" 한 줄로 멈춤)]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 찬종 2026-11-09 새벽 — 라이어·캐치마인드 주제가 6개뿐이고 closed 세트의 어색한 키워드(종로3가 · 소양강 · 룻기)가 섞인다 → G044 가 open 8 을 더하고 closed 태그를 정리했다. **10시간 뒤 친구들 테스트** — 이 라운드가 verified 로 바꿔야 아침 메뉴 1 에 들어간다. open 세트는 출처 목록이 없으므로 V039 때처럼 **항목 전수 검토**(§9 open 기준) 다.
실행 모델: Sonnet 5.5 (V043 과 같은 창)

■ 고정 규칙: docs/16 5-3 그대로 + 예외(V039 꼴): 새 8 파일의 **`verify` 칸과 `status`** · closed 세트는 **verify 칸에 `tagAudit` 메모만**(status 그대로). 13 **C112** · **CV-174**(fixes → 아침 G046) · **CV-175**(제시어 규칙 후보 — 세트 균등 추첨 가중 · 캐릭터/작품 인지도 기준) · README V · 05 · 06. 조각 `audit/v044-raw/`. DB 없음 · 웹 ≤ 10(인지도 의심 항목만).
■ 동시 라운드 — MAIN R086(파일 읽기) · GEN G045(questions pending — topics 안 건드림). V043 의 verify 쓰기는 이미 끝났다(같은 창 · 앞 라운드). 문서 분담: V044 = 13 C112 · CV-174~175 · README V · topics 새 8 verify/status + closed tagAudit.

■ 먼저 읽기: `ai-out/G044.txt`(0절 ①②③ · 2절 결정 필요 — 나라 ≤40 · 수도 ≤20 · 포켓몬 ≤50 목록) · docs/18 §9(open 기준 · ★ 제시어 풀 원칙 줄) · `ai-out/V039.txt` 0절 ⑤(open 판정 꼴 — 상하위 · 1글자 · 태그) · `audit/g044-cross.json`(세트 사이 겹침 결과) · `audit/g044-tags.json`(태그 전후) · 새 8 파일 전부.

■ 판정 틀(새 8 · 항목마다 — 조각 sonnet 세트당 1 · 동시 2 · 첫 세트(과일·채소 — 뻔한 것)는 VERIFY 가 전부 읽고 기준 맞춤)
 (1) **모두가 아는 구체 명사인가**(20~40대 한국인 기준 · 아니면 fix remove) · 1글자 X · 상하위 X(사과 ↔ 홍옥) · 세트 사이 겹침 0(cross.json + 눈) · 같은 세트 안 canon 겹침 0(topics-check).
 (2) **liar 설명 가능성**(liar true 항목): 한마디로 돌려 설명할 거리가 있나 · 너무 좁거나(상표 하나뿐) 너무 넓은(사물 "물건") 것 → liar false 제안.
 (3) **draw 가능성**(draw true 항목): 그림으로 60초 안에 맞힐 수 있나(추상 X — 속담은 장면이 있는 것만 · 영화 제목은 장면/사물로 그릴 수 있는 것만) → draw false 제안.
 (4) **변형**(캐치마인드 채팅 판정 = 변형이 정답 범위): 흔한 표기 빠짐(띄어쓰기 — 정규화가 받는지 먼저 · 영문 작품명 · 약칭 "해리포터" ↔ "해리 포터") · 넓은 말 · 다른 항목과 겹치는 변형 → fixes.
 (5) **status**: 문제 항목 ≤ 3(fixes 로 적음) → **verified** · 그 이상 → candidate + fixes(G046) · 세트 자체가 기준에 안 맞으면(사자성어가 그릴 것이 너무 적음 등) rejected + why.
■ 태그 정리 확인(closed): `audit/g044-tags.json` 전후 표 ↔ 파일 실측 일치 · 남은 liar 항목(나라 ≤40 · 수도 ≤20 · 대통령 · 조선 왕 · KBO · 디즈니 · 지브리 · MCU · 올림픽 · 태양계 행성 8) **전부 눈으로**(≈200 — "한마디로 설명 가능" 아니면 메모) · 남은 draw(포켓몬 ≤50 · 디즈니 · 올림픽 · 지브리) 전부 → `verify.tagAudit`(round V044 · 어색한 것 목록) · status 그대로.
■ 할 일: A 준비(G044 끝 확인 · 새 8 · 항목 수 · topics-check 막힘 0 · 13 마지막(C111 → **C112** · CV-173 → **CV-174~**) · README V 마지막 V043) · B 조각 → 재독(fix 전부 + 세트마다 ok 10) → `audit/v044-topics.json`(커밋 1) · C 파일 쓰기 한 번에(새 8 verify/status · closed tagAudit) → topics-check 막힘 0(커밋 2) · D 13 C112 · CV-174 · CV-175 · README V · 05 · 06 · `ai-out/V044.txt`(0 ★: ① 새 8 verdict 표(항목 · 뺄 것 · liar/draw 끌 것 · 변형) → "**아침 메뉴 1 때 들어가는 open 세트 n · 라이어 주제 n · 캐치마인드 주제 n**" ② 예 — 뺀 것 5 · 태그 끈 것 5 ③ closed 남은 태그 어색한 것 수 · 1~7절)(커밋 3).
■ 하지 말 것: items 고치기(제안만) · 기존 open 6 다시 판정(V039 · V043 끝) · closed 세트 status · 코드 · 18 · 13 A · C110 · C111 · CV-172~173 · README G · R.
■ 커밋: 위 파일만 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): G044 끝(G044.txt · README G) · 새 8 파일 · 항목 ≈550 · 태그 전후 표 · 13 마지막 · README V 마지막 V043 · MAIN R086 돎.
■ ★ 이어서: 끝나면 멈춘다(verify-next2.md 없음). 터미널 마지막 줄 "V044 끝 — 다음 브리핑 대기 · /clear 가능".
■ 답변: 한국어 · 터미널 5줄 이내.

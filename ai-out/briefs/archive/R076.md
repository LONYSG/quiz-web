[MAIN R076 — **작은 라운드**(16 5-1 · 코드 파일 ≤3 · 마이그레이션 없음): 찬종 2026-11-06 오후 "**사무실 모드 좀 이상해. 문제 부분이 위아래로 미친듯이 흔들려. 문제가 고정이 안되어있음. 시간 줄어드는 막대때문에 문제 발생하는건가 싶기도 하고.**" → 재현(rAF 로 문제 카드 top 샘플링) → 원인 → 고침 → 모든 테마 × 상태에서 카드 흔들림 0 검사 · D-326 · A103 에 한 줄 · 10 56절]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: R075 빌드(34774734)를 메뉴 1 로 올린 뒤 찬종이 사무실 모드로 한 판 — 문제 카드가 세로로 계속 떨린다. 파스텔·밤에서는 그런 말 없음(확인 대상). PC 인지 폰인지 안 적음 → **둘 다 잰다**(PC 1280 · 1536×730 / m360 · m390 — 찬종 노트북은 FHD 125% = lap2).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (07 **D-326** · 13 A103 줄에 "사무실 흔들림" 한 줄 추가(새 A 없음) · 10 **56절** · R076.txt · 그림 `docs/design/r076/`). **실 DB 쓰기 없음 · 실 3000 서버 재시작 없음 · 마이그레이션 없음**(빌드만 — 적용은 찬종 메뉴 1). 작은 라운드 끝 점검 = typecheck · vitest · build · ui-check r076(새 검사) + r075(theme · emoji · mobile-motion) + main-behavior(R040 C-4 · 문제 카드 줄).
■ ★★ 동시 라운드 — GEN G032 가 돌고 있을 수 있다(`tmp/g032/` · `audit/g032-*` 손대지 않음 · add 하지 않음). 05 · 06 · 07 · 10 · 13 은 쓰기 직전 fetch → rebase --autostash → 내 파일만 add → push. 찬종에게 묻지 않는다.
■ 토큰: 작은 라운드 — 한두 시간. 메모리 1.5GB 아래면 ui-check 크기 둘(lap2 · m360)만.

■ 먼저 읽기
- `client/src/QuestionText.tsx` 전체 — **measure() → `--q-px` · `data-wrap` 을 DOM 에 쓰고 `setFit` → `ResizeObserver(measure)` 가 박스 크기 변화를 받아 다시 measure** (R039 재측정 구조 · narrowPx · k). `client/src/Question.tsx` 95~105(100ms 마다 setTick → 다시 그림) · 245(`<QuestionText text=…>`) · 213(`.question-card.urgent`) · 236~250(`.q-timer` · `.q-timebar-fill` scaleX · transition 120ms).
- `styles.css` 880~1000(`.question-card` · `.q-text` 930 · 1887(`animation: q-in 380ms` — translateY(10px)) · `.q-text.small` · `.q-timer.urgent` pulse · `.q-timebar-fill` transition) · **8879~8965 `[data-theme='office']`**(`--font` = Consolas · Cascadia Mono · D2Coding · **Malgun Gothic** 폴백 — 한글은 맑은 고딕 · 숫자·영문은 Consolas = 글꼴 둘 섞임 · `*` 에 animation-duration 1ms · iteration 1 · transition-duration 1ms !important · `--ease-pop: linear`) · 9209~9250(R075 kb-fit — 모바일 판 중 `.room.kb-fit` · `--vvh` · `--vvt`) · `.q-hints` min-height(R075 §C ② 힌트 줄 자리 미리).
- `client/src/Lobby.tsx` 205~245(R075 kb-open — visualViewport resize 마다 `--vvh` · `--vvt` 씀) · 555~600(R040 fit — `--qs` · fit 의존 배열 8).
- `ai-out/R075.txt` §B · §C · 3절(어떤 검사가 사무실 게임 화면을 찍었는지 — 정지 그림만이라 흔들림을 못 봤다) · docs/07 D-322 2판 · D-325.

■ 설계 추정(코드 읽기 — 확인 대상 · 맞으면 그대로 · 아니면 측정이 가리키는 것):
- **유력 ①: QuestionText 재측정 되먹임 고리.** measure 가 `--q-px` 와 `data-wrap` 을 바꾸면 박스 높이가 바뀌고 → ResizeObserver 가 다시 measure → 사무실 글꼴(고정폭 + 맑은 고딕 섞임 · 글자 폭이 파스텔 Pretendard 와 다름)에서는 "줄바꿈 1 ↔ 0" 또는 px 두 값 사이를 왕복해 수렴하지 않는다 → 카드 높이가 매 프레임 바뀜 = "위아래로 미친듯이". 100ms setTick 재렌더가 고리를 계속 되살릴 수도 있다. 파스텔은 한 번에 수렴하므로 안 보였다. 판정법: office 게임 화면에서 `MutationObserver` 로 `.q-text` 의 `style`(--q-px) · `data-wrap` 변화 횟수를 3초 동안 세고, `ResizeObserver` 콜백 횟수를 센다 — 수십 번 이상이면 ①.
- ②: `.q-text { animation: q-in }`(translateY 10px) 가 office 의 1ms 규칙 아래서 **다시 시작**되는 경우(요소가 다시 만들어지거나 class 가 바뀔 때) — 10px 씩 튐. ③: 모바일 kb-open 의 `--vvh/--vvt` 갱신(visualViewport resize 가 PC 에서도 확대/스크롤바로 올 수 있음) · ④: 시간 막대(찬종 추정) — `scaleX` 가로 변형만이라 세로 흔들림과 무관할 것(측정으로 닫는다: 막대를 display none 으로 가린 채 재면 흔들림이 남는지).

■ 할 일 (순서대로 · 단계마다 커밋)
A. **재현 · 측정**(`ui-check` r076 `card-jitter` 신설 · 고치기 전 빌드로 먼저): 테마 셋(pastel · night · office) × 화면(PC lap2 1536×730 · 1280×720 · m360 · m390 터치) × 상태(문제 중 0~3초 · 힌트 공개 뒤 · 초성 뒤 · 마지막 5초 urgent · 공개). 각 조합에서 **3초 동안 requestAnimationFrame 마다** `.question-card` 와 `.q-text` 의 `getBoundingClientRect()` top · height, `.q-text` style/data-wrap 변화 수, ResizeObserver 콜백 수를 기록 → 표(조합 × "top 변화 횟수 · 최대 진폭 px · height 변화 횟수 · 재측정 횟수"). office 에서만 수십 번이면 ①. 막대 숨김 변형(`.q-timebar{display:none}` 주입)도 한 번 → ④ 닫기. 그림 r076/jitter-office-{lap2,m360}-{t0,t1,t2}.png(연속 3장 — 흔들림이 보이게).
B. **고침**(측정이 가리킨 것만 · 되돌리기 쉽게): ① 이면 — measure 를 **수렴 보장**으로: (가) 같은 입력(text · 박스 폭)에 대해 한 번만 재고 결과를 기억(폭이 바뀔 때만 다시 — ResizeObserver 는 **폭** 변화만 트리거 · 높이 변화는 무시) (나) 왕복 감지(직전 결과와 같은 값으로 돌아오면 멈추고 둘 중 작은 px 로 고정) (다) 측정 중 `data-wrap` 을 DOM 에 쓰기 전에 폭을 재는 순서 점검. 파스텔·밤의 결과(px · wrap)는 **바뀌지 않아야 한다**(R039 긴 문장 잘림 검사 · R040 C-4 그대로 통과). ② 이면 office 블록에서 `.q-text` animation none. ③ 이면 kb-open 갱신을 모바일 + 입력창 포커스 때만. ④ 는 아닐 것.
C. 끝 점검: A 의 표 **후** — 모든 조합 top 변화 0(문제 바뀜 · 힌트 열림 순간 제외) · height 변화 0 · 재측정 ≤ 2 · r075 theme/emoji/mobile-motion 그대로 · main-behavior 326/326 · typecheck · vitest · build.
D. 문서: 07 **D-326**(원인 · 고침 · 되돌리는 법 · 왜 R075 검사가 못 잡았나 = 정지 그림만) · 10 56절(card-jitter 검사) · 13 A103 줄에 "사무실 모드 문제 카드 흔들림 없음" 한 줄 · 05 · 06.
■ 산출물: `ai-out/R076.txt`(0절: 측정 표 전/후 · 원인 한 줄 · 고친 파일 · 찬종이 볼 것 = 메뉴 1 → 사무실 모드 한 판) · 코드(≤3 파일 — QuestionText.tsx · styles.css · ui-check) · 그림 · 문서.
■ 하지 말 것: 실 DB · 실 서버 재시작 · 마이그레이션 · 측정 없이 고치기 · 파스텔·밤의 글자 크기 결과 바꾸기 · R075 kb-fit · 팔레트 · 문구 손대기 · GEN 파일 add · 찬종에게 묻기.
■ 커밋: 위 파일만 · A · B · C·D · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): QuestionText ResizeObserver(measure) 구조 · Question.tsx 100ms setTick · office `--font` 폴백 Malgun Gothic · `*` 1ms 규칙 · 07 마지막 D-325 · 10 마지막 55절 · 13 A103 있음 · 실 서버 상태(찬종이 메뉴 1 로 켰을 수 있음 — 재시작하지 않는다 · 검사는 3101~).
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄 "R076 끝 — 다음 브리핑 대기 · /clear 가능". 적용은 찬종 메뉴 1.
■ 답변: 한국어 · 터미널 5줄 이내.

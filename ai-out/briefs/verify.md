[VERIFY V048 — ★ **라이어 제시어 2차 전수 판정**(G053 `liar-*-2.json` 15 파일 ≈590 항목 · fool ≈1,770 — V044 와 같은 꼴 · **fool 거리**가 중심) · C125 · CV-181~182 · ★ **G053 이 끝난 뒤** · 1~2시간]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 라이어 제시어를 주제마다 40 씩 늘렸다(찬종의 웹 Claude 계정 Sonnet 이 생성 → G053 이 파일로). 바보형(라이어에게 fool 을 진짜처럼 줌)은 찬종이 남기기로 했고, fool 이 너무 가까우면 라이어가 바로 눈치채고 너무 멀면 첫 한마디에 들킨다 — 그래서 fool 은 전수로 본다. V044(같은 일 · 851 항목)에서 배운 것: **tooClose 는 "같은 종류" 가 아니라 "받고 설명을 들으면 정답이 하나로 좁혀지는 것"**(1:1 짝 · 아종/동의어 · 같은 작품 · 고정 라이벌 · 시리즈 속편 · 상위/하위) — 1차 조각이 25~40% 를 찍어 재판정했다. 이번에는 처음부터 이 기준으로(목표가 아니라 참고: V044 최종 tooClose ≈7%).
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-3 그대로 + 예외: `liar-*-2.json` 의 **`verify` 칸 · `status`** 만(items 불변 · topics-check 막힘 0). 13 **C125** · **CV-181**(fixes 묶음 → G054) · **CV-182**(규칙 후보 · 웹 생성 품질 소견) · README V · 05 · 06. 조각 `audit/v048-raw/`. DB 없음 · 웹 ≤ 5(논란 인물 확인만) · 하위 에이전트 ≤ 5(sonnet · 주제 3 개씩 · 지시서 한 파일에 위 tooClose 기준 + V044 의 좋은 예 · 나쁜 예).
■ 먼저 읽기: `ai-out/G053.txt`(④ 인물 목록) · `ai-out/V044.txt`(2 · 6 · 7 절) · `ai-out/briefs/archive/V044.md`(판정 꼴 · verify 칸 · fixes op) · docs/18 §12(칸 표 · fool 기준 다듬기 2026-11-10 · 인물 기준 — 분쟁 · 사생활은 유지 · 범죄 · 사건은 뺌) · `web-desk/liar2/지시서.md`.
■ 할 일
A. **전수**: 항목마다 ① 보편성(20~40대 대부분이 아나 · 낯설면 remove) ② 게임성(한마디로 돌려 설명할 거리 · 너무 넓음/좁음) ③ **fool 3 개 하나하나 ok / tooClose / tooFar / bad(낯선 단어 · 없어진 것)** + 대안 `to`(같은 sub · 없으면 null) ④ era · diff · sub · 변형 ⑤ 인물 논란(G053 ④ 목록은 전부 — 사실 확인이 필요하면 웹 · 판단은 "범죄 · 사건으로 처벌 = remove 제안 / 분쟁 · 의혹 · 사생활 = unsure 로 유지 표시").
B. **기존 세트와의 관계**: 같은 주제 기존 파일(`liar-<주제>.json`)과 뜻이 같은 단어 · 사실상 같은 설명이 나올 단어(예: 기존 "경찰관" ↔ 새 "형사" 는 다름 · "택배 기사" ↔ "택배원" 은 같음)는 remove 제안.
C. verdict: 세트마다 verify 칸(V044 꼴 — counts · fixes(op fool / remove / diff / era / sub / variant) · unsure) · status 는 문제 항목 3 이하면 verified · 넘으면 candidate+fixes(대부분 이쪽일 것 — G054 가 적용).
D. 문서 · `ai-out/V048.txt`(0 ★ 찬종이 볼 것: ① 세트 표 ② tooClose 예 10 · tooFar 예 5 ③ 뺀 것 ④ 인물 소견 ⑤ **웹(Sonnet) 생성 품질 한 줄 — V044 때 Opus GEN 생성분과 비교**(fool 교체율) · 7 자기 점검).
■ 하지 말 것: items 고치기 · 기존 15 파일 다시 판정 · 캐치 · 코드 · 13 A · C124 · README G · R.
■ 확인할 것 (원칙 7): G053 끝났는지(ai-out/G053.txt — 없으면 멈춤) · 파일 15 · 항목 수 · 13 마지막 C · CV 번호(CV-180 다음) · topics-check 막힘 0.
■ 커밋: 2~3 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "V048 끝 — /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.

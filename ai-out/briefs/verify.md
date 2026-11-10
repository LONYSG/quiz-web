[VERIFY V049 — ★ **라이어 새 주제 5 전수 판정**(G055 `liar-holiday · school · drinking · cafe · streetfood` ≈180 항목 · fool ≈540 — V048 과 같은 꼴 · **fool 거리**가 중심) · C128 · CV-183~184 · ★ **G055 가 끝난 뒤** · 40분~1시간]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 라이어에 새 주제 5(명절 · 학창 시절 · 술자리 · 카페 메뉴 · 길거리 간식)를 넣는다(찬종의 웹 Claude 계정 Sonnet 이 생성 → G055 가 파일로). 찬종 기준은 **보편성**(2026-11-10 "라이어 키워드는 보편성이 중요") — 팬 주제는 이미 버렸고, 이 5 주제 안에서도 20~40대 대부분이 아는 단어만 남긴다. fool 은 V044 · V048 과 같은 기준: **tooClose = "받고 설명을 들으면 정답이 하나로 좁혀지는 것"**(1:1 짝 · 동의어 · 상위/하위 · 맛만 다른 같은 것) · tooFar = 첫 한마디에 들킴 · bad = 낯선 단어(참고: V048 교체율 5.5%).
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-3 그대로 + 예외: 새 5 파일의 **`verify` 칸 · `status`** 만(items 불변 · topics-check 막힘 0). 13 **C128** · **CV-183**(fixes 묶음 → G056) · **CV-184**(규칙 후보 · 새 주제 소견) · README V · 05 · 06. 조각 `audit/v049-raw/`. DB 없음 · 웹 0 · 하위 에이전트 ≤ 2(sonnet · 지시서 한 파일에 tooClose 기준 + V048 의 좋은 예 · 나쁜 예) — 양이 적으니 혼자 해도 됨.
■ 먼저 읽기: `ai-out/G055.txt` · `ai-out/V048.txt`(2 · 6 · 7 절) · `ai-out/briefs/archive/V048.md`(판정 꼴 · verify 칸 · fixes op) · docs/18 §12 · `web-desk/liar3/지시서.md`.
■ 할 일
A. **전수**: 항목마다 ① 보편성(낯설면 remove) ② 게임성 — **"설명하기 어렵다 · 추상적이다" 는 remove 사유가 아니다**(diff 3 제안까지만 · 20 §19) · 같은 세트 안에서 사실상 같은 설명이 나오는 두 단어는 하나 remove 제안 ③ **fool 3 개 하나하나 ok / tooClose / tooFar / bad** + 대안 `to`(같은 sub · 없으면 null) ④ era · diff · sub · 변형.
B. **다른 주제와 같은 단어**(송편 · 노래방 · 티라미수 등 36 — 18 §12 ⓔ 허용)는 remove 하지 않는다. 다만 그 단어의 fool 이 이 주제 안의 단어인지(명절의 송편 → fool 이 명절 음식인지)만 본다.
C. verdict: 세트마다 verify 칸(V048 꼴 — counts · fixes · unsure) · status 는 문제 항목 3 이하면 verified · 넘으면 candidate+fixes(G056 이 적용).
D. 문서 · `ai-out/V049.txt`(0 ★ 찬종이 볼 것: ① 세트 표 ② tooClose 예 5 · tooFar 예 3 ③ 뺀 것 ④ **주제마다 한 줄 소견 — 이 주제가 라이어 한 판으로 재미있겠나**(약하면 약하다고) · 7 자기 점검).
■ 하지 말 것: items 고치기 · 기존 15 파일 다시 판정 · 캐치 · 코드 · 13 A · C127 · README G · R.
■ 확인할 것 (원칙 7): G055 끝났는지(ai-out/G055.txt — 없으면 멈춤) · 파일 5 · 항목 수 · 13 마지막 C · CV 번호(CV-182 다음) · topics-check 막힘 0.
■ 커밋: 2 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "V049 끝 — /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.

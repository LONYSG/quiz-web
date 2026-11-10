[GEN G052 — 작은 데이터 고침 셋 — ① 캐치 2차 V047 fixes 중 **토르소 · 하정우 remove 만**(설계 결정) ② 시·군·구 **"광주" = 광역시 쪽 정답**(찬종 2026-11-10) ③ 겹치는 이름 scope 문장에서 정답 예시 줄이기 · 파일만 · DB 없음 · DG-090 · C123 · 15~20분]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V047(13 CV-180)이 캐치 2차 표본에서 낯선 단어 1(토르소)과 연예인 remove 제안 4 · 주의 6 을 냈다. 설계 결정: **하정우(프로포폴 벌금 — 처벌받은 사건)만 remove** · 김병만 · 박세리 · 기성용은 분쟁 · 의혹 수준이라 **유지**(라이어 때 찬종 기준과 같게 — 18 §12 fool 기준 줄) · 주의 6 유지. 찬종(2026-11-10): 시·군·구에서 "광주" 만 치면 **광역시(전남광주통합특별시) 쪽 정답** — 보통 "광주" 는 전라도 광주를 뜻한다 · 경기 광주시는 "광주시" · "경기 광주" 로.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-2 그대로. 07 **DG-090** · 13 **C123** · **CV-180 줄 끝** · README G · 05 · 06 · 18 §9 · §12 한 줄씩. DB 없음 · 웹 0 · 하위 에이전트 0.
■ 동시 라운드: MAIN R090(코드)과 겹침 없음.
■ 먼저 읽기: `ai-out/V047.txt` · `ai-out/G049.txt` ⑤(광주) · draw-character-2 · draw-object-2 의 verify.fixes · kr-municipality.json(전남광주통합특별시 항목 · 경기 광주시 항목 변형) · topics-check.
■ 할 일
A. draw-object-2 토르소 · draw-character-2 하정우 remove(`applied: "G052"`) · 나머지 remove 제안 3 · 주의 6 은 `applied: "kept"` + `keptBy: "설계 2026-11-10"` · count · version · status verified 그대로.
B. kr-municipality: 전남광주통합특별시 항목 변형에 **"광주"** 추가 · 경기 광주시 항목은 name "광주시" 그대로 + 변형에 "경기 광주" · "경기도 광주시"(없으면) · bare "광주" 는 광역시 쪽에만(세트 안 유일성 통과 확인) · scope 문장은 그대로.
C. 겹치는 이름(서구 · 중구 …) 관련: scope 문장의 "서구 · 중구는 '부산 서구' 처럼" 은 **그대로 둔다**(세트 설명이라 스포가 아님 — 코드 안내 문구는 MAIN R090 이 고침). 확인만.
D. topics-check 막힘 0 · topics-load dry-run 끝 줄 · 문서 · `ai-out/G052.txt`(5줄 — 메뉴 1 때 캐치 단어 n · "광주" 전후).
■ 하지 말 것: 다른 항목 · 연예인 추가 삭제 · 코드 · web-desk · data/minigame/choice(다음 라운드) · 13 A · 20.
■ 커밋: 1~2 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "G052 끝 — /clear 해도 됨".
■ 답변: 한국어 · 터미널 3줄 이내.

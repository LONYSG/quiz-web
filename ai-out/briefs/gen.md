[GEN G056 — ★ **라이어 새 주제 4 확정**(V049 fixes 적용 → 명절 · 학창 시절 · 술자리 · 카페 메뉴 verified) + **길거리 간식 파일 삭제**(찬종 "주제를 버림") · 라이어 15 → **19 주제 ≈1,565** · 파일만 · DB 없음 · DG-094 · C129 · 20~30분 · 끝나면 메뉴 1 → 테스트 2]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V049(13 CV-183)가 새 주제 5 의 181 항목 · fool 543 을 전수 판정했다 — fool 교체 50(tooClose 48 · tooFar 2) · remove 0 · diff 5 · sub 1 · 변형 2 · cafe verified · 4 candidate. 찬종 결정(2026-11-10): **길거리 간식(liar-streetfood)은 버린다**(30 개뿐 · 대표 단어 빠짐 · 기존 음식 · 간식 주제와 겹침) — 보충하지 않고 파일을 지운다. 설계 결정: 나머지 4 세트의 **fixes 는 전부 적용**(다시 판정하지 않는다) · unsure 는 **전부 유지**(달집태우기 · 쥐불놀이 · 부럼 깨기 · 해장국/콩나물국밥/북엇국 · 먹태/노가리 … — "겹친다 · 설명 어렵다" 는 빼는 사유가 아님 · 20 §19).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-2 그대로. 07 **DG-094** · 13 **C129** · **CV-183 줄 끝** · README G · 05 · 06 · 18 §12 "★ G056 실측" 한 줄. DB 없음 · 웹 0 · 하위 에이전트 0.
■ 먼저 읽기: `ai-out/V049.txt` · 4 세트의 `verify.fixes` · `scripts/g054-liar2-apply.mjs`(fool 교체 · to null · applied 꼴) · topics-check(LIAR_NEW_G055 하한 28).
■ 할 일
A. 준비: 번호 · topics-check 막힘 0 · fixes 수가 V049 와 같은지(길거리 간식 몫은 뺀 수).
B. **적용**(`scripts/g056-liar3-apply.mjs` — g054 꼴) — holiday · school · drinking · cafe: fool `to` 교체 · `to: null` 은 그 fool 만 뺌(2 미만이 되면 GEN 이 같은 sub 의 아는 단어로 하나 — 전부 보고) · diff · sub · 변형(실내화 "실내화 주머니" · 먹태 "먹태깡" 뺌) · `applied: "G056"` · version +1 · **status verified**. 적용 뒤 세트 안 이름 · 변형 유일성 · fool 이 자기 이름 · 변형과 같은 것 0 · fool 2~3.
   ★ fool `to` 가 **길거리 간식에만 있던 단어**여도 그대로 쓴다(fool 은 세트 밖 단어여도 됨).
C. **`data/minigame/topics/liar-streetfood.json` 삭제** · topics-check 의 LIAR_NEW_G055 목록에서 뺌 · 다른 파일 · 문서 표가 이 세트를 가리키면 "뺌(찬종 2026-11-10)" 으로.
D. topics-check 막힘 0 · topics-load dry-run 끝 줄(세트 80 · 라이어 19 주제) · 문서 · `ai-out/G056.txt`(0 ★ 찬종이 볼 것: ① **메뉴 3 → 1 [1] 때 라이어 주제 19 · 단어 n**(새 4 주제별 수) ② fool 새로 쓴 것 전부 ③ 길거리 간식 삭제 확인 · 1 원칙 7 · 2 결정 필요).
■ 하지 말 것: fool 다시 판정 · unsure 빼기 · 새 단어 추가 · 길거리 간식 보충 · 기존 15 파일 · 캐치 · 코드 · web-desk · 13 A · CV-184 · 20.
■ 커밋: 2 · fetch → rebase --autostash → push(503 = VPN — 커밋만 해 두고 한 줄 보고) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "G056 끝 — ★ 찬종: 메뉴 3 → 1 [1](0034 · 0035 · 0036) → 테스트 2 · /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.

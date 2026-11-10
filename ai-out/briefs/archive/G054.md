[GEN G054 — ★ **라이어 2차 적용 + 기존 세트에 합치기** — V048 fixes 를 `liar-*-2.json` 15 파일에 적용 → **기존 `liar-*.json` 15 파일에 항목을 합치고 `-2` 파일 삭제** → 15 세트 verified · 라이어 849 → 약 1,414 · + 포켓몬 니드런 변형 · 파일만 · DB 없음 · DG-092 · C126 · 40분~1시간 · 끝나면 메뉴 1]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V048(13 CV-181)이 라이어 2차 570 항목 · fool 1,710 을 전수 판정했다 — fool 교체 94(tooClose 63 · tooFar 10 · bad 21) · remove 3 · dup 2 · diff 21 · era 2 · sub 9 · 변형 8 · verified 2(과일·채소 · 영화·드라마) · candidate 13. 설계 결정(2026-11-10): **remove 3 전부 적용**(기영이 = 낯섦 · **박태환**(도핑 자격정지) · **추신수**(음주운전 처벌) — "처벌받은 사건은 뺀다" 기준 · G053 의 하정우 · 마라도나와 같게) · dup 2 적용(쉐이커 · 여객기) · **unsure 인물은 전부 유지**(빅뱅 · 김건모 · 박효신 · 엑소 · 박세리 · 브래드 피트 · 타이거 우즈 · 김구라 · 저스틴 비버 · 홍명보 … — 분쟁 · 의혹 · 사생활 수준 · 18 §12) · 한철 유행 의심(어몽어스 · 탕후루 · 크로플)은 유지하되 era modern 확인.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-2 그대로. 07 **DG-092** · 13 **C126** · **CV-181 줄 끝** · README G · 05 · 06 · 18 §9 · §12 "★ G054 실측" 한 줄씩. DB 없음 · 웹 0 · 하위 에이전트 0.
■ 먼저 읽기: `ai-out/V048.txt` · `ai-out/G053.txt` · `ai-out/R090.txt`(0절 ② ⓒ 니드런 · ⑦ 같은 nameKo 세트는 주제 목록에서 한 줄) · `liar-*-2.json` 의 verify.fixes · `scripts/g049-topics-fix.mjs`(fool 교체 · to null · applied 꼴) · topics-check(라이어 세트 수 40~120 — 합치면 80~100 이라 상한 안 · 넘으면 150 으로).
■ 할 일
A. 준비: 번호 · topics-check 막힘 0 · fixes 수가 V048 과 같은지.
B. **적용**(`scripts/g054-liar2-apply.mjs` — g049 꼴): fool `to` 교체 · `to: null` 은 그 fool 만 뺌(2 미만이 되면 GEN 이 같은 sub 의 아는 단어로 하나 — 전부 보고) · remove 3 · dup 2 · diff · era · sub · 변형 · `applied: "G054"`.
C. **합치기**: 적용한 `-2` 항목을 같은 주제 기존 파일 `liar-<주제>.json` 의 items 뒤에 붙임(id 는 기존 번호 이어서 `liar-<주제>-NNN` · `createdRound: "G053"` 유지 · 옛 `-2` id → 새 id 표 `audit/g054-id-map.json`) · 기존 항목은 글자 그대로 · 기존 파일 verify 칸은 그대로 두고 `verify.history` 에 V048 요약 + `appliedRound: "G054"` 한 줄 · count · version +1 · **status verified** · **`-2` 15 파일 삭제**. 합친 뒤 세트 안 이름 · 변형 유일성 · fool 이 자기 이름 · 변형과 같은 것 0 · fool 2~3.
D. **포켓몬 니드런**(R090 ② ⓒ — 기호를 지우면 니드런♀ · 니드런♂ 가 같아져 "니드런" 만 치면 둘 다 오답): pokemon-gen1 의 두 항목에 변형 "니드런 암컷" · "니드런 암" / "니드런 수컷" · "니드런 수" 추가(세트 안 유일성 통과하는 것만).
E. topics-check 막힘 0 · topics-load dry-run 끝 줄 · 문서 · `ai-out/G054.txt`(0 ★ 찬종이 볼 것: ① **메뉴 3 → 1 [1] 때 라이어 주제 15 · 단어 n**(주제별 수) · 세트 수 ② fool 새로 쓴 것 전부 ③ 뺀 5 ④ 니드런 전후 · 1 원칙 7 · 2 결정 필요).
■ 하지 말 것: unsure 인물 빼기 · fool 다시 판정 · 새 단어 추가 · 캐치 세트 · 코드 · web-desk · 13 A · CV-182 · 20.
■ 커밋: 2~3 · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "G054 끝 — ★ 찬종: 메뉴 3 → 1 [1](0034 · 0035) → 테스트 2 · /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.

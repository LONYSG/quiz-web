[GEN G046 — ★ **주제 세트 변형 적용** — V043 fixes **add 171 · remove 1**(13 CV-172 · 콜론 부제 · 음차 두 꼴 · 산/강/역/앞 뺀 꼴 · 조선 왕 본명 · 롤 아포스트로피 뺀 꼴) + **구단 영문 약칭 7 허용**(CV-173 ② 설계 결정 — LG · KIA · SSG · NC · kt · QPR · DMC) (★ 2026-11-09 변경: G044 의 새 open 8 은 **V044 로 판정하지 않는다** — G047 이 씨앗으로 재편 · 이 라운드는 V043 만) · 파일만 · DB 쓰기 없음 · DG-084 · C114 · 1시간 · ★ **V044 가 끝난 뒤** 찬종이 "gen.md 읽고 진행" → 끝나면 메뉴 1]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V043(9b460c96)이 verified 30 세트 2,554 항목의 변형 누락을 전수로 봤다 — add 171 · remove 1(북한산 "북한산성") · 재독에서 9 뺌 · 정규화 실측: 띄어쓰기 · 대소문자 · 괄호 · 가운뎃점 · 숫자 앞 띄어쓰기는 이미 받고 **콜론 · 하이픈 · 아포스트로피 · 조사 · 시/구/역 붙은 꼴은 안 받는다**(그래서 '토르: 천둥의 신' 을 '토르 천둥의 신' 으로 치면 틀림). 테스트에서 "왜 정답 아냐" 가 날 세트 3 = mcu-film(37) · lol-champion(16) · seoul-subway-station(12). 설계 결정(13 CV-172 · CV-173 줄 끝 · 18 §9 "주제 세트 변형 규칙"): **전부 적용** · `latinAbbr` 7 도 허용(§9 라틴 예외에 "구단·기업 약칭 2~4글자" 추가) · conf mid 는 웹 확인 없이 받는다(표기 변형은 틀려도 "더 받는" 쪽이라 해가 작다 — 다른 항목과 겹치는 것만 기계로 막음). V044(새 open 8 적정성)가 끝났으면 그 fixes(항목 remove · liar/draw false · 변형)도 함께 → 새 8 의 status 는 **V044 가 이미 정했다**(G046 은 안 바꿈).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-2 그대로. 13 **C114**(C112 V044 · C113 은 보류 중 G045 몫 — 비어 있으면 그대로 비워 둠) · **CV-172 줄 끝** · **CV-174 줄 끝**(V044 있으면) · README G 표 · 05 Track D · 06 · 07 **DG-084** · 18 §9 "★ G046 실측" 한 줄. DB 없음. 하위 에이전트 0 · 웹 0.
■ 동시 라운드 — MAIN R086 이 돌고 있으면(topics 파일 읽기만) 겹침 없음 · VERIFY 는 끝났음. 문서 분담: G046 = 07 DG-084 · 13 C114 · CV-172 · CV-174 · 18 §9 한 줄 · 05 · 06 · README G.

■ 먼저 읽기: `ai-out/V043.txt`(0절 ①②③④ · 4절 재독에서 뺀 9 · latinAbbr 7 · unsure 는 넣지 않음) · `audit/v043-raw/v043-proposals.json`(세트별 add/remove/사유/conf) · 세트 파일의 `verify.fixes`(round V043) · `ai-out/V044.txt`(있으면 — 0절 ① verdict 표 · fixes) · docs/18 **§9**(★ 설계 2026-11-09 "주제 세트 변형 규칙" 줄 · 라틴 예외 — 구단 약칭) · `scripts/g039-topics-fix.mjs`(fixes 기계 적용 꼴 — variant · variant-remove · applied 표시) · `scripts/topics-check.mjs`(유일성 — 변형이 다른 항목 name·변형과 겹치면 막힘).

■ 할 일 (순서대로)
A. **준비**(커밋 없음): 13 마지막 · 07 맨 위 · README G 마지막(G044) · V044 끝났는지(README V · ai-out/V044.txt) · topics-check 막힘 0 · 세트 수(38 또는 39 — us-state + 새 8) · fixes 수(V043 171+1 · V044 n).
B. **적용**: `scripts/g046-topics-fix.mjs`(g039 꼴 재사용 — round V043 · V044 의 fixes 중 `applied` 없는 것 전부 · op variant / variant-remove / remove(V044 항목 제거) / 플래그(V044 liar·draw false) · `latinAbbr` 7 도 적용 · **유일성 검사에 걸리는 add 는 건너뛰고 목록에**(다른 항목과 겹침 — V043 unsure 와 같은 꼴) · `applied: "G046"` · version +1 · count 갱신) · dry-run → 전후 diff `audit/g046-topics-diff.json` → --apply · topics-check 막힘 0 · 경고 수 전후 · status 는 **안 바꿈**(verified 그대로 · 새 8 은 V044 값 그대로). 커밋 1.
C. **문서**: 07 DG-084(적용 수 · 건너뛴 것 · 구단 약칭 허용 · 되돌리기 = 커밋 1 revert) · 13 C114 · CV-172 줄 끝(적용 n · 건너뜀 n) · CV-174 줄 끝(V044 적용 n) · 18 §9 "★ G046 실측" 한 줄 · 05 · 06 · README G · `ai-out/G046.txt`(0 ★ 찬종이 볼 것: ① 세트별 적용 표(add · remove · 건너뜀) ② 건너뛴 것 전부(사유) ③ **다음 메뉴 1 때 — 주제 세트 n(verified) · 라이어 주제 n · 캐치마인드 주제 n**(`topics-load` dry-run 끝 줄) · 1 원칙 7 · 2 결정 필요 없음이면 "없음"). 커밋 2.
■ 산출물: topics 파일(변형 · 플래그) · `scripts/g046-topics-fix.mjs` · `audit/g046-topics-diff.json` · `ai-out/G046.txt` · 07 · 13 · 18 한 줄 · 05 · 06 · README G.
■ DB 쓰기: **없음**(적재는 찬종 메뉴 1).
■ 하지 말 것: V043 unsure · 재독에서 뺀 9 넣기 · status 바꾸기 · 새 항목 추가(V044 remove 만) · name 바꾸기 · 코드 · song · ox · questions · 13 A · C112 · C113 · CV-173 · CV-175 · README R · V.
■ 확인할 것 (원칙 7): add 171 · remove 1 · latinAbbr 7(LG · KIA · SSG · NC · kt · QPR · DMC) · 재독 뺀 9 가 fixes 에 없는지 · V044 보고서 유무 · 세트 수 · 13 마지막 · 07 맨 위 · README G 마지막 G044 · topics-check 막힘 0.
■ 커밋: 1~2 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ (V044 보고서가 없어도 정상 — 라이어 재판정은 G047 뒤.)
■ ★ 이어서: 보고서 · 커밋 · push 뒤 **`ai-out/briefs/gen-next.md`(G047 라이어 제시어 재탄생)를 읽고 같은 창에서 바로 시작**(없거나 첫 줄 "보류" 면 멈춤). 그 전 터미널 마지막 줄 "G046 끝 — ★ 찬종: 메뉴 1 [1] 돌리면 주제 n 들어감 · gen-next(G047) 이어서 · /clear 아직".
■ 답변: 한국어 · 터미널 5줄 이내.

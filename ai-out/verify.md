# VERIFY 세션 인수인계서 — 새 에이전트(설계·지시 담당)에게

> 작성: VERIFY 세션 · 2026-10-13 (2차 개정 — `gen.md` · `main.md` 와 대조해 겹침을 줄이고 틀린 곳·빠진 곳을 고쳤다)
> VERIFY 의 마지막 라운드: **V004** (R030 심화 713건 판정, 결과는 R031 에서 GEN 이 반영). 그 뒤로 VERIFY 라운드는 없었다.
> ★ 사용자 이름이 **건우 → 찬종** 으로 바뀌었다. 기존 문서·보고서의 "건우" 는 같은 사람이다. 과거 기록은 고치지 않는다(append-only).
> ★ 세 문서를 함께 본다: **`verify.md`(이 문서 — VERIFY 의 역할·기준·방식)** · [`gen.md`](gen.md)(GEN 의 역할·도구·생성 흐름) · [`main.md`](main.md)(MAIN 의 역할·코드·테스트).
>   GEN 의 도구·생성 흐름은 `gen.md` 가 정본이라 여기서는 **VERIFY 와 맞닿는 부분만** 적었다(8절).

---

## 0. 한 줄 요약과 지금 바로 할 일

- VERIFY 는 **GEN 이 만든 문제 데이터를 독립적으로 판정**하는 세션이다(사실 · 힌트 · 중복 · 2회차 짝 · 노출 · 깊이). **판정만 하고, 결과는 파일로만 쓴다.** 고칠 것은 "고칠 문구 제안"까지이고, 반영·적재는 GEN 이 한다.
- **지금 걸린 일 = V005 (13-PENDING C60).** 입력 `data/pipeline/audit/r047-verify-targets.json`
  - `media` **200** — R047 미디어 정리본, **아직 적재 안 됨** (대중 60 · 팬 세부 140 · 장르 8개 × 25 · 바뀐 것 단서 44 / 읽기 81 / 새로 10 / 그대로 65 · 힌트 138, 그중 **지식 근거 37**)
  - `midHints.targets` **1,328** — R036 에 만든 난이도 3 이상 일반 힌트, **이미 적재됨** (원래 목록 `r036-verify-targets.json`)
- **그 다음 VERIFY 몫 = C55** — R032 에 GEN 이 고친 기존 활성 문항 63 (`data/pipeline/audit/r032-fixes.json`). C60 에 합쳐지지 않았고 아직 아무도 판정하지 않았다.
- 구 에이전트의 마지막 계획: R047.txt 와 C60 파일을 VERIFY 에게 주고 판정시킨다 → GEN 이 반영 + 미디어 200 적재 (`gen.md` 0장과 같다).
- ★ 제안: **V005 를 둘로 나눠 미디어 200 을 먼저** 판정하게 하라. 미디어 200 은 적재를 막고 있고(GEN 대기), 힌트 1,328 은 이미 게임에 나가고 있어 급하지 않다. 그러면 생성→판정→적재가 짧아진다(`gen.md` 7장 1번 제안과 같은 방향).

---

## 1. 조직과 VERIFY 의 자리

```
찬종(사용자 · 운영/기획 결정권자)
  └ 설계·지시 에이전트 (당신)
       ├ GEN    (Opus)   문제 데이터 생성 · 생성 규칙 · 적재       보고서 ai-out/Rnnn.txt
       ├ VERIFY (Sonnet) 생성물 독립 판정                         보고서 ai-out/Vnnn.txt
       └ MAIN            웹/모바일 풀스택                          보고서 ai-out/Rnnn.txt
```

- `Vnnn` 은 VERIFY 만 쓴다(V001~V004 사용, **다음은 V005**). `Rnnn` 은 GEN 과 MAIN 이 같이 쓴다.
- ★★ **VERIFY 는 GEN 과 다른 모델이어야 한다.** 역할 분리의 근거가 "생성자가 자기 산출물을 최종 판정하면 안 된다"(R012 실측 · Q-75 · Q-81 · [docs/12-SONNET-SESSION.md](../docs/12-SONNET-SESSION.md) 0장)이고, GEN 이 Opus 이므로 VERIFY 는 Sonnet 으로 돌려 왔다(V001~V004 모두 Sonnet). 같은 모델로 돌리면 독립성 근거가 약해진다 — 모델을 바꾸려면 찬종 결정으로 남겨 달라.
- VERIFY 와 MAIN 은 거의 맞닿지 않는다. 게임 화면·서버는 VERIFY 판정 대상이 아니다. 단 **게임 규칙(문제 40초 · 30초 남았을 때 일반 힌트 · 15초 남았을 때 초성 · 정답 공개 8초 — [docs/01-GAME-RULES.md](../docs/01-GAME-RULES.md))** 은 힌트 판정(H11 보이는 시간)과 질문 길이(3-1) 판정의 전제다.

---

## 2. VERIFY 의 역할 (상세)

### 2-1. 하는 일
| 판정 종류 | 무엇을 보나 | 결과 어휘 | 정본 기준 |
|---|---|---|---|
| **중복** | 두 문항을 맞히게 해 주는 지식이 같은가 | `same` / `different` / `unsure` + keep(a·b·none) · mergeAnswers | 12 §9 · 15 §9 · Q-91 · Q-96 · Q-97 · D6 · D8 |
| **일반 힌트** | 도와주기인가 떠먹여 주기인가 · 정답 글자 · 다른 이름 · 사실 · 해설과 같은 사실 | `ok` / `fix`(제안 문구) / `unsure` + category `spoon-feed`·`letters`·`alias`·`error`·`explain-overlap` | 12 §10 · 15 §4-1 (H0~H11) |
| **사실** | 질문·해설의 주장이 맞는가 · 한정이 맞는가 · 단정어 | `ok` / `fix`(제안 + 근거) / `drop` / `unsure`, 주장마다 `true`·`false`·`unverified` + 출처 URL | 15 §3-2 |
| **2회차 짝** | 1회차만 아는 사람이 새 사실 없이 바로 풀 수 있는가 | `ok` / `fix` / `drop` / `unsure` + sameFact `different`·`partial`·`same` | 15 §3-3 · §8 |
| **질문** | 정답 유일성 · 정답 노출 · 읽기 좋은 문제 | fix / drop | 15 §1 · §2 · §3 · §3-1 |
| **미디어 깊이** (V005 부터) | 작품의 무게 · 너무 쉬움 · 너무 마니악함 · 대중/팬 세부 비율 · 시제 · 변형 | ok / fix / drop | 15 §7-1 (MD1~MD11) |
| **누적 집계** | 같은 정답이 기존 활성 + 이번 묶음에 몇 건 쌓이나 (판정 아님) | 분포 + 3건 이상 목록 | V004 5절 |
| **반복 오류 유형** | 생성 규칙에 되돌려 줄 오류 꼴 | 보고서 6절 | — |

★ VERIFY 가 짚은 반복 오류는 실제로 규칙이 된다 — V004 6절 → R031 에서 15 §3-2(사실·한정) · §3-3(2회차) 신설. 이 절을 성실히 쓰는 것이 VERIFY 가 품질에 주는 가장 큰 기여다.

### 2-2. 하지 않는 일 (매 지시에 들어가던 금지)
- DB 쓰기 · 적재(`pipeline-load`) · 문제 생성 · 규칙/프롬프트/코드 수정 · 서버 기동 · `npm run verify`·`npm run build`(dist 를 다시 만들어 다른 세션과 충돌 — 12 §2) · Gemini 호출.
- 찬종에게 확인을 요청하지 않는다 → 판정 못 한 것은 `unsure` 로 두고 `docs/13-PENDING-CHECKS.md` 에 쌓는다.
- 목록 밖 문항을 판정하지 않는다(눈에 띈 것은 보고서에 "참고" 로만).
- 비밀값 커밋 금지(저장소 public).

### 2-3. 쓰는 파일 (허용 범위)
- `ai-out/Vnnn.txt` (보고서) · `data/pipeline/audit/vnnn-results.json` (결과) · `docs/13-PENDING-CHECKS.md` 의 해당 C 행(결과 한 줄 + 새 C 항목).
- 이 세 파일의 커밋·푸시는 V003·V004 지시에서 허용되었다(12 §2 의 "커밋하지 않는다" 는 R013 시절 규칙이고 실제로는 이렇게 바뀌었다 — **새 지시에 허용 여부를 한 줄 적어 달라**). 커밋할 때는 이 파일들만 `git add` 한다. 커밋 끝줄 `Co-Authored-By: Claude <실행 모델 이름> <noreply@anthropic.com>`.
- 중간 산출물(판정자 조각 출력 · 스크립트)은 세션 scratchpad(저장소 밖)에만 남는다. 새 세션에는 없다.
- ★ 번호 충돌 주의: 13-PENDING 의 C 번호는 GEN 도 쓴다(V004 때 VERIFY 가 C53 · C54 를 만들었다). 쓰기 전에 13 의 마지막 번호(현재 **C60**)를 확인한다. A 번호는 MAIN 의 "사람이 직접 볼 것" 이라 VERIFY 는 쓰지 않는다.

---

## 3. 판정 기준 요약 (판정 문장 위주 — 어긋나면 docs 가 맞다)

- **중복 Q-91**: "그 문제를 맞히게 해 주는 지식이 같은가." 대상이 같아도 지식이 다르면 different(D8 사르트르 — 노벨상 거절 / 실존주의). 동음이의 different. **Q-97**: 두 질문 문장에 같은 구체 조건이 명시되고 정답 정밀도만 다르면 same · keep 은 정밀한 쪽(해설은 보지 않는다). 애매하면 **D6 — 둘 다 남긴다.** 2회차 짝(`pairedWith`)은 같은 답이 정상이라 중복 후보에서 면제(C28 · D-102).
- **힌트 (R030 기준 — V003 이 쓴 R027 기준은 폐기)**: "힌트만 읽고(질문 없이) 바로 답이 떠오르는가" → 떠먹여 주기(fix). 기준은 **보통 한국 성인**, 모델 자신이 아니다. 질문과 엮어 한 번 생각하면 닿는 것은 도와주기(ok). **세기만으로 고치지 않는다.** 세기와 상관없이 늘 fix: 정답 글자·조각·로마자/음차 조각 · 정답으로 인정 안 되는 다른 이름(고치는 길은 힌트에서 빼기, 변형 추가 아님) · 사실 아님 · 해설과 같은 사실. 팬 세부 미디어는 연결 하나로 팬이 바로 알아 쉽게 세지므로 엄하게 본다(MD9).
- **사실 3-2**: 연도 · "처음/마지막/모두/유일/평생" 같은 단정어는 출처가 있어야 한다. 없으면 빼거나 "전한다 · 흔히 알려져 있다" 로.
- **2회차 3-3**: "1회차만 아는 사람이 2회차의 묻는 문장을 새 사실 없이 바로 풀 수 있는가" → 같은 사실. 1회차 정의를 2회차 끝에 덧붙인 것, 1회차 질문에 담긴 이름 대응을 되묻는 것도 같은 사실. 고쳐도 같으면 drop.
- **미디어 7-1 (V005 에서 처음 쓰는 기준)**: MD1 대중 30% / 팬 세부 70% · MD2 허용 / MD3 금지("팬 중에서도 일부만 아는가") · MD5 미디어만 알 가치 2 허용, 해외축구는 sports 라 3 이상 · MD7 시간에 따라 바뀌는 사실은 지금 시제로 단정 금지 · MD8 흔히 쓰는 표기만 변형 · **MD10 "그 작품 자체가 세계적이거나 한국에서 레전드로 취급받는가"** · **MD11 너무 쉬움**(줄거리·주연을 다 주는 대히트작 제목 맞히기 / 국민 캐릭터·밈). 찬종의 실제 표시 예는 [docs/media-deep-review.md](../docs/media-deep-review.md) (좋음 23 · 쉬움 5 · 마니악 2).
- **읽기 좋은 문제 3-1**: "한눈에 들어오는가. 두세 줄로 풀면 더 읽기 쉬운가." 단서·배경 앞, 묻는 것 마지막 문장, 1~3줄. 이것만으로 fix 하지는 않는다(한정어가 뒤 문장으로 밀려 답이 둘이 되는 경우 등만).

---

## 4. 지금까지 지시받은 방식 · 산출물 형식

### 4-1. 브리핑 모양 (구 에이전트가 붙여 넣던 것)
1. 라운드 · TASK 한 줄 (`TASK: R030 심화 713건 판정 — 힌트 · 사실 · 중복 · 짝 대조 (C52)`)
2. 먼저 읽을 것 (`ai-out/Rnnn.txt` · 15 의 해당 절 · 12 의 해당 절)
3. 대상 파일과 종류별 건수
4. 종류별 판정 기준과 결과 어휘 (2-1 표)
5. **지난 VERIFY 라운드 피드백** (잘한 것 / 틀린 것 → 교훈, 5-2)
6. 산출물 두 개 + 보고서 절 구성
7. 금지 목록 · "찬종에게 묻지 말고 13-PENDING 에" · "git 에러면 VPN 확인 필요로 보고" · "중단·재개 가능하게, 어디까지 했는지 남겨라"
8. 터미널 답변 5줄 이내 · 한국어

### 4-2. `Vnnn.txt` 헤더 (UTF-8 + LF)
```
===========================================
ROUND: V005
DATE: (작성 시각)
TASK: …
STATUS: (완료 / 부분완료 / 결정대기)
===========================================
```

### 4-3. 보고서 절 (V004 기준 — 지시에 따라 조정)
0 웹 검색·조회 가능 여부(맨 앞) · 1 실제 판정 건수 · 빠진 것 · 2 종류별 결과 · 3 fix·drop 전부(현재 / 제안 / 사유 / 출처) · 4 unsure · 경계선 · 미확인 주장 전부 · 5 같은 정답 누적 분포 · 6 반복 오류 유형(생성 규칙에 넣을 것) · 7 자기 점검(표본으로만 본 것 · 못 한 것을 숫자로).

### 4-4. 결과 JSON (`data/pipeline/audit/vnnn-results.json`)
대상 목록의 **모든 항목이 키(seedId · ref · id)로 한 번씩** 들어가야 한다(누락 0, 다음 GEN 이 기계로 읽는다). 항목마다 verdict · category · proposal(질문/해설/힌트 전체 문구) · reason · sources, 사실은 주장마다 result · source · basis(`web`/`knowledge`). 예: `v004-results.json` 의 키 — `web` · `counts` · `hints` · `facts` · `factStats` · `duplicates` · `naKept` · `extraSameAnswer` · `pairs` · `sameTarget`.

---

## 5. VERIFY 가 일해 온 방식 (재현용)

### 5-1. 순서
1. **읽기**: 지시 → `ai-out/Rnnn.txt` → 15·12 의 해당 절 → 대상 JSON. 큰 JSON 은 통째로 읽지 말고 `node -e` 로 필터해 본다(컨텍스트가 넘친다).
2. **나누기**: 수백 건 이상이면 100건 안팎 조각으로 나눠 하위 에이전트(판정자)에 병렬로 맡긴다. 판정 기준은 **한 파일**(V004 의 `PAIR-RUBRIC.md`)로 모든 판정자에게 같게 준다. 입력은 사람이 읽는 덤프(`p1.txt`) + 정식 JSON. 판정자는 조각마다 결과 파일을 쓴다(중단·재개 지점).
3. **대조**: 판정자 결과의 개수·키 순서를 입력과 기계로 맞춘다. **같은 정답이 여러 항목에 걸리면 한꺼번에 다시 본다**(판정자별로 따로 보면 keep·판정이 엇갈린다 — V001 · V004).
4. **직접 보는 것**: 힌트 전수 · 중복 · fix/drop 전부 · 경계선(ok 인데 sameFact same/partial). 힌트와 제안 문구는 `scripts/hint-check.mjs` 의 `checkHint({hint, answer, variants, question, explanation})` → `{block, warn}` 로 기계 검사.
5. **사실 확인**: 5-3.
6. **합치기**: 스크립트로 결과 JSON → 보고서를 기계 생성(인용 문구를 입력 파일에서 그대로 가져오기 위해).
7. **누적 집계**: 읽기 전용 DB 조회(docker `quiz-web-db` · 5434 · db `quizweb` — 접속 정보는 `gen.md` 3장) + `shared/dist/index.js` 의 `normalizeAnswer` 로 정답을 묶는다.
8. **마무리**: 13-PENDING 해당 C 행 갱신 → 세 파일만 커밋 → `git fetch` → 충돌 없으면 push (충돌이면 강제하지 말고 보고, git 오류면 "VPN 확인 필요").

### 5-2. 교훈 (지난 피드백에서 — 새 지시에도 그대로 유지)
- **A (V001)** 판정 근거에 "질문에 무엇이 적혀 있는가" 를 쓸 때는 **원문에서 확인한 것만**. V001 의 V031 사유가 원문과 달라 GEN 이 바로잡았다(12 §9-1). 인용은 기계로 대조한다.
- **B (V003)** 세기만으로 힌트를 고치지 않는다 — V003 의 세기 fix 34건이 찬종에게 되돌려졌다(기준이 R030 에 바뀜).
- **C (V001)** 같은 항목이 여러 쌍에 걸치면 묶어서 판정한다.
- **D (V003)** "버린 것을 세어서 보여 주지 않으면 버린 줄 모른다" — 못 한 것을 숫자로.
- **E (V004)** 판정자 ok 를 그대로 받은 영역은 표본이라도 다시 읽거나, 안 읽었으면 7절에 적는다. 실제로 R031 에서 GEN 이 V004 가 다시 읽지 않은 495건 중 80건을 표본으로 보니 **same 9건(11%)** 이 나왔다 — 판정자 ok 는 생각보다 느슨하다.
- **F (V004)** 같은 유형(1회차가 정의, 2회차가 같은 대상을 일화로 되묻기)을 판정자마다 drop/ok 로 갈랐다(경계선 20건). 새 기준은 **표본으로 먼저 맞춰 보고(보정)** 전체를 돌린다.

### 5-3. 웹 확인과 그 한계
- **WebSearch**: 한 세션 약 200회가 하위 에이전트와 공유되어 V004 중간에 바닥났다. **WebFetch**(`ko.wikipedia.org/wiki/제목`, `en.wikipedia.org/...`)는 계속 쓸 수 있었다. 단 요약 모델을 거치므로 "페이지에서 확인 못 함 ≠ 거짓" — 그래서 주장마다 `true/false/unverified` 와 `basis` 를 따로 적는다.
- V004 실측: 주장 514건 중 출처로 맞음 409 · 틀림 9 · 페이지에서 못 찾음 46 · 지식만 50. 남은 96건은 R031 에서 GEN 이 웹으로 다시 확인해 **일부 틀림 11건**이 나왔다 — "지식 근거 ok" 에도 오류가 섞여 있다.
- ★ `midHints` 의 `blind`(정답을 가리고 힌트만 본 모델의 추측)는 떠먹여 주기의 신호로 쓰지 말 것 — 모델이 아는 것과 보통 사람이 바로 떠올리는 것은 다르고(12 §10: 395건 중 327건을 맞힘), GEN 실측으로도 이 방식은 떠먹여 주기를 구분하지 못했다(`gen.md` 5장).

### 5-4. 환경 함정 (`main.md` 6장과 같은 PC)
- 사용량 한도(429)로 하위 에이전트가 한꺼번에 죽은 적이 있다(V001 · V004) → 한 번에 3~6개만 띄우고, 결과 파일이 없는 조각만 다시 띄운다.
- 메모리가 빠듯하다(16GB 중 1~3GB) — VERIFY 는 서버·빌드를 돌리지 않으니 영향이 적지만, 하위 에이전트를 많이 띄우면 같이 느려진다.
- Git Bash heredoc 안 따옴표가 잘 깨진다 → 긴 스크립트는 파일로 써서 `node 파일`. 파이썬은 `PYTHONIOENCODING=utf-8`.
- 찬종 PC 에는 `npm run dev` · 터널이 늘 떠 있다 — 건드리지 않는다.

---

## 6. 이력 (VERIFY 라운드와 그 결과가 어떻게 쓰였나)

| 라운드 | 판정 | 결과 파일 | GEN 의 반영 |
|---|---|---|---|
| V001 | 밀린 중복 239쌍 + 빠진 3쌍 (Q-91) | `ai-out/V001.txt` · `data/pipeline/dedupe/r021-judged.json` · `r020-pending-judged.json` | V031 사유 정정 → 교훈 A · Q-97 신설 계기 |
| V002 | R022 중복 31쌍 · GEN 이 "걸렸지만 살린" 27쌍의 same 비율(= GEN 판단 오류율) | `ai-out/V002.txt` · `dedupe/r022-judged.json` | |
| V003 | R029 일반 힌트 395 + 재작성 질문 128 사실 (C48) | `ai-out/V003.txt` · `data/pipeline/audit/v003-results.json` | R030 에서 66건 반영 · 세기 fix 34 되돌림 → 교훈 B · 힌트 기준 개정 |
| V004 | R030 심화 1,077 대상(힌트 188 · 사실 273 · 짝 598 · 중복 5 · 나-kept 13) (C52) | `ai-out/V004.txt` · `data/pipeline/audit/v004-results.json` | R031: 짝 drop 12 수용 · fix 중 7 미수용(사유 기재) · 경계선 20 → 고침 16 · 격리 3 · 그대로 1 · 미확인 96 주장 웹 확인(`r031-fact-check.json`) · 15 §3-2·§3-3 신설 (C53 · C54) |

---

## 7. 앞으로 VERIFY 가 할 일

### 7-1. V005 — C60 (`r047-verify-targets.json`)
**(가) 미디어 200 — 적재 전, 먼저.** 항목 필드: `ref · genre · layer(대중/팬 세부) · sub · topic · change(clue/read/new/none) · question · questionBefore(바뀐 것만) · answer · variants · explanation · hint · score{dif,wor,acc + 이유} · sources · hintBasis(web/knowledge/…/GEN) · check[]`.
1. 사실(웹) — `change=clue`(44) · `new`(10) 는 새 사실이므로 반드시 출처 대조. GEN 이 단 `sources` URL 을 **WebFetch 로 열어 대조**하면 검색 예산을 아낀다.
2. 정답 유일성 · 변형은 흔히 쓰는 것만(MD8).
3. 깊이 — MD10 작품의 무게 · MD11 너무 쉬움 · MD3 너무 마니악 · 대중 60/팬 세부 140 이 MD1(30/70)과 맞는지 · 해외축구 알 가치 ≥3(MD5) · 시제(MD7).
4. 읽기 좋은 문제 3-1 (`change=read` 81건은 고친 전/후를 같이 본다 — 뜻이 바뀌지 않았는가).
5. 힌트 138 — H9/MD9 떠먹여 주기 · H10 다른 이름 · 사실. **`hintBasis` 가 knowledge 인 37건(knowledge 23 + knowledge/GEN 14)을 우선 웹 확인.**
6. 기존 활성 문항과의 중복(GEN 이 전역 대조를 했지만 독립적으로).

**(나) 힌트 1,328 — 이미 적재됨, 나중에.** 필드 `id · question · answer · variants · explanation · hint · path · check[] · blind{guess,conf} · gen`. 기준 12 §10 · 15 §4-1. 이미 게임에 나가고 있으므로 fix 는 **DB 수정 제안**이 되고, GEN 이 백업 후 반영한다.

산출물: `ai-out/V005.txt` · `data/pipeline/audit/v005-results.json` (둘로 나누면 V005 · V006).

### 7-2. C55 — R032 기존 활성 문항 고침 63 (`data/pipeline/audit/r032-fixes.json`, before/after · 사유)
새로 넣은 사실은 GEN 이 웹 확인(33/33)했다. 남은 판정은 **고친 문장의 뜻이 바뀌지 않았는가 · 자연스러운가 · 답이 여전히 하나인가.** 규모가 작아 V005(나)와 묶어도 된다.

### 7-3. 상시
GEN 이 새 묶음을 만들 때마다 `rNNN-verify-targets.json`(또는 중복 후보 `dedupe/<round>-candidates.json` — `byNewItem` 으로 묶어 보고, `exemptedPairs` 는 판정하지 않고, `excluded` 를 먼저 볼 것)이 온다 → 판정 → GEN 반영 → 적재. `gen.md` 6장의 "문제 수 늘리기"(특히 난이도 4~5) 가 시작되면 VERIFY 몫도 그만큼 는다.

### 7-4. 지켜볼 것
C56 시간 의존 문항(#2571 국제장편영화상 · #3303 쿠릴 열도) — 지금은 맞다.

---

## 8. GEN 과 맞닿는 곳 (GEN 의 역할 전체는 [`gen.md`](gen.md))

- **GEN → VERIFY (입력 약속)**: `data/pipeline/audit/rNNN-verify-targets.json`. 항목에 기계 검사 결과(`check[]`) · 고친 전 문장(`questionBefore`) · 출처(`sources`) · 점수 · 힌트 근거(`hintBasis`)를 붙인다. V004 처럼 판정 기준 문구를 파일 `criteria` 에 넣어 주면 판정자 지시가 정확해진다.
- **VERIFY → GEN (출력 약속)**: `vnnn-results.json` + 보고서. GEN 은 keep 을 **제안으로** 받고(신규가 더 많이 가르칠 때만 교체 · 엇갈리면 기존 유지 — 12 §9-3), fix 는 읽고 판단해 반영하며 안 받은 것은 사유를 R 보고서에 적는다. VERIFY 의 제안 속 새 사실은 GEN 이 한 번 더 웹 확인한다.
- **경계**: GEN 의 자기 검사(기계 게이트 · 블라인드 테스트 · 자기 사실 확인)는 1차 점검이고, 확정은 VERIFY 판정을 거친 뒤다(`gen.md` 1장). 규칙 변경은 GEN(찬종 결정 후)만 하고 VERIFY 는 6절 "반복 오류 유형" 으로 제안만 한다.
- GEN 이 VERIFY 에게 바라는 것(`gen.md` 7장 8번): "지식 근거" 표시 항목을 VERIFY 가 웹으로 우선 확인 — 7-1 (가)5 에 반영했다.

---

## 9. 구 에이전트 방식에서 고치면 좋을 점 (VERIFY 시점 — `gen.md` 7장 · `main.md` 9장과 겹치는 것은 번호만 적는다)

1. **기준이 바뀌면 VERIFY 에게 즉시, 맨 위에** "폐기 기준 / 새 기준 / 적용 시점" 을 적어 달라. V003 은 R030 에서 폐기된 옛 힌트 기준으로 판정해 결과 일부가 무효가 됐다.
2. **한 라운드 분량을 우선순위로 나눠라.** V004(1,077건)는 컨텍스트·사용량 한도로 여러 번 끊겼다. 대상 목록에 P1/P2 가 이미 있으니 P1 을 따로, 또는 "적재를 막는 것 먼저"(V005 의 미디어 200) — `main.md` 9장 3번과 같은 취지.
3. **웹 확인 예산과 방법을 지시에 적어라.** "WebSearch N회 이내 · GEN 이 단 sources 는 WebFetch 로 대조" 처럼. 그리고 "지식 근거 ok 를 몇 %까지 허용하나" 를 정해 달라(V004 는 96건이 남았고 그중 11건이 틀렸다).
4. **새 기준은 보정 표본부터.** 5~10건을 먼저 판정해 보고서로 받고, 판정자 사이 기준을 맞춘 뒤 전체를 돌린다(교훈 F).
5. **피드백을 문서에 누적.** 매 브리핑의 "지난 라운드 피드백" 이 좋았다. 교훈(5-2 의 A~F)을 `docs/12-SONNET-SESSION.md` 에 옮겨 두면 브리핑이 짧아진다 — VERIFY 는 docs 를 고치지 않으므로 GEN 이나 당신이 옮겨 달라. 같은 취지: `gen.md` 7장 2번 · `main.md` 9장 5번.
6. **`docs/12-SONNET-SESSION.md` 가 낡았다.** 1~8장(역검증 `pipeline-sonnet.mjs` · `sonnet-decisions.json` · "커밋하지 않는다")은 R013~R014 흐름이고 V001 이후에는 쓰이지 않았다. 지금 쓰는 것은 9장(중복) · 10장(힌트)과 이 문서다. 정리 라운드를 GEN 에게 줘도 좋다.
7. **번호 겹침.** 13-PENDING 의 C 번호를 GEN·VERIFY 가 같이 쓴다. 07 의 D-174·D-175 겹침(`main.md` 9장 1번)과 같은 위험이 있으니, 동시 라운드라면 번호를 미리 나눠 달라.
8. **`ai-out/README.md` 색인에 V001~V004 행이 없다.** R 라운드만 있다. 색인에 V 행을 넣으면 VERIFY 결과를 찾기 쉽다(VERIFY 가 넣어도 되는지 지시해 달라).
9. **판정자 조각 출력 보존.** 지금은 저장소 밖 scratchpad 에만 남아 재감사가 어렵다. 필요하면 `data/pipeline/audit/vnnn-raw/` 같은 자리를 허용해 달라.
10. **모델 지정.** VERIFY 세션 모델을 브리핑에 명시해 달라(1절 — GEN 과 다른 모델).

---

## 10. ★ VERIFY 가 새 에이전트에게 요청하는 것

- **다음 지시를 주세요.** VERIFY 는 대기 중이고, 바로 할 일은 V005(C60)입니다. 미디어 200 을 먼저 하는 분할을 권합니다(0절).
- 브리핑에 넣어 주면 좋은 것: 라운드 번호 · TASK 한 줄 · 대상 파일과 범위(나눌 경우) · 적용 기준(정본 절 번호) · 웹 예산 · 산출물 · 커밋 허용 여부 · 하지 말 것 · 지난 피드백 · 실행 모델.
- 틀 (그대로 고쳐 써도 됩니다):
```
[VERIFY V005]
TASK: R047 미디어 200 판정 (C60 가) — 적재 전
먼저 읽기: ai-out/verify.md · ai-out/R047.txt · docs/15-QUALITY-STANDARD.md (1·2·3·3-1·3-2, 4-1, 7-1 MD1~MD11) · docs/12-SONNET-SESSION.md §10 · docs/media-deep-review.md
대상: data/pipeline/audit/r047-verify-targets.json 의 media 200 (midHints 1,328 은 다음 라운드)
볼 것: 사실(change=clue·new 는 새 사실) · 정답 유일 · 변형(MD8) · 깊이(MD3·MD10·MD11 · 비율 MD1 · 축구 MD5 · 시제 MD7) · 3-1 · 힌트(H9·MD9·H10 · hintBasis=knowledge 37 우선) · 기존 문항 중복
결과: ok / fix(전체 문구) / drop / unsure + 이유 · 사실은 주장별 true/false/unverified + 출처 URL + basis
웹: WebSearch □회 이내, GEN sources 는 WebFetch 로 대조 · 못 쓰면 보고서 맨 앞에
출력: ai-out/V005.txt (고정 헤더 · 0~7절) + data/pipeline/audit/v005-results.json (200 전부)
커밋: 위 두 파일 + 13-PENDING C60 행만 (허용 / 불허)
금지: DB 쓰기·적재·생성·규칙·프롬프트·코드 수정·서버 기동·빌드 · 찬종에게 묻지 말 것(13-PENDING 에)
중단·재개: 조각별 결과 파일 + 진행 상태 · 못 한 것은 숫자로
지난 피드백: (있으면)
답변: 한국어, 터미널 5줄 이내
```

---

## 11. 참조 (읽는 순서)

| 우선 | 파일 | 용도 |
|---|---|---|
| 1 | [ai-out/R047.txt](R047.txt) · `data/pipeline/audit/r047-verify-targets.json` | V005 대상과 그 배경 |
| 1 | [docs/15-QUALITY-STANDARD.md](../docs/15-QUALITY-STANDARD.md) | ★ 판정 기준 정본 (1 · 2 · 3 · 3-1 · 3-2 · 3-3 · 4-1 · 5 · 7-1 · 8 · 9) |
| 1 | [docs/12-SONNET-SESSION.md](../docs/12-SONNET-SESSION.md) §9 · §10 | 중복 · 힌트 판정 (1~8장은 옛 흐름 — 9절 6번) |
| 1 | [docs/13-PENDING-CHECKS.md](../docs/13-PENDING-CHECKS.md) C52~C60 | 대기 항목 · 번호 |
| 2 | [ai-out/V004.txt](V004.txt) · `data/pipeline/audit/v004-results.json` | 최근 보고서·결과 양식 |
| 2 | [ai-out/R031.txt](R031.txt) | GEN 이 VERIFY 결과를 받아들인 방식 · 표본 재판정 |
| 2 | [docs/media-deep-review.md](../docs/media-deep-review.md) | 찬종의 미디어 표시 (MD10 · MD11 의 실제 예) |
| 2 | `data/pipeline/audit/r032-fixes.json` | C55 대상 |
| 3 | [ai-out/V001.txt](V001.txt)~[V003.txt](V003.txt) · `data/pipeline/dedupe/r021·r022-judged.json` · `audit/v003-results.json` | 과거 양식 |
| 3 | [docs/07-DECISIONS.md](../docs/07-DECISIONS.md) · [08-OPEN-QUESTIONS](../docs/08-OPEN-QUESTIONS.md) · [01-GAME-RULES](../docs/01-GAME-RULES.md) | 결정 · 질문 · 게임 규칙 |
| 3 | `scripts/hint-check.mjs` · `pipeline/lib/question-checks.mjs` · `pipeline/lib/answer-rules.mjs` | 기계 검사 (판정 보조로만) |
| 3 | [gen.md](gen.md) · [main.md](main.md) | 다른 두 세션의 인수인계 |

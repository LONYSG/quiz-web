# 12. Sonnet 세션 지시서

> ★ 이 문서는 **다른 세션에서 Sonnet 으로 실행할 작업**의 지시서다.
> ★ R013 작업 E 로 작성했다. 근거는 Q-75 확정(3중 역할 분리)이다.
> ★ 이 문서를 Sonnet 세션의 첫 입력으로 그대로 붙여 넣으면 된다.

---

## 0. 왜 별도 세션인가

★ **판정 독립성** 때문이다.

R012 에서 Claude Code 가 자기 생성분 100건을 자기가 검토했고 "사실 오류 0건" 이라고
보고했다. ★ 그러면서 같은 보고서에 "이 판정은 신뢰할 수 없다" 고 스스로 적었다.
★ 생성자가 자기 산출물을 최종 판정하면 안 된다는 증거다.

그래서 역할을 셋으로 나눈다 (Q-75 확정).

### ★★ R014 개정 (Q-81) — 역할이 바뀌었다

| 모델 | 역할 | 권한 |
|------|------|------|
| **Opus** | 문제 생성 / 규격·프롬프트 설계 | ★ **개별 항목 최종 판정에 참여하지 않는다** |
| **Sonnet** | ★★ **역검증 + 사실 검토 + 최종 확정. 전량 담당** | ★ **최종 확정** |
| **Gemini** | ★ **표본 감사.** 하루에 쓸 수 있는 만큼만 | ★ 신호만 낸다. **어떤 항목도 뒤집지 않는다** |

★★ 왜 옮겼는가 (R013 실측)

```
R013: Gemini 호출이 하루에 1회만 성공했다
  01:09  1회 성공
  01:10  2번째 호출 → 429
  01:32  15분 대기 후 재개 → 또 429 → 그날 중단
★★ 그 결과 50건 샘플이 **전량 격리 상태**로 남았다.
★  500건을 만들면 500건이 격리된다.
```

★ 문제의 본질은 **Gemini 가 필수 경로에 있었다는 것**이다.
생성(Opus)은 한도가 사실상 무제한인데 검증(Gemini)이 하루 1~2회로 막히면
파이프라인 전체가 멈춘다.

★ Sonnet 이 전량을 맡아도 독립성은 유지된다 — Opus 와 다른 모델이므로
자기가 만든 것을 자기가 검증하는 구조가 아니다.

★ 그리고 품질에도 낫다. Gemini 오판의 실측 근거 —
- R010: 역검증 판정이 정상 문제 **6건을 6건 모두** 오탈락시켰다
- R012: 탈락 3건 중 **2건이 오탈락**이었다 (쐐기문자 / 카롤루스 대제)

★ 건우가 "Opus 가 최종 판정하면 어떤가" 를 제안했으나,
Opus 는 생성자다. ★ 생성자가 자기 항목을 되살릴 권한을 가지면 안 된다.
Sonnet 은 Gemini 보다 성능이 높고 생성자가 아니다. ★ 둘 다 만족한다.

---

## 1. Sonnet 이 하는 일

### ★★ 1-0. 역검증 — 전량 담당 (R014 신설 / Q-81)

**역검증이란**: 질문만 보고 정답을 맞혀 본다. 우리 정답과 일치하는지로 문제 품질을 본다.

★★★ **정답을 보지 않고 답해야 한다. 이것이 절대 조건이다.**

★ 근거 — 우리 정답을 보면서 답하면 역검증이 아니다. **그냥 동의하는 것이다.**
★ 그리고 일치 여부를 스스로 판정하면 "비슷하니 맞았다" 로 흐른다.

→ ★ 그래서 **코드가 정답 노출과 판정을 통제한다.** 절차가 이렇게 나뉜다.

```
1) Opus:   node scripts/pipeline-sonnet.mjs export
           → sonnet-backcheck-questions.json  ★ 질문만. 정답이 없다
2) Sonnet: 질문을 읽고 자기 답을 쓴다
           → sonnet-backcheck-answers.json
3) Opus:   node scripts/pipeline-sonnet.mjs backcheck
           ★ 코드가 judgeBackcheck 로 비교한다. **Gemini 경로와 같은 함수다**
4) Sonnet: 격리된 것만 재판정 + accept 후보의 사실 검토 (1-1 / 1-2)
5) Opus:   node scripts/pipeline-apply-decisions.mjs
```

★ 질문 파일에는 정답도 카테고리도 없다.
★ 근거: Gemini 역검증 프롬프트와 **조건을 같게** 유지해야 두 판정을 비교할 수 있다.

**★ 답 파일에 채울 것** (`sonnet-backcheck-answers.json`)

| 필드 | 내용 |
|------|------|
| `ref` | 질문 파일의 `ref` 를 그대로 |
| `answer` | ★ 질문만 보고 맞힌 답. **하나만** 쓴다 |
| `ambiguous` | ★ 확신이 없는가. 답이 여럿일 수 있다고 느끼면 true |
| `alternatives` | `ambiguous` 일 때 가능한 다른 답들 |
| `confidence` | 0.0~1.0 |
| `factualIssues` | ★ 질문에 사실과 다른 서술이 있는가 |
| `uniquenessIssue` | ★ 조건을 만족하는 답이 둘 이상인가 (한정어 누락) |
| `spellingIssues` | ★ 인명·작품명·표기가 틀렸는가 |

★★ **일치 여부를 쓰지 않는다.** 그 칸이 없다. 코드가 판정한다.

★ 세 배열은 R013 에서 p3 로 추가한 것과 같은 항목이다. 실패 예시 —

```
[사실 오류]  "라틴어 '수소(Hydrargyrum)'에서 유래한 …수은의 원소 기호는?"
             → Hydrargyrum 은 '물 같은 은' 이다. 수소가 아니다
             ★ 정답(Hg)은 맞으므로 답만 보면 통과한다. 그래서 이 배열이 필요하다
[유일성]     "체스판에서 가로와 세로 직선으로 거리 제한 없이 이동하는 기물은?" → 룩
             → 퀸도 그렇게 움직인다. "~만" 이 빠졌다
[표기]       "교황 그리구리우스 7세" → 그레고리우스 7세
```

★★ **정답이 맞아도 이 배열이 비어 있지 않을 수 있다.** 그것이 p3 의 핵심이다.

### 1-1. 격리 항목 재판정

Gemini 역검증·규칙 검사에서 격리된 항목을 하나씩 보고 판정한다.

판정은 셋 중 하나다.

| 판정 | 의미 | 언제 |
|------|------|------|
| `pass` | 살린다 | ★ 격리 사유가 틀렸다. 문제 자체는 정상이다 |
| `drop` | 버린다 | 격리 사유가 맞다. 문제에 실제 결함이 있다 |
| `needsRuleDecision` | ★ 규칙을 고쳐야 한다 | ★ 문제도 정상이고 Gemini 판정도 규칙대로였다. **규칙이 문제다** |

★ `needsRuleDecision` 을 반드시 구분해서 쓸 것 — 이것이 R013 에서 새로 만든 경로다.

실제 사례 (R012)
```
정답: 히에로글리프 / 신성문자 / Hieroglyph
Gemini 답: "상형 문자"  → 불일치로 격리
★ 문제는 정상이다. Gemini 도 사실상 맞혔다.
★ 그런데 "상형문자" 는 더 넓은 개념이고,
  g3 생성 규칙이 "복수 정답에 상위 개념을 넣지 말라" 고 한다.
→ ★ 이 항목을 살리거나 죽이는 문제가 아니다. **규칙을 정할 문제다.**
→ needsRuleDecision
```

★ 판단 기준 — 다음 둘이 **동시에** 성립하면 `needsRuleDecision` 이다.
1. 문제 문장과 정답 자체에는 결함이 없다
2. 격리 원인이 **우리 규칙**(생성 규칙 / 정답 배열 규칙 / 카테고리 경계)에 있다

★ 애매하면 `pass` 가 아니라 `needsRuleDecision` 이다.
  근거 — `pass` 는 판단을 끝내는 것이고 `needsRuleDecision` 은 건우에게 올리는 것이다.
  ★ 확신 없이 끝내는 것보다 올리는 것이 낫다.

### 1-2. 사실 오류 검토

★ 격리되지 않은 항목(`verdict='accept'`)도 **사실 오류만** 따로 본다.

보는 것
- 어원·연도·인명·작품명이 실제로 맞는가
- ★ 한정어가 빠졌는가 — "~만", "가장", "유일한" 이 있어야 하는데 없는가
- 확신 없는 서술이 들어 있는가

★ R012 에서 실제로 놓친 유형이다.
```
[사실 오류] "수성의 영어 이름 Mercury 는 라틴어 Hydrargyrum 에서 왔다"
  → Hydrargyrum 은 **수은**의 라틴어명이다. 수성(Mercury)과 무관하다
[유일성 결함] "체스에서 직선으로만 움직이는 기물은?"
  → 룩만이 아니다. 폰도 직선으로만 움직인다. ★ 한정어가 부족하다
[표기 오류] "그리구리우스" → 그레고리우스
[표기 오류] "전사들의 후예" → (실제 작품명 확인 필요)
```

★ 사실 오류를 찾으면 그 항목의 판정을 `drop` 또는 `needsRuleDecision` 으로 바꾼다.
  ★ 이미 `accept` 인 항목도 바꿀 수 있다. **그것이 최종 확정 권한이다.**

### 1-3. 최종 확정

★ 모든 항목에 판정이 하나씩 붙어야 한다. 비워 두지 않는다.
★ 판정하지 않은 항목이 남으면 그 사실을 결과 파일에 적는다.

---

## 2. Sonnet 이 하지 않는 일

★ 이 목록을 어기지 말 것. 두 세션이 같은 파일을 동시에 쓰면 작업이 사라진다.

| 금지 | 이유 |
|------|------|
| ★ **문제를 생성하지 않는다** | 생성은 Opus 의 일이다. 검증자가 생성하면 독립성이 깨진다 |
| ★ **규칙을 바꾸지 않는다** | `needsRuleDecision` 으로 올릴 뿐이다. 결정은 건우가 한다 |
| ★ **프롬프트를 바꾸지 않는다** | 규격 설계는 Opus 의 일이다 |
| ★★ **코드를 수정하지 않는다** | ★ Opus 세션이 같은 파일을 편집 중일 수 있다 |
| ★ **문서를 수정하지 않는다** | 05-STATUS / 06-WORKLOG 등은 Opus 세션이 쓴다 |
| ★ **git commit / push 하지 않는다** | 커밋은 Opus 세션이 한다 |
| ★ **npm run verify 를 돌리지 않는다** | dist 를 다시 만들어 Opus 세션과 충돌한다 |
| ★ **Gemini API 를 호출하지 않는다** | 일 한도를 Opus 세션과 나눠 쓴다. 예고 없이 쓰면 한도가 사라진다 |

★★ **Sonnet 이 쓰는 파일은 판정 결과 파일 하나뿐이다.**

---

## 3. 입출력 파일 경로

★ 두 세션이 같은 파일을 쓰지 않게 경로를 나눈다.

```
Opus 가 쓴다 / Sonnet 은 읽기만 한다
  data/pipeline/sonnet/sonnet-backcheck-questions.json ← ★★ 역검증 입력. 정답이 없다
  data/pipeline/quarantine/quarantine-review.txt       ← ★ 사람이 읽는 격리 목록
  data/pipeline/quarantine/quarantine-decisions.json   ← ★ 판정 서식 (빈 칸)
  data/pipeline/processed/*.json                        ← 원본 배치 (직접 수정 금지)

★★ Sonnet 이 쓴다 / Opus 는 읽기만 한다
  data/pipeline/sonnet/sonnet-backcheck-answers.json   ← ★★ 1단계 산출물 (역검증 답)
  data/pipeline/quarantine/sonnet-decisions.json       ← ★★ 2단계 산출물 (최종 판정)
  data/pipeline/quarantine/sonnet-notes.md             ← (선택) 판정 근거 메모
```

★★ **Sonnet 이 쓰는 파일은 이 두(세) 개뿐이다.** 다른 파일을 건드리지 않는다.

★ 디렉터리를 나눈 근거 — `sonnet/` 은 역검증(1단계), `quarantine/` 은 최종 판정(2단계)이다.
  ★ 두 단계 사이에 Opus 가 `pipeline-sonnet.mjs backcheck` 를 돌린다.
    ★ 그 사이에 같은 디렉터리를 양쪽이 쓰면 어느 파일이 최신인지 헷갈린다.

★ `quarantine-decisions.json` 을 **직접 수정하지 않는다.** 그것은 Opus 가 만든 서식이다.
★ 내용을 복사해서 `sonnet-decisions.json` 으로 새로 쓴다.
★ 근거 — 서식 파일을 덮어쓰면 Opus 가 서식을 다시 만들 때 판정이 지워진다.
  실제로 export 스크립트는 `quarantine-decisions.json` 이 이미 있으면 덮어쓰기를 거부한다.

---

## 4. Sonnet 세션 시작 절차

★ 지금 어느 단계인지부터 확인한다.

```
node scripts/pipeline-sonnet.mjs status
```

### ★ 1단계 — 역검증 (R014 신설)

```
1. 질문 파일을 읽는다  ★ 정답이 없다. 그것이 의도다
     cat data/pipeline/sonnet/sonnet-backcheck-questions.json

2. ★★ 질문만 보고 답을 맞힌다. 한 건씩.
   ★ 우리 정답을 찾아보지 않는다. processed/*.json 을 열지 않는다
   ★ 그리고 질문 문장 자체를 검토해 세 배열을 채운다

3. ★★ sonnet-backcheck-answers.json 을 쓴다 (1-0 의 표)

4. ★ 요약을 출력한다 — 답한 건수 / ambiguous 건수 /
     세 배열에 무언가를 적은 건수. ★ Opus 세션에 그대로 전달할 수 있게
```

### ★ 2단계 — 재판정과 사실 검토

> ★ Opus 가 `pipeline-sonnet.mjs backcheck` 를 돌린 **뒤에** 시작한다.

```
1. 격리 목록을 읽는다
     cat data/pipeline/quarantine/quarantine-review.txt

2. 판정 서식을 읽는다
     cat data/pipeline/quarantine/quarantine-decisions.json

3. ★ 사실 검토 대상을 읽는다 (역검증은 통과했으나 확정 전인 것)
     node scripts/pipeline-quarantine.mjs --list --reason=awaiting_final_review
     (★ Gemini 를 호출하지 않는 읽기 전용 스크립트다)

4. 항목마다 판정한다

5. ★★ sonnet-decisions.json 을 쓴다 (아래 5장 서식)

6. ★ 요약을 화면에 출력한다 — pass / drop / needsRuleDecision 건수와
     needsRuleDecision 항목의 목록. ★ Opus 세션에 그대로 전달할 수 있게.
```

---

## 5. 결과 파일 서식 — ★ Opus 가 읽는 형식

`data/pipeline/quarantine/sonnet-decisions.json`

```json
{
  "_meta": {
    "decidedBy": "claude-sonnet-5",
    "decidedAt": "2026-09-10T12:00:00.000Z",
    "round": "R013",
    "reviewedQuarantine": 12,
    "reviewedAccept": 38,
    "note": "★ 자유 서술. 판정 전반에 대한 소견"
  },
  "decisions": [
    {
      "ref": "284786430b3946bb",
      "verdict": "pass",
      "reason": "★ 격리 사유가 틀렸다. 쐐기문자는 설형문자의 동의어이므로 정답 배열에 있어야 했다",
      "addAnswers": ["쐐기문자"]
    },
    {
      "ref": "551f7105757d6306",
      "verdict": "drop",
      "reason": "사실 오류다. Hydrargyrum 은 수은의 라틴어명이고 수성과 무관하다"
    },
    {
      "ref": "5a1b6c6b5fda7dc7",
      "verdict": "needsRuleDecision",
      "reason": "★ 문제는 정상이다. Gemini 가 '상형 문자' 로 답했고 그것은 상위 개념이다. g4 규칙이 상위 개념을 정답 배열에 넣지 못하게 한다 — 규칙을 정할 문제다",
      "ruleQuestion": "★ 상위 개념을 정답 배열에 허용할 것인가. 허용하면 '문자'도 정답이 되는 문제가 생긴다"
    }
  ],
  "unjudged": [
    { "ref": "...", "why": "★ 판정하지 못한 이유" }
  ]
}
```

필드 규칙

| 필드 | 필수 | 내용 |
|------|------|------|
| `ref` | ★ 필수 | 항목의 `sourceRef`. 격리 목록에 적혀 있다 |
| `verdict` | ★ 필수 | `pass` / `drop` / `needsRuleDecision` 셋 중 하나. ★ 다른 값을 쓰지 않는다 |
| `reason` | ★ 필수 | ★ 한 줄로 끝내지 말 것. **무엇을 근거로 그렇게 판정했는가**를 적는다 |
| `addAnswers` | 선택 | ★ `pass` 이면서 정답 배열에 추가할 표기가 있는 경우에만 |
| `ruleQuestion` | ★ `needsRuleDecision` 이면 필수 | ★ 건우가 답할 수 있는 형태의 질문으로 쓴다 |
| `unjudged` | 선택 | ★ 판정하지 못한 것이 있으면 반드시 적는다. 조용히 빼지 않는다 |

---

## 6. Opus 세션이 결과를 반영하는 방법

```
node scripts/pipeline-sonnet.mjs backcheck --dry-run   ★ 1단계 답을 판정한다
node scripts/pipeline-sonnet.mjs backcheck
node scripts/pipeline-apply-decisions.mjs --dry-run    ★ 2단계 판정을 반영한다
node scripts/pipeline-apply-decisions.mjs
```

★ `pipeline-sonnet.mjs backcheck` 가 하는 일
- `sonnet-backcheck-answers.json` 을 읽어 **코드가** 일치 여부를 판정한다
- ★ Gemini 경로와 **같은 함수**(`judgeBackcheck`)를 쓴다. 조건을 같게 유지한다
- 불일치·질문 문장 문제 → 격리 / 통과 → ★ `awaiting_final_review` (아직 accept 가 아니다)
- ★ `answer` 가 빈 항목이 있으면 **멈춘다.** 조용히 넘기지 않는다

★ 이 스크립트가 하는 일
- `sonnet-decisions.json` 을 읽어 각 항목의 `finalDecision` 을 채운다
- `pass` → `verdict='accept'`, `addAnswers` 가 있으면 정답 배열에 합친다
- `drop` → `verdict='reject'`. ★ **여기서 처음으로 폐기가 일어난다.**
  ★ 그 전 단계에는 폐기 권한이 없다
- `needsRuleDecision` → `verdict` 는 `quarantine` 으로 두고 `needsRuleDecision=true`.
  ★ 적재하지 않는다. 건우 결정을 기다린다
- ★ `ref` 가 배치에 없으면 오류로 멈춘다. 조용히 넘기지 않는다

---

## 7. 두 세션 병행 운용 — ★ 효율적인 배치 (Q-74)

건우 질문: "터미널 2개를 운용하는 것이다. 3개 모델을 병행하든지 효율적인 것을 찾아 달라."

★ 판단 — **동시에 돌리지 않는다. 번갈아 돌린다.**

```
[Opus 터미널]                          [Sonnet 터미널]
 1. 생성 (50~200건)
 2. Gemini 역검증·규칙·중복 (표시만)
 3. 격리 목록 export
 4. ★ 대기 ─────────────────────────→  5. 격리 재판정 + 사실 오류 검토
                                        6. sonnet-decisions.json 작성
 7. ←──────────────────────────────── 완료 알림
 8. 판정 반영 + 적재
 9. 다음 배치 생성 …
```

★ 동시 실행을 하지 않는 근거
1. ★ **Gemini 일 한도를 나눠 쓴다.** 두 세션이 같이 호출하면 한쪽이 예고 없이 429 를 맞는다.
   ★ 그래서 Gemini 호출은 Opus 세션만 한다 (2장 금지 목록)
2. ★ **dist 가 하나다.** `npm run build` 가 같은 디렉터리를 덮어쓴다.
   한쪽이 빌드하는 중에 다른 쪽이 스크립트를 돌리면 깨진 dist 를 읽는다
3. ★ **git 작업 트리가 하나다.** 두 세션이 같이 커밋하면 서로의 변경이 섞인다

★ 그럼 터미널 2개의 이점은 무엇인가
- ★ **세션 컨텍스트가 분리된다.** Sonnet 세션은 생성 프롬프트·코드를 볼 필요가 없다.
  격리 목록만 본다. ★ 그래서 판정이 생성 의도에 오염되지 않는다
- ★ **Opus 사용량을 아낀다.** 개별 항목 판정은 건수가 많고 반복적이다.
  Sonnet 으로 넘기면 Opus 사용량을 생성·설계에 쓸 수 있다
- ★ 배치가 여러 개일 때 Opus 가 배치 N+1 을 생성하는 동안 Sonnet 이 배치 N 을 판정한다.
  ★ 단, 그때도 Sonnet 은 Gemini 를 호출하지 않고 빌드하지 않는다

★ 3개 모델 병행에 대한 판단 — **이미 3개 병행이다.**
  Gemini 는 API 호출이므로 터미널이 필요 없다. 터미널은 2개가 맞다.

---

## ★★ 7-2. Gemini 표본 감사 (R014 신설 / Q-81)

★ Gemini 는 이제 **필수 경로에 없다.** 안 돌아도 파이프라인이 진행된다.

```
node scripts/pipeline-audit.mjs --plan          무엇을 감사할지만 본다
node scripts/pipeline-audit.mjs --sample 20     ★ 호출 2회로 20건
```

★ 무엇을 하는가 — Sonnet 이 역검증한 항목 중 표본을 뽑아 **Gemini 로 다시 역검증**하고
두 판정이 같은지 본다.

★★ **불일치가 나오면 무엇을 하는가 — 개별 문제를 뒤집지 않는다.**

★ 근거 — Gemini 가 Sonnet 과 다르다는 것이 "Sonnet 이 틀렸다" 를 뜻하지 않는다.
  실측이 반대 방향을 가리킨다 (R010 정상 6건 전부 오탈락 / R012 탈락 3건 중 2건 오탈락).
  ★ 성능이 더 낮은 쪽의 판정으로 더 높은 쪽을 덮으면 품질이 내려간다.

★ 그래서 **Sonnet 판정 품질의 신호**로만 쓴다.
- 불일치율이 기준(20%) 안이면 → Sonnet 이 한쪽으로 치우치지 않았다는 근거가 된다
- 기준을 넘으면 → ★ 멈추고 **사람이 표본을 읽는다.** 셋 중 하나다 —
  (a) 문제 품질이 실제로 낮다 (b) Sonnet 판정이 느슨해졌다 (c) ★ Gemini 오판

★ 기준 20% 의 근거: R012 정상 탈락률 1~2% / R010 오탈락 사태 35%. 그 사이다.
  ★ 5% 같은 낮은 값으로 잡으면 Gemini 자체 오판만으로 매번 멈춘다.

★★ 이 스크립트는 **배치 파일을 수정하지 않는다.** 읽기 전용이다.
  ★ 회차별 불일치율이 `data/pipeline/audit/gemini-audit-results.json` 에 쌓인다.

★★ **Sonnet 세션은 이 스크립트를 돌리지 않는다.** Gemini 호출은 Opus 세션만 한다 (2장).

---

## 8. 현재 상태 (R014 기준)

★ R013 에서는 별도 Sonnet 세션을 열지 않았다.
근거 — 건우 확정 방침이 "샘플만 조금씩 뽑아서 작업 규격을 먼저 정한다" 였다.
★ 대신 같은 세션에서 생성 단계와 검토 단계를 분리하고, 자기 검토의 신뢰도가 낮다는 것을 밝혔다.

★★ **R014 에서 이 문서가 지시하는 흐름이 완성되었다.**

| 무엇 | 상태 |
|------|------|
| `pipeline-sonnet.mjs export / backcheck / status` | ★ 완료 |
| `pipeline-apply-decisions.mjs` | ★ 완료 (R013) |
| `pipeline-audit.mjs` (Gemini 표본 감사) | ★ 완료 |
| Gemini 역검증을 선택 단계로 | ★ 완료 (`--backcheck=none` 이 기본값) |

★★ **아직 실행하지 않았다.** R014 는 게임 트랙(Phase 3)이 본체였고,
건우 확정 방침이 "구조 변경만 하고 대량 실행은 하지 않는다" 였다.

★ R013 의 50건이 `pipeline-sonnet.mjs status` 에서 **역검증 대기 50건**으로 잡힌다.
  ★ 새 구조로 처리할 수 있음이 확인되었다. 실제 처리는 다음 라운드다.

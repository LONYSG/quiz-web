# 14. 문제 생성 세션 지시서 (2단계 — 소재를 받아 문제를 만든다)

> ★ 이 문서는 **소재 생성과 문제 생성을 다른 세션이 맡을 때** 문제 세션의 지시서다.
> ★ R018 작업 C 로 작성했다. 근거는 R017 실측이다 — 아래 0장.
> ★ 이 문서를 문제 세션의 첫 입력으로 그대로 붙여 넣으면 된다.
> ★ 역검증 세션(Sonnet)의 지시서는 [12-SONNET-SESSION.md](12-SONNET-SESSION.md) 다. 역할이 다르다.

---

## 0. ★★ 왜 세션을 나누는가

**R017 에서 프롬프트 B 의 거절 경로가 한 번도 시험되지 않았다.**

```
R017: 소재 200개 → 문제 200개.  ok:false 0건
```

★ 거절이 0건인 것을 "프롬프트가 잘 작동한다" 로 읽으면 안 된다.
**소재를 만든 주체와 문제를 만든 주체가 같은 세션이었기 때문**이다.
내가 만든 소재를 내가 받았으니 카테고리 불일치가 날 수가 없었다.

★ 프롬프트 B 의 주된 거절 사유는 이것이다 —

> 소재가 카테고리에 맞지 않을 때 **카테고리에 맞추려고 소재를 변형하지 마십시오.**
> 소재의 의미를 바꾸거나 다른 소재로 갈아타는 것은 금지입니다. → `ok: false`

이 경로는 **자기가 만들지 않은 소재를 받았을 때만** 실제로 쓰인다.

### ★ R018 에서 확인한 것

R018 은 세션을 실제로 나누지는 않았지만, **순서를 나눴다** —
소분류 20개의 소재를 **전부 만든 뒤에** 문제로 넘어갔다.
그러자 거절이 처음으로 나왔다.

```
r018 energy/4#010  소재 "그린워싱 + 실제보다 친환경으로 보이게 하는 행위"
  → ok:false
  사유: 소분류 'energy/4 환경 협약·오염' 은 협약과 오염 현상을 다루는 자리인데
        그린워싱은 기업의 광고·마케팅 행태다. 억지로 맞추려면 소재의 뜻을 바꿔야 한다.
```

★ 순서를 나눈 것만으로도 효과가 있었다는 뜻이다. **세션을 나누면 더 늘어날 것으로 추정한다.**
★ 다만 1건은 표본이 너무 작다. 실제 거절률은 세션을 나눠 돌려 봐야 안다.

---

## 1. 두 단계의 경계

```
  [1단계] 소재 세션
     입력   소분류 + 경계 설명 + 금지 목록      (scripts/seeds-banlist.mjs 가 만들어 준다)
     프롬프트  pipeline/prompts/seed-v1.md
     출력   tmp/<round>/seeds/<slug>.json
        ↓  node scripts/seeds-ingest.mjs <파일>
     저장   data/pipeline/seeds/<midKey>.json          (소재 이력, 영구 누적)
            data/pipeline/generated/<round>/<slug>.json (question.status = "pending")

  [2단계] 문제 세션   ★ 이 문서가 다루는 단계
     입력   data/pipeline/generated/<round>/<slug>.json 의 pending 항목
     프롬프트  pipeline/prompts/question-v2.md
     출력   tmp/<round>/questions/<slug>.json
        ↓  node scripts/seeds-attach.mjs <파일>
     저장   같은 generated 파일에 question 을 채워 넣는다
```

### ★★ 두 세션이 같은 파일을 동시에 쓰지 않게 하는 방법

| 파일 | 1단계 | 2단계 |
|------|-------|-------|
| `tmp/<round>/seeds/*.json` | **쓴다** | 읽지 않는다 |
| `tmp/<round>/questions/*.json` | 건드리지 않는다 | **쓴다** |
| `data/pipeline/generated/<round>/*.json` | `seeds-ingest` 가 **만든다** | `seeds-attach` 가 **채운다** |
| `data/pipeline/seeds/<midKey>.json` | `seeds-ingest` 가 쓴다 | `seeds-attach` 가 쓴다 |

★ 두 세션이 **같은 소분류를 동시에 잡으면 안 된다.** 코드가 다음으로 막는다 —

- `seeds-ingest.mjs` 는 `_state.json` 에 이미 반영된 배치를 **건너뛴다** (`--force` 로만 덮어쓴다)
- `seeds-attach.mjs` 는 이미 문제가 붙은 소재에 **예외를 던진다.** 덮어쓰지 않는다
- ★ 둘 다 `seedId` 로 짝을 맞춘다. **순서에 기대지 않는다** —
  문제 세션이 일부만 돌려주거나 순서를 바꿔 돌려줄 수 있기 때문이다

★ 그래도 안전한 운용은 **소분류 단위로 나누는 것**이다.
소재 세션이 20개를 다 끝낸 뒤 문제 세션이 시작하면 충돌 자체가 없다.

---

## 2. 문제 세션이 하는 일

### 2-1. 입력 확인

```bash
# 문제가 아직 붙지 않은 소재를 본다
node -e "
const fs=require('fs');const d='data/pipeline/generated/r018';
for(const f of fs.readdirSync(d)){ if(f.startsWith('_'))continue;
  const j=JSON.parse(fs.readFileSync(d+'/'+f,'utf8'));
  const p=j.items.filter(i=>i.question?.status==='pending');
  if(p.length) console.log(j._meta.subId, j._meta.categoryPath, '대기', p.length);
}"
```

### 2-2. 프롬프트 B 를 적용한다

`pipeline/prompts/question-v2.md` 를 그대로 따른다. **임의로 고치지 않는다.**

입력으로 주어지는 것은 두 가지뿐이다.

```
[대분류 > 중분류 > 소분류]     ← generated 파일의 _meta.categoryPath
소재 하나                      ← items[].seed  (subject / aspect / knowledgePoint)
```

★★ **카테고리와 소재는 입력이다. 바꾸지 마라.**
소재가 카테고리에 맞지 않으면 **억지로 맞추지 말고 `ok: false`** 로 돌려준다.

### 2-3. 출력 파일을 쓴다

`tmp/<round>/questions/<slug>.json`

```json
{
  "round": "r018",
  "subId": "myth/2",
  "questionPrompt": "question-v2",
  "generator": "claude-opus-5",
  "items": [
    { "seedId": "myth/2#001",
      "question": {
        "ok": true,
        "question": "…", "answer": "…", "acceptedAnswers": [],
        "accessibility": 4, "difficulty": 2, "worthKnowing": 4,
        "explanation": "…",
        "selfCheck": { "answerInQuestion": false, "uniqueAnswer": true, "questionSelfConsistent": true }
      } },
    { "seedId": "myth/2#002",
      "question": { "ok": false, "rejectReason": "★ 구체적으로 적는다" } }
  ]
}
```

★ `seedId` 는 **반드시 입력에 있던 값 그대로**여야 한다. 새로 만들지 않는다.
★ 일부만 돌려줘도 된다. 나머지는 `pending` 으로 남는다.

### 2-4. 반영한다

```bash
node scripts/seeds-attach.mjs --dry-run tmp/r018/questions/myth-2.json   # 먼저 확인
node scripts/seeds-attach.mjs tmp/r018/questions/myth-2.json
```

`seeds-attach.mjs` 는 형식이 어긋나면 **예외를 던진다.** 조용히 통과시키지 않는다 —
`ok:true` 인데 정답이 비었거나, 점수가 1~5 정수가 아니거나, `selfCheck` 가 없으면 거부한다.

---

## 3. 문제 세션이 **하지 않는** 일

| 하지 않는 것 | 누가 하는가 |
|--------------|------------|
| ★ 소재를 새로 만들거나 고치기 | 소재 세션 (프롬프트 A) |
| ★ 카테고리를 바꾸기 | 아무도. 카테고리는 입력이다 |
| ★ 중복 판정 | Gemini (`scripts/seeds-dupe-judge.mjs`) |
| ★ 역검증·사실 검토·최종 확정 | Sonnet ([12-SONNET-SESSION.md](12-SONNET-SESSION.md)) |
| ★★ **DB 적재** | 사람 승인 뒤 `pipeline-load.mjs --round <round>` |

★★ **자기 생성분을 자기가 검증하지 않는다** (D-043). 문제 세션은 문제를 만들 뿐이다.

---

## 4. 끝난 뒤 돌릴 것

```bash
node scripts/seeds-check.mjs r018 --against r017   # 규칙 검사 + 중복 후보 (API 0회)
node scripts/seeds-dupe-judge.mjs r018             # 후보만 Gemini 판정
node scripts/seeds-stats.mjs r018                  # 집계
```

★ `seeds-check.mjs` 가 보는 것 —

| 검사 | 처리 |
|------|------|
| 정답 정규화 충돌 | 보고만. 같은 답이라도 다른 문제일 수 있다 |
| 힌트가 만들어지는가 / 정답과 같아지는가 | `shared` 의 `generateHint()` 를 그대로 쓴다 |
| ★ 질문에 정답이 노출됐는가 | **낱말 경계**로 `expose` / `exposeSuspect` 를 가른다 (D-081) |
| 서술형·긴 정답 / 숫자 정답 비중 | 보고만 |

★★ `exposeSuspect` 로 격리된 것은 **자동으로 버리지 않는다. 사람이 본다.**
R017 에서 격리된 2건 중 하나는 조사 '은' 과 겹친 오탐이었고, 하나는 진짜 노출이었다.
자동 판정으로는 둘이 똑같이 생겼다.

---

## 5. 현재 상태 (R018 기준)

| 라운드 | 소분류 | 소재 | 문제 성공 | 거절 | 격리 | 상태 |
|--------|--------|------|-----------|------|------|------|
| r017 | 20 (넓은 곳) | 200 | 199 | 0 | 1 | ★ 적재 승인 대기 |
| r018 | 20 (좁은 곳) | 194 | 188 | 1 | 5 | ★ 적재 승인 대기 |

★ 두 라운드 모두 **소재와 문제를 같은 세션이 만들었다.** 세션을 실제로 나눠 돌린 적은 아직 없다.
★ 다음 라운드에 나눠 돌리면 이 문서가 처음으로 실전에서 쓰인다.

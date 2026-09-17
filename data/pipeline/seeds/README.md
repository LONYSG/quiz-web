# 소재(seed) 저장소

> **R017에서 신설했다.** 생성 구조가 `카테고리 → 문제 여러 개` 에서
> `소분류 → 소재 여러 개 → 소재당 문제 1개` 로 바뀌면서 필요해진 저장소다.

---

## 1. 왜 소재를 따로 저장하는가

두 모델에게 같은 카테고리로 100건씩 만들게 했더니 **정답이 겹치는 쌍이 38%** 나왔다.
겹친 것은 전부 그 분야의 대표 소재였다 — 유리 가가린 / 닐 암스트롱 / 히치콕 / 컬링 / 체크메이트.

**다양성의 병목은 문장 표현이 아니라 소재 선택이다.**
카테고리만 주는 한 프롬프트를 아무리 고쳐도 같은 소재로 돌아온다.

그래서 소재를 먼저 뽑아 고정하고, 소재 하나당 문제 하나를 만든다.
그러면 **이미 쓴 소재를 다음 생성에 금지 목록으로 넣을 수 있다.**
이 저장소가 그 금지 목록의 원천이다.

---

## 2. 파일 구조

```
data/pipeline/seeds/
├─ README.md            이 문서
├─ _state.json          ★ 라운드별 진행 상태. 중단·재개의 근거
└─ <midKey>.json        ★ 중분류 하나당 파일 하나 (kr-history.json, art.json …)

data/pipeline/generated/<round>/
├─ <midKey>-<n>.json    ★ 소분류별 생성 결과 (소재 + 그 소재로 만든 문제 본문)
└─ _subject-types.json  소재 유형 분포 (측정용)
```

### 왜 중분류당 한 파일인가

| 대안 | 문제 |
|------|------|
| 소분류당 한 파일 | 파일이 297개가 되어 git 로그를 읽을 수 없다. **그리고 소분류 이름에 공백·가운뎃점·괄호가 들어가 파일명으로 위험하다** (`한글 자모·맞춤법`, `고전(고대~18세기)`) |
| 전체 한 파일 | 한 라운드에 소분류 20개를 돌리면 같은 파일을 20번 덮어쓴다. 중간에 끊기면 무엇이 저장됐는지 알 수 없고, diff 가 매번 수천 줄이 된다 |
| **중분류당 한 파일 (채택)** | 파일 63개. 한 번에 쓰는 파일이 하나뿐이라 원자성이 확보된다. 파일명이 ASCII 다 |

### 왜 문제 본문은 별도 디렉터리인가

**소재 이력은 영구 누적이고, 문제는 라운드 산출물이다. 수명이 다르다.**
소재 파일에 문제 본문까지 담으면 금지 목록을 읽을 때마다 쓸데없이 큰 파일을 읽게 된다.
소재 파일에는 그 소재가 어떤 문제가 됐는지 **참조와 결과만** 남긴다.

---

## 3. 소분류 식별자

소분류 이름을 파일명이나 키로 쓰지 않는다. 별도 ID를 쓴다.

```
subId   "kr-language/1"     중분류 키 / 그 중분류 안에서의 1-based 순번
slug    "kr-language-1"     파일명·디렉터리용
```

정본은 `pipeline/src/categories.ts` 의 `MIDS[].subs` 배열 순서다.

> **위험과 대응**: `subs` 배열의 순서가 바뀌면 번호가 밀린다.
> 그래서 저장할 때 **소분류 이름을 항상 함께 적고**, 읽을 때 현재 트리와 대조한다.
> 어긋나면 조용히 넘어가지 않고 예외를 던진다 (`pipeline/lib/subid.mjs` 의 `assertSubName`).

---

## 4. 금지 목록의 범위

**같은 소분류 전체 이력이다.** 최근 N개가 아니다.

| 항목 | 내용 |
|------|------|
| `usedSeeds` | 그 소분류에서 쓴 `subject` + `aspect` + `knowledgePoint` **전부** |
| `usedAnswers` | 그 소분류의 대표 정답 전부 (기존 DB 문제 + 이 파이프라인 생성분) |

최근 N개만 넣지 않는 이유: **Seed 중복은 시간적 중복이 아니다.**
1번째에 "세종대왕 + 측우기" 를 만들고 40번째에 "장영실 + 측우기" 가 나올 때,
1번째가 보이지 않으면 막을 수 없다.

다른 소분류의 이력은 넣지 않는다. 전역 중복은 4차 단계(LLM 판정)에서 처리한다.

### `usedAnswers` 는 자동 금지 목록이 아니다

**같은 답이라도 knowledgePoint 가 다르면 그 소재를 만들어도 된다.**
`usedAnswers` 는 "이 답이 이미 있으니 knowledgePoint 를 특히 주의해서 비교하라" 는 **신호**일 뿐이다.

그래서 이 저장소의 코드는 `usedAnswers` 로 아무것도 걸러내지 않는다. **목록을 건네줄 뿐이다.**
판단은 프롬프트 A를 실행하는 모델이 한다.

> 실측 사례 (R017): `football/2` 에서 "1950년 마라카낭의 비극" 소재는
> 정답이 기존 문제와 같은 "우루과이" 가 될 것이 분명했지만,
> 묻는 지식(1950년 대회의 이변 vs 1930년 1회 개최국)이 완전히 달라 일부러 살렸다.

---

## 5. 중복 대응 4단계

| 단계 | 무엇을 | 어디서 |
|------|--------|--------|
| 1차 | 소재 목록 **안에서** knowledgePoint 비교 | 생성 모델(프롬프트 A)이 수행 |
| 2차 | **기존 소재 이력**과 knowledgePoint 비교 | 이 저장소가 금지 목록을 제공 |
| 3차 | 문제 생성 후 **정규화한 정답**으로 후보 검색 | `scripts/seeds-check.mjs` |
| 4차 | **후보만** LLM에게 "같은 문제인가" 판정 | `scripts/seeds-dupe-judge.mjs` (Gemini) |

★★ R018 에서 **3방향으로 늘렸다** — 라운드 안쪽 / 다른 라운드 / 기존 DB.
★ 근거: R017 은 한 라운드 안에 소분류 20개밖에 없어 **소분류 사이 중복을 잴 수 없었다.**
  R018 에서 `--against r017` 로 재니 3쌍이 나왔고 그중 1쌍이 실제 중복이었다.

`knowledgePoint` 는 **최종 판정 근거가 아니라 후보 제거 신호**다.
같아 보여도 실제 문제는 다를 수 있고, 달라 보여도 실제로는 같을 수 있다.

문자 유사도는 판정 근거에서 이미 제거했다 (D-047).
실제 중복 쌍의 2-그램 자카드가 0.13~0.50 이어서 임계값을 어디에 두어도 갈리지 않는다.

---

## 6. 쓰는 법

★★ R018부터 **소재 생성과 문제 생성이 두 단계로 나뉜다.** 다른 세션이 맡을 수 있게 하기 위해서다
(근거와 절차는 [docs/14-GEN-SESSION.md](../../../docs/14-GEN-SESSION.md)).

```bash
# ── 준비 (1회)
node scripts/seeds-init-from-db.mjs            기존 정답을 usedAnswers 초기값으로 (DB 읽기만)

# ── 1단계: 소재
node scripts/seeds-banlist.mjs --file tmp/r018/targets.txt --count 10
                                               ★ 프롬프트 A 입력(카테고리+경계+금지 목록) 조립
node scripts/seeds-ingest.mjs tmp/r018/seeds/myth-2.json
                                               소재만 넣는다. 문제는 pending 으로 남는다

# ── 2단계: 문제
node scripts/seeds-attach.mjs --dry-run tmp/r018/questions/myth-2.json
node scripts/seeds-attach.mjs tmp/r018/questions/myth-2.json

# ── 검사·판정·집계
node scripts/seeds-check.mjs r018 --against r017   규칙 검사 + 중복 후보 (API 0회, DB 읽기만)
node scripts/seeds-dupe-judge.mjs r018            ★ 후보만 Gemini 판정 (생성 모델과 달라야 한다)
node scripts/seeds-discard.mjs --round r018 --ref "myth/2#003" --reason "…" --by "…"
                                               ★ 중복으로 판정된 것을 격리 (지우지 않는다)
node scripts/seeds-stats.mjs r018                 집계
```

★ `seeds-ingest.mjs` 는 `_state.json` 에 이미 반영된 배치를 건너뛴다.
★ `seeds-attach.mjs` 는 이미 문제가 붙은 소재에 **예외를 던진다.** 덮어쓰지 않는다.
**세션이 끊겨도 어디까지 했는지 알 수 있고, 같은 것을 두 번 넣지 않는다.**

> ★ R017 에서는 이 스크립트들의 이름이 `r017-check.mjs` / `r017-dupe-judge.mjs` /
> `r017-stats.mjs` 였다. 라운드 중립 이름(`seeds-*`)으로 바꿨다 — 라운드마다 쓰는 도구인데
> 이름에 라운드가 박혀 있으면 다음 라운드에서 헷갈린다.

---

## 7. 배치 파일 형식

### 1단계 — 소재 파일 (`seeds-ingest.mjs` 가 받는다)

★ `seeds` 배열만 있으면 소재만 넣고 문제는 `pending` 으로 둔다.
★ 옛 형식(`items` 에 `seed` 와 `question` 이 함께 있는 것)도 그대로 받는다 — R017 배치를 위해서다.

```json
{
  "round": "r017",
  "subId": "kr-language/1",
  "subName": "한글 자모·맞춤법",
  "seedPrompt": "seed-v1",
  "questionPrompt": "question-v1",
  "generator": "claude-opus-5",
  "seedResult": {
    "ok": true,
    "requestedCount": 10,
    "actualCount": 10,
    "shortfallReason": null,
    "listedCandidates": 21,
    "droppedForOverlap": [{ "subject": "…", "aspect": "…", "reason": "…" }],
    "consideredButKept": [{ "subject": "…", "aspect": "…", "reason": "…" }]
  },
  "items": [
    {
      "seed": { "subject": "…", "aspect": "…", "knowledgePoint": "…" },
      "question": { "ok": true, "question": "…", "answer": "…", "acceptedAnswers": [],
                    "accessibility": 5, "difficulty": 2, "worthKnowing": 4,
                    "explanation": "…",
                    "selfCheck": { "answerInQuestion": false, "uniqueAnswer": true,
                                   "questionSelfConsistent": true } }
    }
  ]
}
```

`ingest` 는 형식을 검사하고 어긋나면 **예외를 던진다.** 조용히 통과시키지 않는다.

- `listedCandidates` — 프롬프트 A가 (1)단계에서 **나열한** 후보 대상 수.
  선택률을 재기 위한 값이다. 이것이 없으면 "대표 소재로 쏠렸는가"를 사후에 알 수 없다.
- `droppedForOverlap` — 금지 목록이나 경계 때문에 뺀 소재. **이유를 반드시 적는다.**
- `consideredButKept` — 겹쳐 보이지만 일부러 살린 소재.
  "관련 있음 ≠ 중복" 원칙이 실제로 작동했는지 보는 근거다.
  ★★ R018 실측: 이렇게 살린 2건 중 1건(`olympic/4#002` 쿠베르탱)이 LLM 판정에서
  `same` 으로 뒤집혔다. **살린 판단이 늘 옳은 것은 아니다.**
- `remainingUsable` / `estimatedCeiling` — ★ R018 에서 추가했다.
  나열 후보 가운데 **아직 쓸 만한 것이 몇 개 남았는지**와 그 소분류의 상한 추정이다.
  ★ 이것이 없으면 "10개를 채웠다" 는 사실만 남고 **고갈 지점을 알 수 없다.**

### 2단계 — 문제 파일 (`seeds-attach.mjs` 가 받는다)

```json
{
  "round": "r018",
  "subId": "myth/2",
  "questionPrompt": "question-v2",
  "generator": "claude-opus-5",
  "items": [
    { "seedId": "myth/2#001", "question": { "ok": true, "question": "…", "answer": "…",
      "acceptedAnswers": [], "accessibility": 4, "difficulty": 2, "worthKnowing": 4,
      "explanation": "…",
      "selfCheck": { "answerInQuestion": false, "uniqueAnswer": true, "questionSelfConsistent": true } } },
    { "seedId": "myth/2#002", "question": { "ok": false, "rejectReason": "★ 구체적으로" } }
  ]
}
```

★ `seedId` 로 짝을 맞춘다. **순서에 기대지 않는다** — 일부만 돌려줘도 되고 순서를 바꿔도 된다.

---

## 8. DB와의 관계

**이 저장소는 DB에 쓰지 않는다.** 읽기만 한다 (`seeds-init-from-db.mjs`).

DB 적재는 건우 승인 후 별도 라운드에서 한다.

```bash
# ★ --round 를 주면 approved/ 대신 generated/<round>/ 를 읽는다 (R018에서 추가)
npm run pipeline:load -- --round r018 --dry-run
npm run pipeline:load -- --round r017,r018        # 실제 적재
```

### ★★ 적재 전 확인 목록

> ★ 코드가 막아 주는 것과 사람이 봐야 하는 것을 갈라 적는다.
> 코드가 막는 것은 다시 확인할 필요가 없고, 나머지는 반드시 사람이 본다.

**코드가 막는다 — 확인할 필요 없다**

| 항목 | 어떻게 막는가 |
|------|--------------|
| 격리된 문항이 들어가는가 | `question.discarded` 가 있으면 건너뛴다. 중복 판정된 것이 전부 여기 걸린다 |
| 문제가 안 붙은 소재가 들어가는가 | `question.status === 'pending'` 이면 건너뛴다 |
| 소분류 리프를 정확히 가리키는가 | `L3:{midKey}#{순번}` 을 만들어 조회한다. **못 찾으면 조용히 넘기지 않고 건너뛰며 사유를 남긴다** |
| 두 번 적재되는가 | `(source_id, source_ref)` 부분 UNIQUE. `source_ref` 는 `seedId` 다 |
| 정답 표기가 정규화 후 겹치는가 | `dedupeAnswers()` 로 합치고 `answer_norm` UNIQUE 가 최종 방어선이다 |
| 정답 없는 문제가 들어가는가 | 정답 배열이 비면 건너뛰고 사유를 남긴다 |
| 프롬프트 버전이 기록되는가 | `review_queue.reviewer_note` 에 `seedPrompt + questionPrompt` 와 소재를 적는다 |

**사람이 봐야 한다**

| # | 무엇을 | 왜 |
|---|--------|-----|
| 1 | ★★ `sources` 에 `seed-gen` 행이 있는가 | ★ 없으면 로더가 **거부한다.** `migrations/0005_seed_gen_source.sql` 을 먼저 적용해야 한다 |
| 2 | ★★ 중복 판정을 **끝냈는가** | `seeds-dupe-judge.mjs` 를 돌리지 않았으면 중복이 그대로 들어간다. 판정 뒤 `same` 을 격리해야 한다 |
| 3 | ★ `--against` 로 **다른 라운드와도** 대조했는가 | 라운드 하나 안에서만 재면 소분류 사이 중복을 놓친다 (R018 실측: 그렇게 3쌍이 나왔다) |
| 4 | ★ `exposeSuspect` 로 격리된 것을 읽었는가 | 자동 판정으로는 오탐과 진짜 노출이 똑같이 생겼다 |
| 5 | ★ 인명 표기 기준이 확정된 뒤인가 | 나중에 바꾸면 적재된 행을 다시 손봐야 한다 (Q-85) |
| 6 | ★ `--dry-run` 을 먼저 돌렸는가 | 무엇이 들어갈지 눈으로 본다 |
| 7 | ★ 백업을 떴는가 | `npm run db:backup` |

★ 적재해도 곧바로 출제되지는 않는다 — `status` 와 `is_active` 가 분리되어 있다.
`--pending` 을 주면 승인 대기 상태로 들어간다.

### ★ 아직 없는 것

**소분류를 알 수 없는 기존 63건(시드 53 + OpenTDB 10)을 재배정하는 스크립트가 없다.**

- `scripts/pipeline-remap-subs.mjs` 는 이름이 비슷하지만 **파일 배치(JSON)만 고친다.**
  DB의 `questions.category_id` 를 바꾸지 않는다. 확인했다 — 저장소 전체에
  `category_id` 를 UPDATE 하는 코드가 없다.
- ★ 그래서 그 63건은 소분류별 금지 목록에 들어가지 못한다.
  실제로 R018에서 이 구멍이 드러났다 — `world-geo/5`(도시 별칭)에서 "파리"를 뽑으려다,
  기존 `db:21`("빛의 도시…" → Paris)이 금지 목록에 없다는 것을 사람이 알고 있어서 뺐다.
  **사람이 몰랐다면 중복이 났을 것이다.**
- ★ 재배정은 DB 쓰기이므로 승인이 필요하다.

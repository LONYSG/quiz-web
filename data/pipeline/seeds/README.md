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
| 3차 | 문제 생성 후 **정규화한 정답**으로 후보 검색 | `scripts/r017-check.mjs` |
| 4차 | **후보만** LLM에게 "같은 문제인가" 판정 | `scripts/r017-dupe-judge.mjs` (Gemini) |

`knowledgePoint` 는 **최종 판정 근거가 아니라 후보 제거 신호**다.
같아 보여도 실제 문제는 다를 수 있고, 달라 보여도 실제로는 같을 수 있다.

문자 유사도는 판정 근거에서 이미 제거했다 (D-047).
실제 중복 쌍의 2-그램 자카드가 0.13~0.50 이어서 임계값을 어디에 두어도 갈리지 않는다.

---

## 6. 쓰는 법

```bash
# 기존 DB 문제의 정답을 usedAnswers 초기값으로 채운다 (DB 읽기만 한다)
node scripts/seeds-init-from-db.mjs

# 프롬프트 A에 넣을 입력(카테고리 + 경계 + 금지 목록)을 조립해 출력한다
node scripts/seeds-banlist.mjs kr-language/1 --count 10
node scripts/seeds-banlist.mjs --file tmp/r017/targets.txt --count 10

# 생성 결과(배치 파일)를 저장소와 generated/ 에 반영한다
node scripts/seeds-ingest.mjs tmp/r017/batch/kr-language-1.json

# 규칙 검사 + 중복 후보 추리기 (API 0회, DB 읽기만)
node scripts/r017-check.mjs r017

# 후보만 Gemini에게 넘겨 중복 판정 (생성 모델과 다른 모델이어야 한다)
node scripts/r017-dupe-judge.mjs r017

# 파일럿 집계
node scripts/r017-stats.mjs r017
```

`seeds-ingest.mjs` 는 `_state.json` 에 이미 반영된 배치를 건너뛴다.
**세션이 끊겨도 어디까지 했는지 알 수 있고, 같은 배치를 두 번 넣지 않는다.**

---

## 7. 배치 파일 형식

`seeds-ingest.mjs` 가 받는 입력이다. 생성 세션(Opus)이 직접 쓴다.

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

---

## 8. DB와의 관계

**이 저장소는 DB에 쓰지 않는다.** 읽기만 한다 (`seeds-init-from-db.mjs`).

DB 적재는 건우 승인 후 별도 라운드에서 한다.
적재 경로는 기존 `scripts/pipeline-load.mjs` 를 쓰되,
`generated/<round>/` 형식을 읽도록 맞추는 작업이 남아 있다 (다음 라운드).

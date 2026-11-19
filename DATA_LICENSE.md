# 문제 데이터 라이선스

이 저장소는 **코드**와 **퀴즈 문제 데이터**에 서로 다른 라이선스를 적용한다.

## 코드

MIT License. `server/` `client/` `shared/` `pipeline/` `scripts/` `migrations/` 및 설정 파일.

## 퀴즈 문제 데이터

`data/` 아래의 퀴즈 문제 데이터는 **Creative Commons Attribution-ShareAlike 4.0 International
(CC BY-SA 4.0)** 으로 배포한다.

https://creativecommons.org/licenses/by-sa/4.0/

### 출처

| 출처 | `source_id` | 라이선스 | 저작자 표시 의무 | 비고 |
|------|------------|---------|----------------|------|
| 소재 기반 생성 | `seed-gen` | CC BY-SA 4.0 | 없다 | 지금 문제의 대부분. 우리 소재 목록과 프롬프트로 생성하고 판정을 거친 문제다 |
| Gemini 생성 | `gemini-gen` | CC BY-SA 4.0 | 없다 | R011부터 쓴 첫 생성 방식. 우리 프롬프트로 직접 생성한 문제다 |
| 직접 작성 | `manual` | CC BY-SA 4.0 | 없다 | 이 프로젝트에서 작성 (시드 포함) |
| [나무위키 캐치마인드/문제 목록](https://namu.wiki/w/캐치마인드/문제%20목록) | (주제 세트 `source`) | CC BY-NC-SA 2.0 KR | ★ **있다**(세트 source 에 출처) | ★ G048 — **씨앗으로만**: 원문은 `data/pipeline/audit/g048-raw/seed/` 에만 두고, `data/minigame/topics/draw-*.json` 에는 우리가 판정해 고른 단어 + 우리 태그(diff · sub · 변형)만 |

문제별 출처와 라이선스는 데이터베이스의 `questions.source_id` 와 `questions.license` 컬럼,
그리고 `data/` 아래 JSON 파일의 메타데이터에 기록되어 있다.

### ★ 생성 · 직접 작성 문제의 라이선스

생성 문제와 직접 작성 문제에는 CC BY-SA 의무가 **없다.** 그런데도 CC BY-SA 4.0 을 붙였다. 근거는 이렇다.

1. 저장소가 Public 이고, 한 데이터베이스 안에서 라이선스가 갈라지면 데이터셋을 배포할 때 문제 단위로 갈라 내야 한다.
2. 우리가 저작권자이므로 CC BY-SA 로 두어도 잃는 것이 없다.

이것은 의무가 아니라 **우리의 선택**이다. 이 데이터를 사용하거나 다시 가공하는 경우에는
CC BY-SA 4.0 을 유지하고 출처(이 저장소)를 표기해야 한다.

### 다른 라이선스의 데이터가 추가되는 경우

출처마다 라이선스를 문제 단위로 기록하고 이 문서에 추가한다.
서로 다른 라이선스의 문제들은 하나의 모음(collection)을 이루며,
각 문제는 자신의 라이선스를 유지한다.

> 이 문서는 법률 자문이 아니다. 라이선스 해석에 대한 판단이 포함되어 있다.

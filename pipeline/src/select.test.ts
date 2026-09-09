// =============================================================================
// 선별 기준(Q-69)과 R012 회귀 테스트
//
// ★ 여기 있는 케이스는 R011·R012 실측에서 나온 것이다. 임의로 만든 예가 아니다.
// =============================================================================

import { describe, expect, it } from 'vitest';

import { SELECT, selectQuestions, type SelectInput } from './select.js';
import { findDuplicates, questionKey, type DupeInput } from './dedupe.js';
import { sanitizeVariants } from './rules.js';
import { MIDS, MAJORS } from './categories.js';

const q = (ref: string, a: number, d: number, w: number): SelectInput => ({
  ref,
  accessibility: a,
  difficultyScore: d,
  worthKnowing: w,
});

describe('선별 기준 (Q-69 확정)', () => {
  it('기본값이 건우 확정 기준과 같다', () => {
    expect(SELECT.minAccessibility).toBe(3);
    expect(SELECT.tolerateAccessibility).toBe(2);
    expect(SELECT.tolerateRatio).toBeCloseTo(0.05);
    // ★ 난이도로 걸러내지 않는다. 이 값이 0 이 아니면 확정 규칙을 어긴 것이다
    expect(SELECT.minDifficulty).toBe(0);
  });

  it('★ 접근성 3~5 는 통과한다 (건우: "3~5 정도면 아주 좋다")', () => {
    const r = selectQuestions([q('a', 3, 1, 4), q('b', 4, 2, 4), q('c', 5, 3, 4)]);
    expect(r.passed).toBe(3);
  });

  it('★ 접근성 1 은 제외한다 (건우: "1은 없는 게 낫고")', () => {
    const r = selectQuestions([q('a', 1, 3, 5)]);
    expect(r.passed).toBe(0);
    expect(r.results[0]!.reasons).toContain('accessibility_too_low');
  });

  it('★★ 난이도가 높아도 걸러내지 않는다 (건우 확정)', () => {
    // 난이도 5 / 접근성 3 — R011에서 내가 걸러야 한다고 잘못 판단한 유형이다
    const r = selectQuestions([q('a', 3, 5, 4)]);
    expect(r.passed).toBe(1);
  });

  it('★★ 난이도가 낮아도 알 가치가 낮으면 제외한다', () => {
    // 실측: "1982년 KBO 최고 타율 0.412 선수?" → 접근성 3 / 난이도 2 / 알 가치 1
    const r = selectQuestions([q('백인천', 3, 2, 1)]);
    expect(r.passed).toBe(0);
    expect(r.results[0]!.reasons).toContain('worth_too_low');
  });

  it('★ 접근성 2 는 총량 상한(5%) 안에서만 통과한다', () => {
    // 100건 중 접근성 2 가 10건 → 상한 5건만 통과
    const items: SelectInput[] = [];
    for (let i = 0; i < 90; i += 1) items.push(q(`ok${i}`, 4, 2, 4));
    for (let i = 0; i < 10; i += 1) items.push(q(`t${i}`, 2, 2, 4));
    const r = selectQuestions(items);
    expect(r.tolerate.allowed).toBe(5);
    expect(r.tolerate.passed).toBe(5);
    expect(r.tolerate.dropped).toBe(5);
    expect(r.passed).toBe(95);
  });

  it('★ 접근성 2 중에서는 알 가치가 높은 것을 남긴다', () => {
    const items: SelectInput[] = [];
    for (let i = 0; i < 19; i += 1) items.push(q(`ok${i}`, 5, 2, 4));
    items.push(q('낮은알가치', 2, 2, 3));
    items.push(q('높은알가치', 2, 2, 5));
    const r = selectQuestions(items);
    expect(r.tolerate.allowed).toBe(1);
    const passedRefs = r.results.filter((x) => x.pass).map((x) => x.ref);
    expect(passedRefs).toContain('높은알가치');
    expect(passedRefs).not.toContain('낮은알가치');
  });

  it('★ 점수가 없는 것(g2 이전 생성분)은 미평가로 제외한다', () => {
    const r = selectQuestions([q('old', 4, 2, 0)]);
    expect(r.passed).toBe(0);
    expect(r.results[0]!.reasons).toContain('not_scored');
  });
});

describe('★★ R011 중복 후보 추리기 — 회귀 테스트', () => {
  // ★ R011 실측에서 나온 12쌍 중 대표 케이스를 고정한다.
  //   ★ 건우가 직접 검수해 정답을 알려주었다 —
  //     "'포르투갈어' 말고는 전부 중복이다"
  //   이 테스트는 **후보 추리기**만 검증한다 (결정적이고 API 를 쓰지 않는다).
  //   LLM 판정 정확도는 `npm run pipeline:dedupe -- --verify-r011` 로 측정한다
  //   (R012 실측: 12/12 일치).
  const item = (
    ref: string,
    midKey: string,
    majorKey: string,
    question: string,
    answers: string[],
  ): DupeInput => ({ ref, midKey, majorKey, question, answers });

  const r011Pairs: DupeInput[] = [
    // 토이 스토리 — 같은 중분류, 다른 소분류. 유사도 0.13
    item('a1', 'animation', 'arts', "'우디'와 '버즈'가 주인공인 픽사 3D 애니메이션은?", ['토이 스토리']),
    item('a2', 'animation', 'arts', '1995년 세계 최초의 극장용 장편 3D 애니메이션은?', ['토이 스토리']),
    // 포르투갈어 — ★ 유일하게 실제로 다른 문제. 유사도 0.00
    item('b1', 'world-language', 'life', "'빵'은 어느 나라 언어에서 유래되었는가?", ['포르투갈어']),
    item('b2', 'world-language', 'life', '브라질의 유일한 공용어는?', ['포르투갈어']),
    // 태평양 — ★ 대분류가 다른데 같은 문제
    item('c1', 'world-geo', 'humanities', '지구상에서 면적이 가장 넓은 대양은?', ['태평양']),
    item('c2', 'earth', 'science', '세계에서 가장 넓은 바다는?', ['태평양']),
  ];

  it('★ 정답이 겹치는 쌍을 모두 후보로 올린다 (카테고리와 무관하게)', () => {
    const r = findDuplicates(r011Pairs);
    expect(r.candidatePairs).toBe(3);
    // ★ R012: 전부 suspect 다. 카테고리로 자동 판정하지 않는다
    expect(r.pairs.every((p) => p.verdict === 'suspect')).toBe(true);
  });

  it('★ 대분류가 달라도 후보에서 빼지 않는다 (태평양 반례)', () => {
    const r = findDuplicates(r011Pairs);
    const pacific = r.pairs.find((p) => p.sharedAnswer === '태평양');
    expect(pacific).toBeDefined();
    expect(pacific!.level).toBe('cross-major');
    expect(pacific!.verdict).toBe('suspect');
  });

  it('★★ 유사도로는 중복과 정상을 가를 수 없다 — 그것이 유사도를 뺀 근거다', () => {
    const r = findDuplicates(r011Pairs);
    const toy = r.pairs.find((p) => p.sharedAnswer === '토이 스토리')!;
    const port = r.pairs.find((p) => p.sharedAnswer === '포르투갈어')!;
    // 실제 중복인 토이 스토리가 0.5 미만이다
    expect(toy.similarity).toBeLessThan(0.5);
    // ★ R011 실측에서는 실제 중복 쌍이 0.13, 정상 쌍이 0.00 이었다.
    //   ★ 핵심은 **중복 쌍의 유사도가 낮다**는 것이다 — 임계값을 그을 수 없는 이유다.
    //   (이 테스트는 축약한 질문을 쓰므로 절대값은 실측과 다르다. 관계만 고정한다)
    expect(toy.similarity).toBeLessThan(0.55); // R011 임계값이었던 값보다 낮다
    expect(port.similarity).toBe(0); // 정상 쌍은 0 이었다
  });

  it('후보 추리기가 전수 비교보다 압도적으로 적다 (실측 32,896 → 12쌍)', () => {
    const r = findDuplicates(r011Pairs);
    expect(r.totalPairsIfBruteForce).toBe(15);
    expect(r.candidatePairs).toBeLessThan(r.totalPairsIfBruteForce);
  });

  it('따옴표만 다른 질문은 exact 로 잡는다 (윤동주 서시)', () => {
    const r = findDuplicates([
      item('s1', 'kr-lit', 'korea', "'죽는 날까지'로 시작하는 윤동주의 시는?", ['서시']),
      item('s2', 'kr-lit', 'korea', '"죽는 날까지"로 시작하는 윤동주의 시는?', ['서시']),
    ]);
    expect(r.pairs[0]!.level).toBe('exact');
    expect(r.pairs[0]!.verdict).toBe('duplicate');
    expect(questionKey("'가'")).toBe(questionKey('"가"'));
  });
});

describe('★ R012 소분류 설계 원칙 검증', () => {
  it('★ 원칙 2 — "인물" 소분류를 두지 않는다', () => {
    // ★ 예외로 남긴 것: 클래식 음악의 작곡가, 세계 영화의 감독
    //   (음악학·영화학의 표준 분류 축이다. subNotes 로 경계를 적었다)
    const ALLOWED = new Set(['classical|작곡가', 'world-cinema|감독']);
    const PERSON_PATTERNS = [/작가/, /배우/, /감독/, /선수/, /방송인/, /성우/, /과학자/, /화가/, /작곡가/];
    const bad: string[] = [];
    for (const mid of MIDS) {
      for (const sub of mid.subs) {
        const key = `${mid.key}|${sub}`;
        if (ALLOWED.has(key)) continue;
        if (PERSON_PATTERNS.some((re) => re.test(sub))) bad.push(key);
      }
    }
    expect(bad).toEqual([]);
  });

  it('★★ 원칙 3 — "기록·순위" 소분류를 두지 않는다 (알 가치 1을 유도한다)', () => {
    const bad: string[] = [];
    for (const mid of MIDS) {
      for (const sub of mid.subs) {
        if (/기록/.test(sub) || /순위/.test(sub)) bad.push(`${mid.key}|${sub}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('★ 원칙 4 — "기타" 라는 이름의 소분류를 두지 않는다', () => {
    const bad: string[] = [];
    for (const mid of MIDS) {
      for (const sub of mid.subs) {
        if (sub === '기타' || sub.startsWith('기타 ')) bad.push(`${mid.key}|${sub}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('★ 원칙 5 — 같은 중분류 안에서 소분류가 서로를 포함하지 않는다', () => {
    // ★ 실측에서 발견된 유형: "디즈니·픽사" ⊂ "서양 애니메이션"
    //   문자열 포함으로 잡을 수 있는 것만 검사한다. 의미상 포함은 subNotes 로 다룬다
    const bad: string[] = [];
    for (const mid of MIDS) {
      for (const a of mid.subs) {
        for (const b of mid.subs) {
          if (a !== b && b.includes(a)) bad.push(`${mid.key}: "${a}" ⊂ "${b}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('★ 겹칠 위험이 있는 소분류에 경계(subNotes)가 있다', () => {
    // R011 실측에서 중복을 만든 소분류들이 대상이다
    const MUST_HAVE: [string, string][] = [
      ['animation', '디즈니·픽사 극장 애니메이션'],
      ['animation', '서양 TV 애니메이션'],
      ['kr-lit', '근대 소설'],
      ['kr-lit', '현대 시'],
      ['invention', '물리·화학 분야 발견'],
      ['earth', '해양'],
      ['world-geo', '대륙·바다'],
      ['world-lit', '시·희곡'],
      ['theatre', '연극 사조·연출'],
      ['baseball', 'KBO'],
      ['olympic', '동계 올림픽'],
      ['classical', '작곡가'],
      ['world-cinema', '감독'],
    ];
    for (const [midKey, sub] of MUST_HAVE) {
      const mid = MIDS.find((m) => m.key === midKey)!;
      expect(mid.subs, `${midKey} 에 "${sub}" 가 있어야 한다`).toContain(sub);
      expect(mid.subNotes?.[sub], `${midKey} > ${sub} 에 경계가 있어야 한다`).toBeTruthy();
    }
  });

  it('트리 규모가 R012 개정 결과와 맞는다', () => {
    expect(MAJORS).toHaveLength(7);
    expect(MIDS).toHaveLength(63);
    expect(MIDS.reduce((n, m) => n + m.subs.length, 0)).toBe(297);
  });
});

describe('★ 약어 정답 (R012 실측)', () => {
  it('★★ 마침표로 끝나는 약어를 버리지 않는다 — 양쪽 모델이 같은 곳에 걸렸다', () => {
    // 실측: Gemini 와 Claude Code 가 모두 H.O.T. / S.E.S. 에서 탈락했다
    for (const abbr of ['H.O.T.', 'S.E.S.', 'U.S.A.']) {
      expect(sanitizeVariants('기준값', ['기준값', abbr]).dropped, abbr).toEqual([]);
    }
  });

  it('약어가 아닌 것은 계속 걸러낸다', () => {
    for (const bad of ['Apple Inc.', 'The Phantom of the Opera', '아주 긴 서술형 정답이다.']) {
      expect(sanitizeVariants('기준값', ['기준값', bad]).dropped, bad).toEqual([bad]);
    }
  });
});

// =============================================================================
// ★★ R124 — 화면의 "분명히 틀린 답" 미리 보기가 서버 판정보다 엄하지 않다(서버가 맞다는 답을 화면이 틀렸다고 흔들면 안 된다)
//   서버 판정 = normalizeAnswer 그대로 ∈ 정답 · 또는 flexMatch · 화면 = answerProbeKeys 의 통 ∈ 정답 통
// =============================================================================

import { describe, expect, it } from 'vitest';
import { answerProbeKeys, flexAnswerSet, flexMatch, normalizeAnswer, probeBucket } from '@quiz/shared';

function serverOk(text: string, raw: string[]): boolean {
  const norms = new Set(raw.map((a) => normalizeAnswer(a)));
  const flex = flexAnswerSet(raw, norms);
  const n = normalizeAnswer(text);
  return Boolean(n) && (norms.has(n) || flexMatch(text, norms, flex));
}
function probeMaybe(text: string, raw: string[], salt: number): boolean {
  const norms = new Set(raw.map((a) => normalizeAnswer(a)));
  const buckets = new Set([...norms, ...flexAnswerSet(raw, norms)].map((k) => probeBucket(salt, k)));
  return answerProbeKeys(text).some((k) => buckets.has(probeBucket(salt, k)));
}

const CASES: { raw: string[]; subs: string[] }[] = [
  { raw: ['이순신(李舜臣)', '이순신'], subs: ['이순신', '이순신이다', '이순신 입니다!', '이 순 신', '이순신(李舜臣)', '이순신요'] },
  { raw: ['U.S.A', '미국'], subs: ['USA', 'u.s.a', 'U·S·A', '미국이다', '미국임'] },
  { raw: ['The Beatles'], subs: ['beatles', 'The Beatles', 'the beatles!', 'Beatles입니다'] },
  { raw: ['사이다'], subs: ['사이다', '사이다이다', '사이다요'] },
  { raw: ['3.14'], subs: ['3.14', '3.14이다'] },
  { raw: ['C++'], subs: ['C++', 'c++'] },
  { raw: ['4.19 혁명'], subs: ['419혁명', '4.19혁명', '4·19 혁명'] },
  { raw: ['반도체'], subs: ['반도체', '반 도 체', '반도체!', '반도체?'] },
];

describe('R124 미리 보기는 서버 판정의 상위 집합', () => {
  it('서버가 맞다는 제출은 화면도 "맞을 수 있음"(통에 든다) — 소금 여럿', () => {
    for (const salt of [0, 1, 12345, 0xffffffff, 987654321]) {
      for (const c of CASES) {
        for (const t of c.subs) {
          if (serverOk(t, c.raw)) expect(probeMaybe(t, c.raw, salt), `${t} / ${c.raw.join(',')} / ${salt}`).toBe(true);
        }
      }
    }
  });
  it('맞는 제출 예시는 실제로 서버가 맞다고 한다(검사가 비어 있지 않다)', () => {
    expect(serverOk('이순신이다', CASES[0]!.raw)).toBe(true);
    expect(serverOk('beatles', CASES[2]!.raw)).toBe(true);
  });
  it('빈 글 · 기호만은 열쇠가 없다(서버도 늘 틀림)', () => {
    expect(answerProbeKeys('   ')).toEqual([]);
    expect(serverOk('   ', ['가'])).toBe(false);
  });
  it('통은 0~1023 · 같은 소금 · 열쇠면 같은 통', () => {
    const b = probeBucket(77, '반도체');
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1024);
    expect(probeBucket(77, '반도체')).toBe(b);
  });
});

// =============================================================================
// ★★★ R125 — 혼자 하기 정답 지문(sure)은 서버 판정과 똑같다(맞다는 제출은 전부 걸리고 · 틀리다는 제출은 하나도 안 걸린다)
//   서버 판정 = normalizeAnswer 그대로 ∈ norms · 또는 flexMatch(soloAnswer 와 같은 줄) · 화면 = openSoloSure
// =============================================================================

import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { answerTags, flexAnswerSet, flexMatch, makeSoloSure, normalizeAnswer, openSoloSure, sha256, sureHit, toHex, utf8 } from '@quiz/shared';

function serverOk(text: string, norms: Set<string>, flex: Set<string>): boolean {
  const n = normalizeAnswer(text);
  return Boolean(n) && (norms.has(n) || flexMatch(text, norms, flex));
}
function setup(raw: string[]) {
  const norms = new Set(raw.map((a) => normalizeAnswer(a)).filter(Boolean));
  const flex = flexAnswerSet(raw, norms);
  const sure = makeSoloSure(answerTags(norms, flex), { answer: raw[0]!, explanation: `${raw[0]} 해설 — 이모지 🎉 · 따옴표 "x"` }, (k) => randomBytes(k));
  return { norms, flex, sure };
}

const CASES: { raw: string[]; subs: string[] }[] = [
  { raw: ['이순신(李舜臣)', '이순신'], subs: ['이순신', '이순신이다', '이순신 입니다!', '이 순 신', '이순신(李舜臣)', '이순신요', '이순', '이순신장군'] },
  { raw: ['U.S.A', '미국'], subs: ['USA', 'u.s.a', 'U·S·A', '미국이다', '미국임', '미', 'US'] },
  { raw: ['The Beatles'], subs: ['beatles', 'The Beatles', 'the beatles!', 'Beatles입니다', 'beatle'] },
  { raw: ['사이다'], subs: ['사이다', '사이다이다', '사이다요', '사', '사이'] },
  { raw: ['3.14'], subs: ['3.14', '3.14이다', '314', '3,14'] },
  { raw: ['C++'], subs: ['C++', 'c++', 'C', 'c+'] },
  { raw: ['4.19 혁명'], subs: ['419혁명', '4.19혁명', '4·19 혁명', '419'] },
  { raw: ['반도체'], subs: ['반도체', '반 도 체', '반도체!', '반도체?', '반도', '   ', '!!'] },
  { raw: ['요', '임'], subs: ['요', '임', '요요', '임임', '요이다'] },
];

describe('R125 정답 지문 = 서버 판정', () => {
  it('SHA-256 이 node crypto 와 같다(빈 글 · 한글 · 이모지 · 긴 글 · 64바이트 경계)', () => {
    for (const t of ['', 'abc', '반도체', '🎉👍🏻', 'x'.repeat(55), 'x'.repeat(56), 'y'.repeat(64), '가'.repeat(300)]) {
      expect(toHex(sha256(utf8(t)))).toBe(createHash('sha256').update(t, 'utf8').digest('hex'));
    }
  });
  it('맞다는 제출 = 지문에 걸림 · 틀리다는 제출 = 안 걸림 — 같은 문제 여러 번(소금이 달라도)', () => {
    let ok = 0;
    let bad = 0;
    for (let rep = 0; rep < 5; rep += 1) {
      for (const c of CASES) {
        const { norms, flex, sure } = setup(c.raw);
        for (const t of c.subs) {
          const s = serverOk(t, norms, flex);
          expect(sureHit(sure, t), `${t} / ${c.raw.join(',')}`).toBe(s);
          const o = openSoloSure(sure, t);
          expect(Boolean(o), `open ${t}`).toBe(s);
          if (s) {
            ok += 1;
            expect(o!.answer).toBe(c.raw[0]);
            expect(o!.explanation).toContain('🎉');
          } else bad += 1;
        }
      }
    }
    expect(ok).toBeGreaterThan(50);
    expect(bad).toBeGreaterThan(20);
  });
  it('소금이 문제마다 다르다 · 지문에 정답 글자가 없다', () => {
    const a = setup(['반도체']).sure;
    const b = setup(['반도체']).sure;
    expect(a.salt).not.toBe(b.salt);
    expect(a.keys[0]).not.toBe(b.keys[0]);
    expect(JSON.stringify(a)).not.toContain('반도체');
  });
});

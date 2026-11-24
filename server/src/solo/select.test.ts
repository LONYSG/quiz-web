// =============================================================================
// ★★★ R118 — 솔로 문제 고르기(docs/24 4-3) · 솔로는 공방 경험을 읽지도 쓰지도 않는다(4-6)
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PoolQuestion } from '../db/questionPool.js';
import { buildSoloPool, pickSoloQuestion } from './select.js';

function q(id: string, answers: string[], grade = 1, worth: number | null = 2, text = `문제 ${id}`): PoolQuestion {
  return { id, text, categoryName: '테스트', displayAnswer: answers[0] ?? '', hintAnswer: null, generalHint: null, explanation: null, answersNorm: answers, answersRaw: answers, grade, worth };
}
const first = () => 0;
const by = (...qs: PoolQuestion[]) => buildSoloPool(qs, qs.map(() => 'history'));
const base = { usedIds: new Set<string>(), usedAnswerNorms: new Set<string>(), recent: new Set<string>(), random: first };

describe('R118 솔로 풀', () => {
  it('알가치 1 · 분야 없는 문항은 뺀다 · 등급별로', () => {
    const qs = [q('1', ['가'], 1, 1), q('2', ['나'], 1, 2), q('3', ['다'], 2, 3), q('4', ['라'], 2, null)];
    const pool = buildSoloPool(qs, ['history', 'history', 'history', null]);
    expect(pool.get(1)?.map((x) => x.id)).toEqual(['2']);
    expect(pool.get(2)?.map((x) => x.id)).toEqual(['3']);
  });
});

describe('R118 솔로 문제 고르기', () => {
  it('이번 판에 나온 문제 · 정답이 겹치는 문제는 안 낸다', () => {
    const pool = by(q('1', ['가']), q('2', ['나']), q('3', ['다']));
    const p = pickSoloQuestion({ ...base, byGrade: pool, grade: 1, usedIds: new Set(['1']), usedAnswerNorms: new Set(['나']) });
    expect(p?.question.id).toBe('3');
  });
  it('최근 200문항은 뒤로 — 남은 것이 없으면 다시 낸다(같은 문제가 다시 나와도 된다)', () => {
    const pool = by(q('1', ['가']), q('2', ['나']));
    expect(pickSoloQuestion({ ...base, byGrade: pool, grade: 1, recent: new Set(['1']) })?.question.id).toBe('2');
    const again = pickSoloQuestion({ ...base, byGrade: pool, grade: 1, recent: new Set(['1', '2']) });
    expect(again?.question.id).toBe('1');
    expect(again?.repeated).toBe(true);
  });
  it('그 등급이 모자라면 아래 등급 먼저 · 그다음 위', () => {
    const pool = by(q('1', ['가'], 1), q('3', ['다'], 3), q('4', ['라'], 4));
    const p = pickSoloQuestion({ ...base, byGrade: pool, grade: 2 });
    expect(p?.question.id).toBe('1');
    expect(p?.grade).toBe(1);
    const up = pickSoloQuestion({ ...base, byGrade: pool, grade: 2, usedIds: new Set(['1']) });
    expect(up?.grade).toBe(3);
  });
  it('앞 문제 글에 정답이 들어 있는 문제는 같은 칸 안에서 뒤로', () => {
    const pool = by(q('1', ['세종대왕']), q('2', ['이순신']));
    const p = pickSoloQuestion({ ...base, byGrade: pool, grade: 1, shownNorm: '\n세종대왕이만든글자' });
    expect(p?.question.id).toBe('2');
  });
  it('낼 문제가 하나도 없으면 null', () => {
    const pool = by(q('1', ['가']));
    expect(pickSoloQuestion({ ...base, byGrade: pool, grade: 1, usedIds: new Set(['1']) })).toBeNull();
  });
});

describe('R118 솔로 본 문제는 공방 경험이 아니다(찬종 · 4-6)', () => {
  it('server/src/solo 의 어떤 코드도 question_experiences 를 읽거나 쓰지 않는다', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) expect(readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/question_experiences\b(?!\s*를)/);
  });
});

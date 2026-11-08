// R080 — 주제 세트 적재(순수 부분): 형식 거부 · verified 만 · candidate 빗장 · label 칸
import { describe, expect, it } from 'vitest';
import { candidateGate, dbNameOf, planLoad, readTopics } from './topics-load.mjs';
import { checkTopic } from './topics-check.mjs';

const item = (slug, n, name, extra = {}) => ({ id: `${slug}-${String(n).padStart(3, '0')}`, name, variants: [], tags: [], draw: false, liar: false, qid: null, ...extra });
const topic = (slug, status, items, extra = {}) => ({
  topic: slug,
  nameKo: slug,
  kind: 'closed',
  version: 1,
  asOf: '2026-11-08',
  createdRound: 'T',
  status,
  source: [{ url: 'https://example.org', note: '', fetchedAt: '2026-11-08' }],
  liar: false,
  draw: false,
  timeSec: 30,
  tags: [],
  count: items.length,
  items,
  verify: null,
  ...extra,
});
const names = (slug, n) => Array.from({ length: n }, (_, i) => item(slug, i + 1, `항목${'가나다라마바사아자차카타파하'[i % 14]}${i}`));

describe('topics-load', () => {
  it('DB 이름 · candidate 빗장 — 실 quizweb 거부 · test/dev 허용', () => {
    expect(dbNameOf('postgresql://q:p@localhost:5434/quizweb_test')).toBe('quizweb_test');
    expect(candidateGate('postgresql://q:p@localhost:5434/quizweb', {}).ok).toBe(false);
    expect(candidateGate('postgresql://q:p@localhost:5434/quizweb', { QUIZ_DEV_SERVER: '1' }).ok).toBe(false);
    expect(candidateGate('postgresql://q:p@localhost:5434/quizweb_test', {}).ok).toBe(true);
    expect(candidateGate('postgresql://q:p@localhost:5434/quizweb_dev', {}).ok).toBe(true);
    expect(candidateGate('postgresql://q:p@localhost:5434/other', {}).ok).toBe(false);
    expect(candidateGate('postgresql://q:p@localhost:5434/other', { QUIZ_DEV_SERVER: '1' }).ok).toBe(true);
  });

  it('verified 만 넣고 candidate · rejected 는 뺀다(허용하면 candidate 도)', () => {
    const list = [
      { file: 'a.json', t: topic('a', 'verified', names('a', 20)) },
      { file: 'b.json', t: topic('b', 'candidate', names('b', 20)) },
      { file: 'c.json', t: topic('c', 'rejected', names('c', 20)) },
    ];
    const p = planLoad(list, { allowCandidate: false, checkTopic });
    expect(p.sets.map((s) => s.topic)).toEqual(['a']);
    expect(p.items).toHaveLength(20);
    expect(p.skipped.map((s) => s.topic)).toEqual(['b', 'c']);
    const q = planLoad(list, { allowCandidate: true, checkTopic });
    expect(q.sets.map((s) => s.topic)).toEqual(['a', 'b']);
  });

  it('형식 막힘(유일성 · id 꼴 · count)이 있는 세트는 통째로 넣지 않는다', () => {
    const dup = names('d', 20);
    dup[5] = item('d', 6, dup[0].name);
    const badId = names('e', 20);
    badId[3] = { ...badId[3], id: 'e-999' };
    const p = planLoad(
      [
        { file: 'd.json', t: topic('d', 'verified', dup) },
        { file: 'e.json', t: topic('e', 'verified', badId) },
        { file: 'f.json', t: topic('f', 'verified', names('f', 20), { count: 99 }) },
      ],
      { allowCandidate: false, checkTopic },
    );
    expect(p.sets).toHaveLength(0);
    expect(p.skipped.every((s) => s.why.startsWith('형식'))).toBe(true);
  });

  it('§9 label(선택)은 받고 · 비면 막는다 · 항목 칸이 DB 꼴로', () => {
    const it2 = names('g', 20);
    it2[0] = { ...it2[0], label: '짧게', year: 1999, note: '메모' };
    const p = planLoad([{ file: 'g.json', t: topic('g', 'verified', it2) }], { allowCandidate: false, checkTopic });
    expect(p.sets).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ id: 'g-001', seq: 1, label: '짧게', year: 1999, note: '메모', topic: 'g' });
    expect(p.items[1].label).toBeNull();
    const bad = names('h', 20);
    bad[0] = { ...bad[0], label: ' ' };
    expect(planLoad([{ file: 'h.json', t: topic('h', 'verified', bad) }], { allowCandidate: false, checkTopic }).sets).toHaveLength(0);
  });

  it('실제 30 파일 — 허용하면 막힘 0 으로 전부 들어간다', () => {
    const list = readTopics();
    const p = planLoad(list, { allowCandidate: true, checkTopic });
    expect(p.skipped.filter((s) => s.why.startsWith('형식'))).toEqual([]);
    expect(p.sets.length).toBe(list.filter((x) => x.t.status !== 'rejected').length);
  });
});

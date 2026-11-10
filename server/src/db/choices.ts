// =============================================================================
// ★★ R090 (D-347 · 0035) — 객관식 5연속의 저장 보기(question_choices)
//
//   정본 = data/minigame/choice/options.json(verified 만) → scripts/choice-load.mjs → question_choices
//   게임 시작 때(객관식을 골랐을 때만) 한 번 읽는다 — 판정 블록에서 await 하지 않는다.
//   ★ 0035 전 DB(표 없음) · 빈 표 = 빈 맵(객관식은 그 판 후보에서 빠진다 — 검사 서버는 가짜 보기)
// =============================================================================
import { query } from './pool.js';

export async function loadChoiceOptions(): Promise<Map<string, string[]>> {
  try {
    const r = await query<{ id: string; options: unknown }>(`SELECT question_id::text AS id, options FROM question_choices`);
    const m = new Map<string, string[]>();
    for (const row of r.rows) {
      if (Array.isArray(row.options)) m.set(row.id, row.options.filter((x): x is string => typeof x === 'string' && x.trim() !== ''));
    }
    return m;
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return new Map();
    throw err;
  }
}

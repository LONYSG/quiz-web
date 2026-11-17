// =============================================================================
// ★★ 문항 × 사람 플레이 기록 (R103 · D-360 · 0037)
//
// ★ 정답 공개 때 한 문항 몫을 **한 번에** 넣는다(unnest 한 줄 INSERT) — 호출자는 void(gameQuestions.ts 와 같은 규칙).
// ★ 봇 · 검사 계정 표시는 SQL 에서 login_id 정규식으로 — 판정 경로에서 계정을 읽지 않으려고(near_misses 꼴).
// ★ 0037 이 아직 안 돈 DB 면(42P01 undefined_table) 한 번 경고하고 그 뒤로는 쓰지 않는다(새 빌드가 마이그레이션 전에 떠도 판은 그대로).
// =============================================================================

import { query } from './pool.js';

export interface PlayEventRow {
  accountId: string;
  experienced: boolean;
  connected: boolean;
  joinedMid: boolean;
  won: boolean;
  correctMs: number | null;
  late: boolean;
  hintStage: number | null;
  wrongCount: number;
  firstMs: number | null;
}

export interface PlayEventBatch {
  gameId: string;
  questionIndex: number;
  questionId: string;
  level: string | null;
  textHash: string;
  hintsShown: number;
  hasGeneralHint: boolean;
  resolution: string;
  skipLogin: string;
  rows: readonly PlayEventRow[];
}

let tableMissing = false;

export async function insertPlayEvents(b: PlayEventBatch): Promise<number> {
  if (tableMissing || b.rows.length === 0) return 0;
  const col = <T>(f: (r: PlayEventRow) => T): T[] => b.rows.map(f);
  try {
    const r = await query(
      `INSERT INTO play_events
         (kind, game_id, question_index, question_id, account_id, is_bot, level, text_hash,
          experienced, connected, joined_mid, won, correct_ms, late, hint_stage, wrong_count, first_ms,
          hints_shown, has_general_hint, resolution)
       SELECT 'quiz', $1, $2, $3, a.id, a.login_id ~* $5, $4, $6,
              x.experienced, x.connected, x.joined_mid, x.won, x.correct_ms, x.late, x.hint_stage, x.wrong_count, x.first_ms,
              $7, $8, $9
         FROM unnest($10::bigint[], $11::boolean[], $12::boolean[], $13::boolean[], $14::boolean[],
                     $15::int[], $16::boolean[], $17::smallint[], $18::smallint[], $19::int[])
              AS x(account_id, experienced, connected, joined_mid, won, correct_ms, late, hint_stage, wrong_count, first_ms)
         JOIN accounts a ON a.id = x.account_id`,
      [
        b.gameId,
        b.questionIndex,
        b.questionId,
        b.level,
        b.skipLogin,
        b.textHash,
        b.hintsShown,
        b.hasGeneralHint,
        b.resolution,
        col((r) => r.accountId),
        col((r) => r.experienced),
        col((r) => r.connected),
        col((r) => r.joinedMid),
        col((r) => r.won),
        col((r) => r.correctMs),
        col((r) => r.late),
        col((r) => r.hintStage),
        col((r) => Math.min(r.wrongCount, 32767)),
        col((r) => r.firstMs),
      ],
    );
    return r.rowCount ?? 0;
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') {
      tableMissing = true;
      console.warn('[game] ★ play_events 표가 없다(0037 미적용) — 플레이 기록을 건너뛴다');
      return 0;
    }
    throw err;
  }
}

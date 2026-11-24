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
  /** ★ R116 (0040 · 24 12-2) — 기기(모르면 null) */
  device?: 'pc' | 'mobile' | null;
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
  /** ★ R116 (0040 · 24 12-2) — 그때 등급 · 방 종류 · 그 문항 때 방 인원 */
  grade?: number | null;
  roomKind?: 'quiz' | 'draw' | 'liar' | null;
  roomSize?: number | null;
}

/**
 * ★★ R116 (24 12-1 ①) — 옛: 표가 없으면(42P01) 한 번 걸고 서버를 다시 띄울 때까지 쓰지 않았다(서버가 마이그레이션보다 먼저 뜨면 영영 0줄).
 *   이제 RETRY_MS 뒤 다시 해 본다. 0040 의 새 열이 없으면(42703) 옛 열만 쓴다(같은 RETRY_MS 뒤 새 열을 다시 해 본다).
 */
const RETRY_MS = 5 * 60_000;
let tableMissingUntil = 0;
let extMissingUntil = 0;

export async function insertPlayEvents(b: PlayEventBatch): Promise<number> {
  const now = Date.now();
  if (now < tableMissingUntil || b.rows.length === 0) return 0;
  const col = <T>(f: (r: PlayEventRow) => T): T[] => b.rows.map(f);
  const ext = now >= extMissingUntil;
  try {
    const r = await query(
      `INSERT INTO play_events
         (kind, game_id, question_index, question_id, account_id, is_bot, level, text_hash,
          experienced, connected, joined_mid, won, correct_ms, late, hint_stage, wrong_count, first_ms,
          hints_shown, has_general_hint, resolution${ext ? ', grade, room_kind, room_size, device' : ''})
       SELECT 'quiz', $1, $2, $3, a.id, a.login_id ~* $5, $4, $6,
              x.experienced, x.connected, x.joined_mid, x.won, x.correct_ms, x.late, x.hint_stage, x.wrong_count, x.first_ms,
              $7, $8, $9${ext ? ', $21::smallint, $22::text, $23::smallint, x.device' : ''}
         FROM unnest($10::bigint[], $11::boolean[], $12::boolean[], $13::boolean[], $14::boolean[],
                     $15::int[], $16::boolean[], $17::smallint[], $18::smallint[], $19::int[], $20::text[])
              AS x(account_id, experienced, connected, joined_mid, won, correct_ms, late, hint_stage, wrong_count, first_ms, device)
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
        col((r) => r.device ?? null),
        ...(ext ? [b.grade ?? null, b.roomKind ?? null, b.roomSize ?? null] : []),
      ],
    );
    return r.rowCount ?? 0;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      tableMissingUntil = Date.now() + RETRY_MS;
      console.warn('[game] ★ play_events 표가 없다(0037 미적용) — 5분 동안 건너뛰고 다시 해 본다');
      return 0;
    }
    if (code === '42703' && ext) {
      // 0040 의 새 열이 아직 없다 — 옛 열만으로 이번 줄을 다시 쓴다
      extMissingUntil = Date.now() + RETRY_MS;
      console.warn('[game] ★ play_events 새 열(0040)이 없다 — 옛 열만 쓴다(5분 뒤 다시)');
      return insertPlayEvents(b);
    }
    throw err;
  }
}

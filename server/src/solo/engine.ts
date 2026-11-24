// =============================================================================
// ★★★ R118 (docs/24 4절) — 혼자 하기(솔로) 판: 방을 쓰지 않는 가벼운 판 · 계정 하나에 판 하나(메모리)
//
//   흐름(4-2): solo.start → solo.question { n, … } → solo.answer { n, text }(시간 안에 여러 번) →
//              맞음 solo.result(ok) → 0.8초 뒤 다음 · 시간 끝 solo.result(틀림 · 정답 보여 줌) → 1.5초 뒤 다음 · 목숨 0 → solo.end
//   ★ 판정은 동기(await 없음) — 방 판정과 같은 함수(normalizeAnswer · flexMatch · 문항의 정규화 정답).
//   ★ n 이 지금 문제와 다르면 버린다(방의 epoch 와 같은 구실 — 앞 문제에 친 답이 늦게 와서 다음 문제에 맞는 일을 막는다).
//   ★ 마감은 서버 시계 — 도착이 마감 + 0.3초를 넘으면 무효. 틀린 답에는 아무 반응도 보내지 않는다(지금 퀴즈와 같다).
//   ★ 시계는 문제마다 setTimeout 하나(마감 + 0.3초 · 다음 문제) — 방의 100ms tick 에 넣지 않았다(사람 하나 · 판정 블록이 따로 · 더 작다).
//   ★ 끊김(4-7): 문제 시계는 간다(지금 문제는 시간이 끝나면 틀림). 다음 문제는 다시 붙을 때까지 내지 않는다 —
//     30초 안에 돌아오면 이어서 · 넘으면 그때까지 기록으로 끝. 새 탭은 옛 탭을 끊고(지금 그대로) 같은 판을 이어받는다.
// =============================================================================

import { createHash } from 'node:crypto';
import type { Socket } from 'socket.io';
import {
  SOLO,
  beltNextNeed,
  flexAnswerSet,
  flexMatch,
  normalizeAnswer,
  soloGradeFor,
  soloTimeMs,
  type SoloEndReason,
  type SoloEndView,
  type SoloQuestionEnd,
  type SoloQuestionView,
  type SoloResultView,
  type SoloWrongView,
} from '@quiz/shared';
import { config } from '../config.js';
import { loadSoloPool, type PoolQuestion } from '../db/questionPool.js';
import { ioServer } from '../rooms/emit.js';
import { deviceOf } from '../rooms/registry.js';
import { WindowCounter } from '../security/limits.js';
import { finishSoloRun, insertSoloAnswer, insertSoloRun, recentSoloQuestionIds, type SoloAnswerRow } from './db.js';
import { buildSoloPool, pickSoloQuestion } from './select.js';
import { setBelt } from './belts.js';

interface SoloQ {
  n: number;
  q: PoolQuestion;
  grade: number;
  shownAt: number;
  endsAt: number;
  limitMs: number;
  norms: Set<string>;
  flex: Set<string>;
  textHash: string;
  firstMs: number | null;
  wrongCount: number;
  wrongTexts: string[];
  resolved: boolean;
}

interface SoloRun {
  runId: string;
  accountId: string;
  socketId: string;
  lives: number;
  correct: number;
  n: number;
  cur: SoloQ | null;
  last: SoloResultView | null;
  byGrade: ReadonlyMap<number, readonly PoolQuestion[]>;
  usedIds: Set<string>;
  usedAnswerNorms: Set<string>;
  recent: Set<string>;
  shownNorm: string;
  wrongs: SoloWrongView[];
  flags: { fast: number; away: number; awayBetween: number; repeats: number; gradeFallback: number; reconnects: number };
  timer: ReturnType<typeof setTimeout> | null;
  dropTimer: ReturnType<typeof setTimeout> | null;
  disconnectedAt: number | null;
  waitingNext: boolean;
  nextAt: number | null;
}

const runs = new Map<string, SoloRun>();
/** 판 시작 · 끝(DB)을 기다리는 동안 — 같은 계정의 새 판을 막는다 */
const busy = new Set<string>();
const startsPerAccount = new WindowCounter(60 * 60_000, SOLO.RUNS_PER_HOUR);

export function soloRunning(accountId: string): boolean {
  return runs.has(accountId) || busy.has(accountId);
}
/** 검사 · 기동 로그용 */
export function soloRunCount(): number {
  return runs.size;
}

function timeParams() {
  return config.soloTime;
}
const nextOkMs = () => config.soloTest.nextMs || SOLO.NEXT_AFTER_OK_MS;
const nextFailMs = () => config.soloTest.nextMs || SOLO.NEXT_AFTER_FAIL_MS;
const reconnectMs = () => config.soloTest.reconnectMs || SOLO.RECONNECT_MS;

function emit(run: SoloRun, event: string, payload: unknown): void {
  ioServer().to(run.socketId).emit(event, payload);
}

function fire(label: string, p: Promise<unknown>): void {
  void p.catch((err) => console.error(`[solo] ★ ${label} 실패:`, (err as Error).message));
}

function questionView(run: SoloRun, c: SoloQ): SoloQuestionView {
  return { n: c.n, text: c.q.text, category: c.q.categoryName, grade: c.grade, endsAt: c.endsAt, limitMs: c.limitMs, lives: run.lives, correct: run.correct };
}

// ─────────────────────────────────────────────────────────────────────────────
// 시작 · 이어받기
// ─────────────────────────────────────────────────────────────────────────────

export type StartFail = { code: 'BUSY' | 'RATE' | 'NO_QUESTIONS' | 'DB'; message: string };

/** 판을 시작한다(방에 있지 않음은 부르는 쪽이 본다) — 이미 도는 판이 있으면 그 판을 이 소켓에 다시 붙인다 */
export async function startSolo(socket: Socket, accountId: string, site: string | null): Promise<StartFail | null> {
  const old = runs.get(accountId);
  if (old) {
    attachSolo(socket, accountId);
    return null;
  }
  if (busy.has(accountId)) return { code: 'BUSY', message: '잠시 뒤 다시 해 주세요.' };
  if (!startsPerAccount.hit(accountId)) return { code: 'RATE', message: '한 시간에 30판까지예요. 잠시 뒤 다시 해 주세요.' };
  busy.add(accountId);
  try {
    const [byGrade, recent] = await Promise.all([loadSoloPool(buildSoloPool), recentSoloQuestionIds(accountId)]);
    let total = 0;
    for (const l of byGrade.values()) total += l.length;
    if (total === 0) return { code: 'NO_QUESTIONS', message: '낼 문제가 없어요.' };
    const runId = await insertSoloRun({ accountId, device: deviceOf(accountId), site, skipLogin: config.tuning.nearMissSkipLogin, belt: config.belt });
    const run: SoloRun = {
      runId,
      accountId,
      socketId: socket.id,
      lives: SOLO.LIVES,
      correct: 0,
      n: 0,
      cur: null,
      last: null,
      byGrade,
      usedIds: new Set(),
      usedAnswerNorms: new Set(),
      recent,
      shownNorm: '',
      wrongs: [],
      flags: { fast: 0, away: 0, awayBetween: 0, repeats: 0, gradeFallback: 0, reconnects: 0 },
      timer: null,
      dropTimer: null,
      disconnectedAt: null,
      waitingNext: false,
      nextAt: null,
    };
    runs.set(accountId, run);
    emit(run, 'solo.started', { lives: run.lives });
    nextQuestion(run);
    return null;
  } catch (err) {
    console.error('[solo] ★ 판 시작 실패:', (err as Error).message);
    return { code: 'DB', message: '지금은 시작할 수 없어요. 잠시 뒤 다시 해 주세요.' };
  } finally {
    busy.delete(accountId);
  }
}

/** 새 소켓(새 탭 · 다시 붙음)에 지금 판을 붙이고 지금 상태를 다시 보낸다 — 시계는 그대로 */
export function attachSolo(socket: Socket, accountId: string): boolean {
  const run = runs.get(accountId);
  if (!run) return false;
  if (run.socketId !== socket.id) run.flags.reconnects += run.disconnectedAt !== null ? 1 : 0;
  run.socketId = socket.id;
  run.disconnectedAt = null;
  if (run.dropTimer) clearTimeout(run.dropTimer);
  run.dropTimer = null;
  const c = run.cur;
  socket.emit('solo.state', {
    lives: run.lives,
    correct: run.correct,
    question: c && !c.resolved ? questionView(run, c) : null,
    last: c && c.resolved ? run.last : null,
  });
  if (run.waitingNext) {
    run.waitingNext = false;
    nextQuestion(run);
  }
  return true;
}

/** 소켓이 끊겼다 — 이 판의 소켓일 때만 30초 시계 */
export function soloDisconnected(accountId: string, socketId: string): void {
  const run = runs.get(accountId);
  if (!run || run.socketId !== socketId) return;
  run.disconnectedAt = Date.now();
  if (run.dropTimer) clearTimeout(run.dropTimer);
  run.dropTimer = setTimeout(() => {
    if (runs.get(accountId) === run && run.disconnectedAt !== null) void endSolo(run, 'disconnect');
  }, reconnectMs());
}

// ─────────────────────────────────────────────────────────────────────────────
// 문제 내기 · 판정
// ─────────────────────────────────────────────────────────────────────────────

function nextQuestion(run: SoloRun): void {
  run.nextAt = null;
  if (run.disconnectedAt !== null) {
    run.waitingNext = true;
    return;
  }
  const target = soloGradeFor(run.correct + config.soloTest.rampShift);
  const pick = pickSoloQuestion({ byGrade: run.byGrade, grade: target, usedIds: run.usedIds, usedAnswerNorms: run.usedAnswerNorms, recent: run.recent, shownNorm: run.shownNorm });
  if (!pick) {
    void endSolo(run, 'no_questions');
    return;
  }
  const q = pick.question;
  if (pick.repeated) run.flags.repeats += 1;
  if (pick.grade !== target) run.flags.gradeFallback += 1;
  run.usedIds.add(q.id);
  for (const a of q.answersNorm) run.usedAnswerNorms.add(a);
  run.shownNorm += `\n${normalizeAnswer(q.text)}\n${normalizeAnswer(q.explanation ?? '')}`;
  run.n += 1;
  const now = Date.now();
  const limitMs = config.soloTest.timeMs || soloTimeMs(q.text, q.displayAnswer, timeParams());
  const norms = new Set(q.answersNorm);
  const c: SoloQ = {
    n: run.n,
    q,
    grade: pick.grade,
    shownAt: now,
    endsAt: now + limitMs,
    limitMs,
    norms,
    flex: flexAnswerSet(q.answersRaw, norms),
    textHash: createHash('md5')
      .update([q.text, q.displayAnswer, q.generalHint ?? '', q.explanation ?? ''].join('|'))
      .digest('hex')
      .slice(0, 12),
    firstMs: null,
    wrongCount: 0,
    wrongTexts: [],
    resolved: false,
  };
  run.cur = c;
  run.last = null;
  emit(run, 'solo.question', questionView(run, c));
  if (run.timer) clearTimeout(run.timer);
  run.timer = setTimeout(() => {
    if (run.cur === c && !c.resolved) resolve(run, 'timeout');
  }, limitMs + SOLO.GRACE_MS);
}

/** 답 — 동기. 맞으면 바로 결과 · 틀리면 조용히(세기만) */
export function soloAnswer(accountId: string, n: number, text: string, now = Date.now()): void {
  const run = runs.get(accountId);
  const c = run?.cur;
  if (!run || !c || c.n !== n || c.resolved) return;
  if (now > c.endsAt + SOLO.GRACE_MS) return;
  if (c.firstMs === null) c.firstMs = now - c.shownAt;
  const norm = normalizeAnswer(text);
  if (norm && (c.norms.has(norm) || flexMatch(text, c.norms, c.flex))) {
    resolve(run, 'correct', now);
    return;
  }
  c.wrongCount += 1;
  if (norm && c.wrongTexts.length < SOLO.WRONG_KEEP) c.wrongTexts.push([...norm].slice(0, SOLO.WRONG_TEXT_MAX).join(''));
}

/** 화면이 가려짐 · 초점 잃음(4-5) — 지금 문제는 실패 · 문제 사이면 세기만 */
export function soloAway(accountId: string, n: number): void {
  const run = runs.get(accountId);
  if (!run) return;
  const c = run.cur;
  if (c && c.n === n && !c.resolved) {
    run.flags.away += 1;
    resolve(run, 'away');
  } else run.flags.awayBetween += 1;
}

export function soloQuit(accountId: string): boolean {
  const run = runs.get(accountId);
  if (!run) return false;
  void endSolo(run, 'quit');
  return true;
}

function answerRow(run: SoloRun, c: SoloQ, end: SoloAnswerRow['end'], ms: number | null): SoloAnswerRow {
  return {
    runId: run.runId,
    n: c.n,
    questionId: c.q.id,
    grade: c.grade,
    textHash: c.textHash,
    shownAt: c.shownAt,
    limitMs: c.limitMs,
    correct: end === 'correct',
    end,
    ms,
    firstMs: c.firstMs,
    wrongCount: c.wrongCount,
    wrongTexts: c.wrongTexts,
    away: end === 'away',
  };
}

function resolve(run: SoloRun, end: SoloQuestionEnd, now = Date.now()): void {
  const c = run.cur;
  if (!c || c.resolved) return;
  c.resolved = true;
  if (run.timer) clearTimeout(run.timer);
  run.timer = null;
  const ok = end === 'correct';
  const ms = ok ? Math.max(0, now - c.shownAt) : null;
  if (ok) {
    run.correct += 1;
    if (ms !== null && ms < SOLO.FAST_MS) run.flags.fast += 1;
  } else {
    run.lives -= 1;
    run.wrongs.push({ n: c.n, text: c.q.text, answer: c.q.displayAnswer, explanation: c.q.explanation, end });
  }
  fire('solo_answers', insertSoloAnswer(answerRow(run, c, end, ms)));
  const over = run.lives <= 0;
  const wait = ok ? nextOkMs() : nextFailMs();
  run.nextAt = over ? null : Date.now() + wait;
  const view: SoloResultView = { n: c.n, ok, end, answer: c.q.displayAnswer, explanation: c.q.explanation, lives: run.lives, correct: run.correct, nextAt: run.nextAt, ms };
  run.last = view;
  emit(run, 'solo.result', view);
  if (over) {
    void endSolo(run, 'lives');
    return;
  }
  run.timer = setTimeout(() => {
    if (runs.get(run.accountId) === run) nextQuestion(run);
  }, wait);
}

// ─────────────────────────────────────────────────────────────────────────────
// 끝
// ─────────────────────────────────────────────────────────────────────────────

async function endSolo(run: SoloRun, reason: SoloEndReason): Promise<void> {
  if (runs.get(run.accountId) !== run) return;
  runs.delete(run.accountId);
  busy.add(run.accountId);
  if (run.timer) clearTimeout(run.timer);
  if (run.dropTimer) clearTimeout(run.dropTimer);
  run.timer = run.dropTimer = null;
  const c = run.cur;
  // 풀던 문제(그만두기 · 끊김)는 기록만 — 목숨 · 틀린 문제 목록에는 넣지 않는다
  if (c && !c.resolved && (reason === 'quit' || reason === 'disconnect')) {
    c.resolved = true;
    fire('solo_answers', insertSoloAnswer(answerRow(run, c, reason, null)));
  }
  const asked = run.n;
  const flags = { ...run.flags, device: deviceOf(run.accountId) };
  let view: SoloEndView;
  try {
    const f = await finishSoloRun({ runId: run.runId, accountId: run.accountId, correct: run.correct, asked, reason, flags, belt: config.belt });
    if (config.belt) setBelt(run.accountId, f.beltAfter);
    view = {
      correct: run.correct,
      asked,
      reason,
      best: f.best,
      newBest: run.correct > f.bestBefore,
      ...(config.belt
        ? {
            belt: {
              step: f.beltAfter,
              next: beltNextNeed(f.beltAfter, f.best),
              change: f.beltAfter !== null && f.beltAfter !== f.beltBefore ? { before: f.beltBefore, after: f.beltAfter, points: f.points } : null,
            },
          }
        : {}),
      wrongs: run.wrongs.slice(-SOLO.LIVES),
    };
  } catch (err) {
    console.error('[solo] ★ 판 끝 기록 실패:', (err as Error).message);
    view = { correct: run.correct, asked, reason, best: run.correct, newBest: false, wrongs: run.wrongs.slice(-SOLO.LIVES) };
  } finally {
    busy.delete(run.accountId);
  }
  emit(run, 'solo.end', view);
}

/** 검사 · 종료 — 모든 판의 시계를 멈춘다(DB 는 부팅 정리가 닫는다) */
export function stopAllSolo(): void {
  for (const r of runs.values()) {
    if (r.timer) clearTimeout(r.timer);
    if (r.dropTimer) clearTimeout(r.dropTimer);
  }
  runs.clear();
}

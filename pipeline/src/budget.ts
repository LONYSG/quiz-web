// =============================================================================
// 예산 가드와 "그날 중단" 상태 (작업 A / Q-54)
//
// ★★ 왜 가공 코드보다 이것을 먼저 만드는가
//   한도를 모르는 상태에서 배치를 돌리면 **한도를 넘긴 뒤에야** 알게 된다.
//   그러면 그날은 더 이상 아무것도 못 하고, 얼마나 남았는지도 알 수 없다.
//
// ★ Q-54 확정: 무료 한도 내에서만 운영한다. 429 가 나오면 그날 중단한다.
//   한도 수치는 Google 이 공개하지 않으므로(R005·R010 실측) 실측으로 파악한다.
//
// ★ 상태를 파일에 남기는 이유
//   Actions 는 실행마다 새 컨테이너다. 메모리에 두면 다음 실행이 알 수 없다.
//   파일로 남기고 저장소에 커밋하면 "어제 429 를 맞았다" 를 다음 실행이 안다.
//
// ★ 날짜 기준은 UTC 자정이다. 근거는 config.ts 의 DAY_BOUNDARY 주석에 있다.
//   요약: Google 의 리셋 기준은 확인 불가이고, UTC 는 KST 보다 늦게 바뀌므로
//   우리 카운터가 더 늦게 초기화된다. 늦게 초기화되는 쪽이 안전하다.
// =============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIRS, LIMITS } from './config.js';

export interface DayState {
  /** UTC 기준 날짜 (YYYY-MM-DD) */
  day: string;
  /** 그날 처리한 문제 건수 */
  items: number;
  /** 그날 누적 토큰 (사고 토큰 포함) */
  tokens: number;
  /** API 호출 횟수 */
  calls: number;
  /** ★ 429 를 맞았는가. true 면 그날은 더 시작하지 않는다 */
  rateLimited: boolean;
  /** 429 를 맞은 시각 */
  rateLimitedAt: string | null;
  updatedAt: string;
}

/** ★ UTC 기준 오늘 (YYYY-MM-DD) */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function statePath(root: string): string {
  return path.join(root, DATA_DIRS.state, 'daily.json');
}

function emptyState(day: string): DayState {
  return {
    day,
    items: 0,
    tokens: 0,
    calls: 0,
    rateLimited: false,
    rateLimitedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 상태를 읽는다.
 *
 * ★ 날짜가 바뀌었으면 새 상태로 시작한다. 어제의 429 는 오늘을 막지 않는다.
 * ★ 파일이 없거나 깨져 있으면 새 상태로 시작한다. 상태 파일 때문에 멈추지 않는다.
 */
export async function loadState(root: string, day = today()): Promise<DayState> {
  try {
    const text = await readFile(statePath(root), 'utf8');
    const state = JSON.parse(text) as DayState;
    if (state.day !== day) return emptyState(day);
    return state;
  } catch {
    return emptyState(day);
  }
}

export async function saveState(root: string, state: DayState): Promise<void> {
  const file = statePath(root);
  await mkdir(path.dirname(file), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(file, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export type GateResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited_today' | 'item_limit' | 'token_limit'; detail: string };

/**
 * 지금 작업을 시작해도 되는가.
 *
 * ★ 세 가지를 본다. 하나라도 걸리면 시작하지 않는다.
 *   (1) 오늘 이미 429 를 맞았는가        ← Q-54 "429 가 나오면 그날 중단"
 *   (2) 오늘 처리 건수 상한에 도달했는가  ← 429 를 맞기 전에 스스로 멈춘다
 *   (3) 오늘 토큰 상한에 도달했는가
 */
export function checkGate(state: DayState): GateResult {
  if (state.rateLimited) {
    return {
      ok: false,
      reason: 'rate_limited_today',
      detail: `오늘(${state.day}) 이미 429 를 받았다 (${state.rateLimitedAt}). 다음 UTC 자정 이후에 다시 시도한다.`,
    };
  }
  if (state.items >= LIMITS.dailyItems) {
    return {
      ok: false,
      reason: 'item_limit',
      detail: `오늘 처리 건수 상한 도달: ${state.items}/${LIMITS.dailyItems}`,
    };
  }
  if (state.tokens >= LIMITS.dailyTokens) {
    return {
      ok: false,
      reason: 'token_limit',
      detail: `오늘 토큰 상한 도달: ${state.tokens}/${LIMITS.dailyTokens}`,
    };
  }
  return { ok: true };
}

/**
 * ★ 429 중단 상태를 해제한다. **사람이 의도적으로 실행할 때만 쓴다.**
 *
 * ★ 왜 필요한가 (R010 실측)
 *   Q-54 확정 규칙은 "429 가 나오면 그날 중단" 이다. 그 규칙은 유지한다.
 *   그런데 실측에서 받은 429 는 **몇 분 뒤 회복되었다**(최소 호출이 전부 200).
 *   즉 일일 한도가 아니라 짧은 창(분당) 한도였다(추정).
 *   ★ 그런 429 로 하루를 버리는 것은 규칙의 의도가 아니라고 판단했으나,
 *     규칙을 코드가 스스로 바꾸는 것은 원칙 위반이다(운영 판단은 혼자 결정하지 않는다).
 *   → 기본 동작은 규칙 그대로 두고, **사람이 판단해 해제**할 수 있는 문을 만든다.
 *     이 함수를 자동으로 부르는 코드는 어디에도 없다.
 *
 * ★ 429 의 종류를 구분해 자동 처리할지는 건우 결정 사항이다 (Q-62).
 */
export async function clearRateLimit(root: string): Promise<DayState> {
  const state = await loadState(root);
  state.rateLimited = false;
  state.rateLimitedAt = null;
  await saveState(root, state);
  return state;
}

/** 남은 처리 가능 건수 */
export function remainingItems(state: DayState): number {
  return Math.max(0, LIMITS.dailyItems - state.items);
}

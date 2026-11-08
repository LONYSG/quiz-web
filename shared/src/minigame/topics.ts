// =============================================================================
// ★★★ 주제 세트 미니게임 공통 (R080 · D-330 · D-337) — 많이 말하기 · 겹치면 무효 · 객관식 10연속
//
// ★ 찬종 2026-11-08: "특정 주제에 관해 관련 정답을 최대한 많이 말하는 사람이 이기는 것" · 2차 ⑺ "30초 · 1판 · 점수는 맞힌 수 순위로 ·
//   판 중 남의 답 안 보임 · 끝나면 공개 · 결과 화면에 '이건 왜 정답 아냐?' 제보 버튼" · ⑽ "여태 나온 아이디어는 전부 샘플로 조금씩".
// ★ 판정은 퀴즈와 같다 — normalizeAnswer + answerFlex(flexCanon · 끝맺음 떼기). 세트가 정한 name / variants 만 정답(docs/18 §9).
// ★ 이 파일은 순수 함수만 — 서버(판정 · 정산)와 화면(표시 · 연습 더미)이 같이 쓴다.
// =============================================================================

import { flexCanon, stripEnding } from '../answerFlex.js';
import { normalizeAnswer } from '../normalize.js';

/** 많이 말하기 · 겹치면 무효가 쓰는 세트의 최소 항목 수(18 §9 minItems) — kind closed 만 */
export const TOPIC_MIN_ITEMS = 20;
/** 많이 말하기 — 세트에 timeSec 이 없을 때 */
export const MANY_DEFAULT_SEC = 30;
/** 많이 말하기 — 정답 공개(누가 뭘 말했나 · 못 말한 것) */
export const MANY_REVEAL_MS = 12_000;
/** 많이 말하기 — 한 사람이 보낼 수 있는 입력 수(판 하나) · 오답 기록 상한 */
export const MANY_MAX_TRIES = 300;
export const MANY_WRONG_KEEP = 30;
/** 겹치면 무효 — 판 수 · 판마다 입력 시간 · 공개 */
export const UNIQUE_ROUNDS = 3;
export const UNIQUE_PLAY_MS = 15_000;
export const UNIQUE_REVEAL_MS = 6_000;
/** 객관식 10연속 — 문항 수 · 문항당 시간 · 공개 · 준비 */
export const CHOICE_COUNT = 10;
export const CHOICE_PLAY_MS = 7_000;
export const CHOICE_REVEAL_MS = 1_500;
export const CHOICE_READY_MS = 300;
/** 객관식 — 고르는 문항: 알가치 ≥ 2(판정 전 null = 2) · 등급 1~3 */
export const CHOICE_MIN_WORTH = 2;
export const CHOICE_MAX_GRADE = 3;
/** 입력 글 상한 */
export const TOPIC_TEXT_MAX = 40;

export interface TopicItemLite {
  id: string;
  name: string;
  /** 화면용 짧은 이름(없으면 name) */
  label?: string | null;
  variants?: readonly string[];
}

/** 화면에 보일 이름 */
export function topicLabel(it: Pick<TopicItemLite, 'name' | 'label'>): string {
  return it.label && it.label.trim() ? it.label : it.name;
}

/** 한 표기의 판정 열쇠들 — 정규화 · flexCanon(괄호 · 관사 · 가운뎃점 지움) */
function keysOf(s: string): string[] {
  const out = new Set<string>();
  const a = normalizeAnswer(s);
  if (a) out.add(a);
  const b = flexCanon(s);
  if (b) out.add(b);
  return [...out];
}

/**
 * ★ 판정 맵: 열쇠 → 항목 id. 같은 열쇠가 두 항목에 걸리면(세트 검사가 막지만 방어) 먼저 것.
 *   name 의 열쇠가 다른 항목의 변형 열쇠보다 앞선다.
 */
export function buildTopicMatcher(items: readonly TopicItemLite[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) for (const k of keysOf(it.name)) if (!m.has(k)) m.set(k, it.id);
  for (const it of items) for (const v of it.variants ?? []) for (const k of keysOf(v)) if (!m.has(k)) m.set(k, it.id);
  return m;
}

/** 입력 → 항목 id (없으면 null). 퀴즈와 같은 꼴: 정규화 → flexCanon → 끝맺음("…입니다" · "…요") 뗀 것(2자 이상) */
export function matchTopic(matcher: ReadonlyMap<string, string>, raw: string): string | null {
  const text = String(raw ?? '').slice(0, TOPIC_TEXT_MAX);
  for (const k of keysOf(text)) {
    const hit = matcher.get(k);
    if (hit) return hit;
  }
  const e = stripEnding(text);
  if (e !== text) for (const k of keysOf(e)) if (k.length >= 2 && matcher.has(k)) return matcher.get(k)!;
  return null;
}

/**
 * ★ 겹치면 무효 정산 — 계정 → 고른 항목(null = 정답 아님 · 안 냄).
 *   혼자만 낸 정답 = 1 · 둘 이상이 같은 항목 = 그들 전원 0 · 정답 밖 = 0
 */
export function uniqueResult(picks: ReadonlyMap<string, string | null>): Map<string, { itemId: string | null; dup: boolean; win: boolean }> {
  const count = new Map<string, number>();
  for (const id of picks.values()) if (id) count.set(id, (count.get(id) ?? 0) + 1);
  const out = new Map<string, { itemId: string | null; dup: boolean; win: boolean }>();
  for (const [a, id] of picks) {
    const n = id ? (count.get(id) ?? 0) : 0;
    out.set(a, { itemId: id, dup: n > 1, win: n === 1 });
  }
  return out;
}

/** ★ 많이 말하기 공개 — 사람마다 "나만 말한 답" · 아무도 못 말한 항목 */
export function manyReveal(found: ReadonlyMap<string, readonly string[]>, allIds: readonly string[]): { only: Map<string, string[]>; missed: string[] } {
  const by = new Map<string, number>();
  for (const ids of found.values()) for (const id of new Set(ids)) by.set(id, (by.get(id) ?? 0) + 1);
  const only = new Map<string, string[]>();
  for (const [a, ids] of found) only.set(a, ids.filter((id) => by.get(id) === 1));
  const missed = allIds.filter((id) => !by.has(id));
  return { only, missed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 연습 더미(로비 "골라 하기" — 실제 세트를 스포하지 않는다 · DB 를 보지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
const dummy = (slug: string, names: string[][]): TopicItemLite[] =>
  names.map(([name, ...variants], i) => ({ id: `${slug}-${String(i + 1).padStart(3, '0')}`, name: name!, variants }));

export const TOPIC_DUMMY: readonly { topic: string; nameKo: string; items: TopicItemLite[] }[] = [
  {
    topic: 'dummy-color',
    nameKo: '색깔 이름',
    items: dummy('dummy-color', [
      ['빨강', '빨간색', '빨강색', '적색'],
      ['주황', '주황색'],
      ['노랑', '노란색', '노랑색', '황색'],
      ['초록', '초록색', '녹색'],
      ['파랑', '파란색', '파랑색', '청색'],
      ['남색'],
      ['보라', '보라색'],
      ['검정', '검은색', '검정색', '흑색'],
      ['하양', '흰색', '하얀색', '백색'],
      ['회색', '잿빛'],
      ['분홍', '분홍색', '핑크'],
      ['갈색', '밤색'],
      ['하늘색'],
      ['연두', '연두색'],
      ['청록', '청록색'],
      ['베이지'],
      ['금색', '황금색'],
      ['은색'],
      ['자주', '자주색'],
      ['카키'],
    ]),
  },
  {
    topic: 'dummy-fruit',
    nameKo: '과일',
    items: dummy('dummy-fruit', [
      ['사과'], ['배'], ['포도'], ['딸기'], ['수박'], ['참외'], ['복숭아'], ['자두'], ['귤', '감귤'], ['오렌지'],
      ['바나나'], ['키위', '참다래'], ['망고'], ['파인애플'], ['체리'], ['레몬'], ['감'], ['석류'], ['블루베리'], ['멜론'],
    ]),
  },
  {
    topic: 'dummy-week',
    nameKo: '요일 · 계절',
    items: dummy('dummy-week', [
      ['월요일'], ['화요일'], ['수요일'], ['목요일'], ['금요일'], ['토요일'], ['일요일'], ['봄'], ['여름'], ['가을'], ['겨울'],
    ]),
  },
];

/** 객관식 연습 더미 3문항(보기 4 · 정답 첫 칸 — 서버가 섞는다) */
export const CHOICE_DUMMY: readonly { text: string; category: string; options: [string, string, string, string] }[] = [
  { text: '연습 — 무지개의 일곱 색 가운데 맨 위(바깥쪽) 색은?', category: '연습', options: ['빨강', '보라', '초록', '노랑'] },
  { text: '연습 — 일주일의 첫날로 달력 맨 앞에 흔히 오는 요일은?', category: '연습', options: ['일요일', '수요일', '금요일', '목요일'] },
  { text: '연습 — 물이 어는 온도(섭씨)는?', category: '연습', options: ['0도', '10도', '100도', '-10도'] },
];

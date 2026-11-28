// =============================================================================
// ★★★ R125 B1 (찬종 "어떤 요소를 클릭해서 화면이 바뀔때 렌더링이 덜된 모습을 보이는건 굉장히 어설퍼 보여") —
//   열고 나서 받는 값의 "마지막에 안 값" 한 곳. 화면은 연 순간 이 값으로 다 그리고, 뒤에서 새 값을 받아 조용히 바꾼다(깜빡임 · 자리 밀림 없이).
//   미리 읽기(warm) = 로비에 들어올 때 · 사람이 화면에 보일 때 부른다 → 누를 때는 이미 들어 있다.
//   ★ 값을 쓰는 순간(포인트 쓰기 등)은 서버가 다시 센다 — 여기 값은 보여 주기만.
// =============================================================================

import { useEffect, useSyncExternalStore } from 'react';

interface Slot {
  value: unknown;
  has: boolean;
  at: number;
  p: Promise<unknown> | null;
  /** 마지막 받기가 실패했고 든 값도 없다 */
  failed: boolean;
}
const slots = new Map<string, Slot>();
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version += 1;
  for (const f of subs) f();
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

const slot = (key: string): Slot => {
  let s = slots.get(key);
  if (!s) {
    s = { value: undefined, has: false, at: 0, p: null, failed: false };
    slots.set(key, s);
  }
  return s;
};

/** 든 값(없으면 undefined) */
export function peek<T>(key: string): T | undefined {
  const s = slots.get(key);
  return s?.has ? (s.value as T) : undefined;
}
export function has(key: string): boolean {
  return slots.get(key)?.has ?? false;
}

/** 값을 넣는다(다른 길로 새 값을 알았을 때 — 예: 포인트를 쓴 뒤 서버가 돌려준 잔액) */
export function put<T>(key: string, value: T): void {
  const s = slot(key);
  s.value = value;
  s.has = true;
  s.at = Date.now();
  emit();
}

/**
 * 받아서 넣는다(같은 열쇠를 받는 중이면 그 약속을 같이 쓴다). maxAgeMs 안에 받은 값이 있으면 다시 받지 않는다.
 * 실패(null · 던짐)는 든 값을 지우지 않는다 — 옛 값이라도 그대로 보인다.
 */
export function warm<T>(key: string, load: () => Promise<T | null>, maxAgeMs = 0): Promise<T | undefined> {
  const s = slot(key);
  if (s.has && maxAgeMs > 0 && Date.now() - s.at < maxAgeMs) return Promise.resolve(s.value as T);
  if (s.p) return s.p as Promise<T | undefined>;
  const p = load()
    .then((v) => {
      if (v !== null && v !== undefined) {
        s.value = v;
        s.has = true;
        s.at = Date.now();
        s.failed = false;
      } else if (!s.has) s.failed = true;
      return peek<T>(key);
    })
    .catch(() => {
      if (!s.has) s.failed = true;
      return peek<T>(key);
    })
    .finally(() => {
      s.p = null;
      emit();
    });
  s.p = p;
  return p;
}

/** 화면 쪽 — 든 값으로 바로 그리고(없으면 undefined) · 열 때 한 번 새로 받는다(refresh) */
export function useWarm<T>(key: string | null, load: () => Promise<T | null>, refresh = true): T | undefined {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (key && refresh) void warm(key, load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? peek<T>(key) : undefined;
}

/** 받기가 실패했고 든 값도 없나(화면이 "못 불러왔어요"를 고를 때 — 받는 중 · 아직 안 받음은 false) */
export function failed(key: string): boolean {
  const s = slots.get(key);
  return Boolean(s && !s.has && !s.p && s.failed);
}

/** 지운다(로그아웃 — 다른 계정의 값이 남지 않게) */
export function drop(key: string): void {
  slots.delete(key);
  emit();
}

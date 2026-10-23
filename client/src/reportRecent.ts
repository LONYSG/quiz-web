// =============================================================================
// ★★ R065 (D-270) — 제보 메뉴의 "최근 문제 · 미니게임" 목록 (찬종: "미니게임은 템포가 워낙 빠르다보니 '이 미니게임 제보' 버튼을 사실상 쓸 수가 없어")
//
// ★ 넣는 때: 문제 — question.resolved(번호 · 순번 · 질문 앞 24자 · 정답은 안 담음) · 미니게임 — play 단계 진입(판 하나에 한 번 · 문항 있는 게임은 문항마다)
// ★ 모듈 변수 + sessionStorage('report.recent' · 30개) — 새로고침 · 방 나가기에도 남는다(결과 화면이 깨져 방을 나간 뒤 제보하려던 경우) · 로그아웃 때 비움
// =============================================================================

export interface RecentTarget {
  /** 같은 대상을 두 번 넣지 않으려는 열쇠 */
  key: string;
  questionId: string | null;
  questionIndex: number | null;
  /** 질문 앞 24자(문제만) */
  text: string | null;
  minigameKey: string | null;
  minigameItem: string | null;
  /** 기기 시각(ms) — 서버가 그 판을 찾을 때 쓴다 */
  at: number;
}

const STORE_KEY = 'report.recent';
const MAX = 30;

let list: RecentTarget[] = load();
const listeners = new Set<() => void>();

function load(): RecentTarget[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? (v as RecentTarget[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* 저장 못 해도 이 탭에선 남는다 */
  }
  listeners.forEach((l) => l());
}

function push(t: RecentTarget) {
  if (list.some((x) => x.key === t.key)) return;
  list = [t, ...list].slice(0, MAX);
  save();
}

export function noteRecentQuestion(gameId: string | null, questionId: string, index: number, text: string) {
  push({ key: `q:${gameId ?? ''}:${questionId}`, questionId, questionIndex: index, text: [...text].slice(0, 24).join(''), minigameKey: null, minigameItem: null, at: Date.now() });
}

export function noteRecentMinigame(token: string, roundIndex: number, key: string, itemId: string | null) {
  push({ key: itemId ? `m:${token}:${roundIndex}` : `m:${token}`, questionId: null, questionIndex: null, text: null, minigameKey: key, minigameItem: itemId, at: Date.now() });
}

export function clearRecentTargets() {
  list = [];
  save();
}

export const recentTargets = () => list;
export function subscribeRecent(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

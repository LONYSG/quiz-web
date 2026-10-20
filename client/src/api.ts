// =============================================================================
// HTTP API 클라이언트
//
// ★ 절대 URL을 쓰지 않는다. 같은 오리진에 상대 경로로 요청한다.
//   터널 URL이 바뀌어도 클라이언트를 고칠 필요가 없다.
//   개발 중에는 Vite 프록시가 /api 를 서버로 넘긴다.
// =============================================================================

export interface Account {
  accountId: string;
  nickname: string;
  /** ★ R043 — 프로필 사진 버전 (방 목록 화면의 내 사진) */
  avatarV?: number | null;
  /** ★ R043 — 관리자가 초기화한 계정 (새 비밀번호 화면만) */
  mustChangePassword?: boolean;
}

export interface ApiError {
  ok: false;
  field?: string;
  message?: string;
}

async function post<T>(pathname: string, body?: unknown): Promise<T> {
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    // 같은 오리진이라 기본값으로도 쿠키가 붙지만 의도를 명시한다
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) throw json;
  return json;
}

export async function signup(
  loginId: string,
  password: string,
  nickname: string,
): Promise<Account> {
  const r = await post<{ ok: true; account: Account }>('/api/auth/signup', {
    loginId,
    password,
    nickname,
  });
  return r.account;
}

export async function login(loginId: string, password: string): Promise<Account> {
  const r = await post<{ ok: true; account: Account }>('/api/auth/login', { loginId, password });
  return r.account;
}

/** ★ R043 — 관리자 초기화 뒤 새 비밀번호 */
export async function setNewPassword(password: string): Promise<void> {
  await post('/api/auth/password', { password });
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
}

export interface MeResponse {
  account: Account;
  currentRoomId: string | null;
}

export async function fetchMe(): Promise<MeResponse | null> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const json = (await res.json()) as { ok: true; account: Account; currentRoomId: string | null };
  return { account: json.account, currentRoomId: json.currentRoomId };
}

/** ★ R048 — 포인트 = 맞힌 문제 수 − 쓴 포인트 (D-229) */
export interface PointBalance {
  earned: number;
  /** ★ R050 — 번 것의 두 갈래 (맞힌 문제 · 미니게임 보상) */
  correct?: number;
  rewards?: number;
  spent: number;
  balance: number;
}
export async function fetchPoints(): Promise<PointBalance | null> {
  const res = await fetch('/api/me/points', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const json = (await res.json()) as { ok: true } & PointBalance;
  return { earned: json.earned, correct: json.correct, rewards: json.rewards, spent: json.spent, balance: json.balance };
}

// ── ★★ R049 — 이모티콘샵 · 뽑기 (D-231)
export interface ShopTheme {
  key: string;
  name: string;
  price: number;
  total: number;
  owned: number[];
}
export interface ShopView {
  balance: number;
  themes: ShopTheme[];
}
export async function fetchShop(): Promise<ShopView | null> {
  const res = await fetch('/api/shop', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const json = (await res.json()) as { ok: true } & ShopView;
  return { balance: json.balance, themes: json.themes };
}
export interface DrawResult {
  emoji: { id: number; name: string; themeKey: string };
  balance: number;
  owned: number[];
  total: number;
  price: number;
}
export class DrawError extends Error {
  constructor(
    public reason: 'insufficient' | 'complete' | 'other',
    message: string,
    public balance: number | null = null,
  ) {
    super(message);
  }
}
/** 뽑기 — 성공이면 결과, 모자라거나 다 모았으면 DrawError(reason) */
export async function drawEmoji(themeKey: string): Promise<DrawResult> {
  const res = await fetch('/api/shop/draw', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ themeKey }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<DrawResult> & { ok?: boolean; reason?: string; message?: string };
  if (!res.ok || !json.ok || !json.emoji) {
    const reason = json.reason === 'insufficient' || json.reason === 'complete' ? json.reason : 'other';
    throw new DrawError(reason, json.message ?? '뽑기에 실패했어요. 다시 해 주세요.', typeof json.balance === 'number' ? json.balance : null);
  }
  return { emoji: json.emoji, balance: json.balance ?? 0, owned: json.owned ?? [], total: json.total ?? 0, price: json.price ?? 0 };
}

export function errorMessage(err: unknown, fallback = '요청을 처리할 수 없습니다.'): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * ★ R034 — 닉네임 변경. 로비(또는 방 밖)에서만 된다. 겹치면 409 + 안내 문구.
 */
export async function changeNickname(nickname: string): Promise<string> {
  const res = await fetch('/api/auth/nickname', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname }),
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; nickname?: string } & ApiError;
  if (!res.ok || !json.nickname) throw json;
  return json.nickname;
}

/** ★ R034 — 계정에 저장된 화면·소리 설정. null = 아직 저장한 적 없음 */
export interface ServerPrefs {
  theme?: string;
  bgmOn?: boolean;
  bgmTrack?: string;
  bgmVolume?: number;
  sfxOn?: boolean;
  sfxVolume?: number;
  /** ★ R038 */
  chatOn?: boolean;
  chatVolume?: number;
  /** ★ R039 — 이모티콘 10칸 (번호) */
  emojiSlots?: number[];
  /** ★ R057 — 고르기 창: 입력창에 넣기(true) · 바로 보내기(false) */
  emojiInsert?: boolean;
}

export async function fetchPrefs(): Promise<ServerPrefs | null> {
  const res = await fetch('/api/auth/prefs', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`prefs ${res.status}`);
  const json = (await res.json()) as { ok: true; prefs: ServerPrefs | null };
  return json.prefs;
}

export async function savePrefs(prefs: ServerPrefs): Promise<void> {
  await fetch('/api/auth/prefs', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(prefs),
    credentials: 'same-origin',
  });
}

/** ★ R039 — 프로필 사진 올리기 (브라우저에서 자른 이미지). 성공하면 새 버전 */
export async function uploadAvatar(blob: Blob): Promise<number> {
  const res = await fetch('/api/avatar', {
    method: 'PUT',
    headers: { 'content-type': blob.type || 'image/png' },
    body: blob,
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; avatarV?: number } & ApiError;
  if (!res.ok || !json.avatarV) throw json;
  return json.avatarV;
}

/** ★ R039 — 프로필 사진 지우기 */
export async function deleteAvatar(): Promise<void> {
  const res = await fetch('/api/avatar', { method: 'DELETE', credentials: 'same-origin' });
  if (!res.ok) throw (await res.json().catch(() => ({}))) as ApiError;
}

// =============================================================================
// ★★★ R056 — 문제 평가(설문) · 다른 사람 업적
// =============================================================================
export interface QuestionFeedbackValue {
  vote: 1 | -1;
  reasons: string[];
  comment: string | null;
}

/** 평가 저장 (vote null = 취소). 성공하면 저장된 값(취소면 null) */
export async function postQuestionFeedback(body: {
  questionId: string;
  gameId: string;
  vote: 1 | -1 | null;
  reasons?: string[];
  comment?: string | null;
}): Promise<QuestionFeedbackValue | null> {
  const res = await fetch('/api/feedback/question', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; feedback?: QuestionFeedbackValue | null } & ApiError;
  if (!res.ok || !json.ok) throw json;
  return json.feedback ?? null;
}

export interface FeedbackItem {
  questionId: string;
  index: number;
  text: string;
  answer: string;
  vote: 1 | -1 | null;
  reasons: string[];
  comment: string | null;
}

/** 그 판 문제 목록 + 내 평가 */
export async function fetchGameFeedback(gameId: string): Promise<FeedbackItem[]> {
  const res = await fetch(`/api/feedback/game/${gameId}/mine`, { credentials: 'same-origin' });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: FeedbackItem[] } & ApiError;
  if (!res.ok || !json.items) throw json;
  return json.items;
}

/** 내가 참가한 마지막 끝난 판 (없으면 null) */
export async function fetchLastFeedbackGame(): Promise<string | null> {
  const res = await fetch('/api/feedback/last-game', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { gameId?: string | null };
  return json.gameId ?? null;
}

/** 다른 사람(또는 나)의 얻은 업적 */
export async function fetchAchievementsOf(accountId: string): Promise<{ key: string; earnedAt: string }[]> {
  const res = await fetch(`/api/profile/${accountId}/achievements`, { credentials: 'same-origin' });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; achievements?: { key: string; earnedAt: string }[] };
  if (!res.ok || !json.achievements) throw new Error(`achievements ${res.status}`);
  return json.achievements;
}

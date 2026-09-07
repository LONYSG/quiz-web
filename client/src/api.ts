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

export function errorMessage(err: unknown, fallback = '요청을 처리할 수 없습니다.'): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

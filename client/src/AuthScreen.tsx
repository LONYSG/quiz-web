// =============================================================================
// 로그인 / 회원가입 화면
//
// ★ 비밀번호 복구 기능이 없다 (Q-04 확정). 그 사실을 화면에 알려 준다.
//   알려주지 않으면 잊어버린 사람이 무한히 시도한다.
//
// ★ <main> 을 여기서 만들지 않는다. App 의 셸 안에 들어간다 (D-027).
//   셸이 안내 배너를 항상 같은 자리에 그리기 때문이다.
// =============================================================================

import { useState } from 'react';
import { errorMessage, login, signup, type Account } from './api.js';

interface Props {
  onAuthed: (account: Account) => void;
  /** 초대 링크로 들어온 경우, 로그인 후 이 방으로 들어간다 */
  pendingRoomId: string | null;
}

export default function AuthScreen({ onAuthed, pendingRoomId }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account =
        mode === 'login'
          ? await login(loginId, password)
          : await signup(loginId, password, nickname);
      onAuthed(account);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>상식 퀴즈</h1>
      <p className="sub">친구들과 함께하는 실시간 주관식 퀴즈</p>

      {/* ★ 이것은 에러가 아니라 안내다. 배너(.notice)와 다른 모양을 쓴다.
          같은 모양이면 사용자가 "무슨 문제가 생겼나" 로 읽는다. */}
      {pendingRoomId && (
        <p className="info">로그인하면 초대받은 방으로 바로 들어갑니다.</p>
      )}

      <section className="card">
        <div className="tabs">
          <button
            type="button"
            className={mode === 'login' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            아이디
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="영문 소문자, 숫자, _ , -  (3~20자)"
              required
            />
          </label>

          {mode === 'signup' && (
            <label>
              닉네임
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={12}
                placeholder="1~12자. 대소문자를 구분합니다"
                required
              />
            </label>
          )}

          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="4자 이상"
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" disabled={busy}>
            {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작'}
          </button>
        </form>

        <p className="note">
          ★ 비밀번호를 잊으면 복구할 수 없습니다. 친구들끼리 쓰는 서비스라 재설정 기능을
          만들지 않았습니다. 잊었다면 서버를 켜 준 사람에게 재설정을 요청해 주세요.
        </p>
      </section>
    </>
  );
}

// =============================================================================
// ★★ 새 비밀번호 화면 — 관리자가 초기화한 계정만 (R043 A-4 · 건우 확정)
//
// ★ 관리자가 `npm run reset-password -- <아이디>` 로 초기화하면 비밀번호 0000 + "바꿔야 함" 표시(DB).
//   그 계정은 로그인 뒤 **이 화면만** 뜬다 — 다른 곳으로 못 간다(소켓도 열지 않고, 서버도 방 입장 등을 막는다).
// ★ 판단 기준은 비밀번호가 0000 인가가 아니라 **표시**다 — 스스로 0000 으로 정한 계정에는 이 화면이 뜨지 않는다.
// ★ 여기서는 새 비밀번호로 0000 을 쓸 수 없다 (서버도 막는다). 가입 화면과 같은 카드 · 같은 입력칸 · 같은 로딩 버튼.
// =============================================================================

import { useState } from 'react';
import { errorMessage, setNewPassword } from './api.js';
import BusyButton from './BusyButton.js';

interface Props {
  nickname: string;
  onDone: () => void;
  onLogout: () => void;
}

export default function PasswordChange({ nickname, onDone, onLogout }: Props) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) {
      setError('두 비밀번호가 달라요.');
      return;
    }
    if (pw === '0000') {
      setError('0000 은 쓸 수 없어요. 다른 비밀번호를 정해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setNewPassword(pw);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">Q</span>
        <h1>새 비밀번호</h1>
        <p className="sub">
          <span className="nick">{nickname}</span> 님, 비밀번호가 초기화됐어요
        </p>
      </div>
      <section className="card auth-card password-change">
        <form onSubmit={(e) => void submit(e)}>
          <label>
            새 비밀번호
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="4자 이상 · 0000 은 안 돼요" required />
          </label>
          <label>
            한 번 더
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <BusyButton type="submit" className="primary wide" busy={busy}>
            저장하고 시작
          </BusyButton>
        </form>
      </section>
      <button type="button" className="ghost tiny" onClick={onLogout}>
        로그아웃
      </button>
    </>
  );
}

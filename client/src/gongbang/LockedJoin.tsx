// =============================================================================
// ★★★ R117 (docs/24 8절 "잠긴 방 입장") — 방 제목 · 숫자 4칸 · 숫자판 · 틀림("3번 남았어요") · 막힘(남은 시간)
//   ★ 서버가 room.lockRequired { code, title, error, left, waitMs } 를 보내면 열린다(목록에서 🔒 방을 누르면 바로 연다).
//   ★ PC 는 키보드 숫자 · Backspace · Enter 도 받는다. 4자리를 다 넣으면 [들어가기]가 켜진다(바로 보내지 않는다 — 고칠 틈).
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Lock } from 'lucide-react';
import Icon from '../Icon.js';
import PopupClose from '../PopupClose.js';

export interface LockState {
  code: string;
  title: string;
  error: 'ROOM_LOCKED' | 'WRONG_PASSWORD' | 'PASSWORD_LOCKED' | null;
  left: number | null;
  /** 막힌 때(이 화면 시계 기준 · 끝나는 시각) */
  until: number | null;
  /** 서버 응답마다 바뀐다(틀리면 칸을 비운다) */
  tick: number;
}

interface Props {
  lock: LockState;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

export default function LockedJoin({ lock, onSubmit, onClose }: Props) {
  const [pin, setPin] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const blocked = lock.until !== null && lock.until > now;

  useEffect(() => setPin(''), [lock.tick]);
  useEffect(() => {
    if (lock.until === null) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [lock.until]);

  const press = useCallback((d: string) => setPin((p) => (p.length >= 4 ? p : p + d)), []);
  const back = useCallback(() => setPin((p) => p.slice(0, -1)), []);
  const submit = useCallback(() => {
    if (pin.length === 4 && !blocked) onSubmit(pin);
  }, [pin, blocked, onSubmit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') submit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, press, back, submit]);

  const waitMin = lock.until ? Math.max(1, Math.ceil((lock.until - now) / 60_000)) : 0;
  const msg = blocked
    ? `너무 많이 틀렸어요 — ${waitMin}분 뒤 다시 해 주세요`
    : lock.error === 'WRONG_PASSWORD'
      ? `틀렸어요 — ${lock.left ?? 0}번 남았어요`
      : null;

  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal gb-lock" role="dialog" aria-label="잠긴 방" data-gb-lock-pop>
        <div className="pop-head confirm-head">
          <PopupClose onClose={onClose} />
        </div>
        <p className="confirm-title gb-lock-title">
          <Icon icon={Lock} /> {lock.title}
        </p>
        <p className="confirm-note">잠긴 방이에요 · 비밀번호 4자리</p>
        <div className="pin" aria-label={`${pin.length}자리 넣음`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i === pin.length && !blocked ? 'cur' : undefined}>
              {pin[i] ?? ''}
            </span>
          ))}
        </div>
        <p className={msg ? 'gb-lock-msg' : 'gb-lock-msg empty'} role="alert" data-gb-lock-msg>
          {msg ?? ' '}
        </p>
        <div className="numpad" data-arrow-nav>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className="ghost" disabled={blocked} onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <span aria-hidden="true" />
          <button type="button" className="ghost" disabled={blocked} onClick={() => press('0')}>
            0
          </button>
          <button type="button" className="ghost" aria-label="지우기" disabled={blocked} onClick={back}>
            <Icon icon={Delete} />
          </button>
        </div>
        <div className="confirm-actions">
          <button type="button" className="primary tone-calm" data-gb-lock-go disabled={pin.length !== 4 || blocked} onClick={submit}>
            들어가기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

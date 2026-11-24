// =============================================================================
// ★★★ R117 (docs/24 8절 "방 만들기") — 아래에서 올라오는 창: 종류 셋 · 제목 · 정원(− 8 +) · 잠금 + 숫자 4자리 · [만들기]
//   ★ 기존 부품 꼴만 쓴다 — 창 = .modal(모바일은 아래 붙음 .gb-sheet) · 칩 = .preset · 입력칸 = 앱 input · 버튼 = .primary.big-btn
//   ★ "이 옵션으로 방 만들기"(빠른 입장)는 종류 · 난이도 · 미니게임을 채워 연다 — 난이도 · 미니게임은 방이 생긴 뒤 설정으로 보낸다(App)
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GONGBANG, ROOM_KINDS, minPlayersOf, type DifficultyLevel, type RoomKind } from '@quiz/shared';
import { Minus, Plus } from 'lucide-react';
import Icon from '../Icon.js';
import PopupClose from '../PopupClose.js';
import BusyButton from '../BusyButton.js';
import { KIND_ICON, KIND_LABEL, LEVEL_LABEL } from './kinds.js';

export interface CreatePrefill {
  kind: RoomKind;
  level: DifficultyLevel | null;
  minigames: boolean | null;
}

export interface CreatePayload {
  title: string;
  kind: RoomKind;
  maxPlayers: number;
  password: string | null;
}

interface Props {
  prefill: CreatePrefill;
  busy: boolean;
  onCreate: (p: CreatePayload, after: { level: DifficultyLevel | null; minigames: boolean | null }) => void;
  onClose: () => void;
}

export default function CreateRoom({ prefill, busy, onCreate, onClose }: Props) {
  const [kind, setKind] = useState<RoomKind>(prefill.kind);
  const [title, setTitle] = useState('');
  const [max, setMax] = useState<number>(GONGBANG.DEFAULT_MAX_PLAYERS);
  const [lockOn, setLockOn] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const min = minPlayersOf(kind);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (max < min) setMax(min);
  }, [min, max]);

  const submit = () => {
    const t = title.trim();
    if (!t) {
      setErr('방 제목을 입력해 주세요.');
      titleRef.current?.focus();
      return;
    }
    if (lockOn && !/^\d{4}$/.test(pin)) {
      setErr('비밀번호는 숫자 4자리예요.');
      return;
    }
    setErr(null);
    onCreate({ title: t, kind, maxPlayers: max, password: lockOn ? pin : null }, { level: kind === 'quiz' ? prefill.level : null, minigames: kind === 'quiz' ? prefill.minigames : null });
  };

  const extra = kind === 'quiz' && (prefill.level || prefill.minigames !== null)
    ? [prefill.level ? LEVEL_LABEL[prefill.level] : null, prefill.minigames === true ? '미니게임 켬' : prefill.minigames === false ? '미니게임 끔' : null].filter(Boolean).join(' · ')
    : '';

  return createPortal(
    <div
      className="modal-back popup-back gb-sheet-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal gb-sheet gb-create" role="dialog" aria-label="방 만들기" data-gb-create>
        <div className="pop-head">
          <p className="pop-title">방 만들기</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="settings">
          <div className="set-row">
            <span className="set-label">종류</span>
            <div className="preset-row">
              {ROOM_KINDS.map((k) => (
                <button key={k} type="button" data-kind={k} aria-pressed={kind === k} className={`preset gb-kind-chip k-${k}${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>
                  <Icon icon={KIND_ICON[k]} /> {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {extra && <p className="dim gb-extra">{extra}</p>}
          </div>
          <div className="set-row">
            <span className="set-label">방 제목</span>
            <input
              ref={titleRef}
              data-gb-title
              value={title}
              maxLength={30}
              placeholder="방 제목"
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
              }}
            />
          </div>
          <div className="set-row">
            <span className="set-label">정원</span>
            <div className="stepper" data-gb-max>
              <button type="button" className="ghost" aria-label="정원 줄이기" disabled={max <= min} onClick={() => setMax((n) => Math.max(min, n - 1))}>
                <Icon icon={Minus} />
              </button>
              <b className="mono">{max}</b>
              <button type="button" className="ghost" aria-label="정원 늘리기" disabled={max >= GONGBANG.MAX_PLAYERS} onClick={() => setMax((n) => Math.min(GONGBANG.MAX_PLAYERS, n + 1))}>
                <Icon icon={Plus} />
              </button>
            </div>
          </div>
          <div className="set-row">
            <span className="set-label">잠금</span>
            <div className="preset-row">
              <label className="mg-check">
                <input type="checkbox" data-gb-lock checked={lockOn} onChange={(e) => setLockOn(e.target.checked)} />
                비밀번호
              </label>
            </div>
            {lockOn && (
              <>
                <input
                  className="mono gb-pin-input"
                  data-gb-pin
                  value={pin}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="숫자 4자리"
                  aria-label="비밀번호 숫자 4자리"
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
                  }}
                />
                <p className="dim gb-extra">초대 링크로 온 친구는 비밀번호 없이 들어와요</p>
              </>
            )}
          </div>
        </div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <BusyButton className="primary big-btn gb-wide" onClick={submit} busy={busy}>
          만들기
        </BusyButton>
      </div>
    </div>,
    document.body,
  );
}

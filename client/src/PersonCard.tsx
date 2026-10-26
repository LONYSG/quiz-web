// =============================================================================
// ★★ 프로필 카드 · 전체 업적 창 (R056 · D-248)
//
// ★ 찬종(2026-10-21): "프사 확대 기능 있으면 좋겠고 다른 사람의 업적을 볼수도, 깰 수 있는 업적을 보는 창도 있으면 좋겠어."
// ★ 아바타(참여자 칸 · 👥 창 · 채팅 줄 · 결과 화면)를 누르면 이 카드 — 팝업 하나(popup.ts) · ✕ · 바깥 · Esc(D-217).
//   · 사진이 있으면 **크게**(저장 원본 256×256 — R039 — 을 화면 폭 안에서 그대로 확대) · 글자 아바타는 확대하지 않는다(보통 크기).
//   · 업적 칸 — 깬 것만 · 날짜 · [전체 업적] → 모든 업적(깬 것 ✓ 날짜 · 안 깬 것 흐리게 + 조건 · 숨김 없음).
// ★ 업적은 공개 정보로 본다(표시만 — 포인트 없음). 로그인한 사람만 읽는다(GET /api/profile/:id/achievements).
// =============================================================================

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ACHIEVEMENTS, achievementDef } from '@quiz/shared';
import { Award, Ban, Check, Crown, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import Avatar from './Avatar.js';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { fetchAchievementsOf } from './api.js';
import { closePopup, openPopup, useCurrentPopup } from './popup.js';

export interface PersonRef {
  accountId: string;
  nickname: string;
  colorIndex: number;
  avatarV?: number | null;
}

// ── 누구의 카드인가 (아바타 어디서든 연다) ─────────────────────────────────────────
let target: PersonRef | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ── ★★ R063 (D-262 · 찬종 #16 "프로필도 표시하면서 강퇴/차단/친구추가 같은것도 같이 … 어떻게 할까요? 같은 부자연스러운 문장 빼고. 합치자")
//   방(Lobby)이 "이 사람에게 할 수 있는 것" 을 알려 준다 → 카드 아래 버튼 줄(문장 없이). 방 밖이면 버튼 없음.
export interface PersonActions {
  /** 친구 상태 — none 이면 [친구 신청] */
  friend: 'none' | 'friend' | 'pending';
  onFriend?: () => void;
  /** 방장만 — 누르면 최종 확인(KickFlow) */
  onKick?: () => void;
  onBan?: () => void;
  onHost?: () => void;
}
let actionsOf: ((accountId: string) => PersonActions | null) | null = null;
export function setPersonActions(fn: ((accountId: string) => PersonActions | null) | null): void {
  actionsOf = fn;
  emit();
}

export function openPersonCard(p: PersonRef, as: 'card' | 'all' = 'card'): void {
  target = p;
  emit();
  openPopup(as === 'all' ? 'person-all' : 'person');
}

/** 날짜 — 2026-10-21 */
const day = (iso: string) => iso.slice(0, 10);

function useEarned(accountId: string | null) {
  const [earned, setEarned] = useState<Map<string, string> | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!accountId) return undefined;
    let alive = true;
    setEarned(null);
    setErr(false);
    fetchAchievementsOf(accountId)
      .then((list) => alive && setEarned(new Map(list.map((a) => [a.key, a.earnedAt]))))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [accountId]);
  return { earned, err };
}

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
}

function Shell({ label, className, onClose, children }: { label: string; className: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className}`} role="dialog" aria-label={label}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 카드 (사진 크게 · 깬 업적) */
function Card({ p, onClose }: { p: PersonRef; onClose: () => void }) {
  const { earned, err } = useEarned(p.accountId);
  const acts = actionsOf ? actionsOf(p.accountId) : null;
  const list = earned ? [...earned.entries()].sort((a, b) => a[1].localeCompare(b[1])) : [];
  return (
    <Shell label={`${p.nickname} 프로필`} className="person-card" onClose={onClose}>
      <div className="pop-head">
        <p className="pop-title" style={{ color: `var(--p${p.colorIndex})` }}>
          {p.nickname}
          {/* ★ R066 (D-292 · 찬종 #32 "친구 표시가 어정쩡 · 별도로 빼고 다른 기능들이랑 분리") — 친구 상태는 이름 옆 배지 */}
          {acts && acts.friend !== 'none' && (
            <span className="badge person-friend" data-act="friend-state">
              <Icon icon={UserCheck} /> {acts.friend === 'friend' ? '친구' : '신청함'}
            </span>
          )}
        </p>
        <PopupClose onClose={onClose} />
      </div>
      {p.avatarV ? (
        // ★ 원본(256×256)을 화면 폭 안에서 크게 — 원형으로 자른 사진이라 원 그대로
        <img className="person-photo" src={`/api/avatar/${p.accountId}?v=${p.avatarV}`} alt={`${p.nickname} 프로필 사진`} draggable={false} />
      ) : (
        <div className="person-letter">
          <Avatar nickname={p.nickname} colorIndex={p.colorIndex} large />
        </div>
      )}
      <section className="person-ach" data-loaded={earned ? '1' : undefined}>
        <h3>
          <Icon icon={Award} /> 업적 <span className="mono dim">{earned ? `${earned.size}/${ACHIEVEMENTS.length}` : ''}</span>
        </h3>
        {err && <p className="form-error">업적을 불러오지 못했어요</p>}
        {!earned && !err && <p className="dim">불러오는 중…</p>}
        {earned && list.length === 0 && <p className="dim person-none">아직 깬 업적이 없어요</p>}
        {list.length > 0 && (
          <ul className="person-ach-list">
            {list.map(([k, at]) => (
              <li key={k} data-ach={k}>
                <span aria-hidden="true">🏅</span> <strong>{achievementDef(k).name}</strong> <span className="dim mono">{day(at)}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="ghost tiny person-all-btn" onClick={() => openPersonCard(p, 'all')}>
          <Icon icon={Award} /> 전체 업적
        </button>
      </section>
      {/* ★ R063 — 이 사람에게 할 수 있는 것(버튼만 · 설명 문장 없음) */}
      {acts && ((acts.friend === 'none' && acts.onFriend) || acts.onHost || acts.onKick || acts.onBan) && (
        <div className="person-acts" data-person-acts>
          {acts.friend === 'none' && acts.onFriend && (
            <button type="button" className="ghost person-act" data-act="friend" onClick={() => { acts.onFriend?.(); onClose(); }}>
              <Icon icon={UserPlus} /> 친구 신청
            </button>
          )}
          {acts.onHost && (
            <button type="button" className="ghost person-act" data-act="host" onClick={acts.onHost}>
              <Icon icon={Crown} /> 방장 넘기기
            </button>
          )}
          {acts.onKick && (
            <button type="button" className="ghost person-act warn" data-act="kick" onClick={acts.onKick}>
              <Icon icon={UserMinus} /> 강퇴
            </button>
          )}
          {acts.onBan && (
            <button type="button" className="ghost person-act danger" data-act="ban" onClick={acts.onBan}>
              <Icon icon={Ban} /> 차단
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}

/** 전체 업적 — 깬 것 ✓ 날짜 · 안 깬 것 흐리게 + 조건 */
export function AllAchievements({ p, onClose }: { p: PersonRef; onClose: () => void }) {
  const { earned, err } = useEarned(p.accountId);
  const extra = earned ? [...earned.keys()].filter((k) => !ACHIEVEMENTS.some((a) => a.key === k)) : [];
  return (
    <Shell label={`${p.nickname} 전체 업적`} className="ach-all-modal" onClose={onClose}>
      <div className="pop-head">
        <p className="pop-title">
          <Icon icon={Award} /> <span style={{ color: `var(--p${p.colorIndex})` }}>{p.nickname}</span> — 전체 업적{' '}
          <span className="mono dim">{earned ? `${earned.size}/${ACHIEVEMENTS.length}` : ''}</span>
        </p>
        <PopupClose onClose={onClose} />
      </div>
      {err && <p className="form-error">업적을 불러오지 못했어요</p>}
      {!earned && !err && <p className="dim">불러오는 중…</p>}
      {earned && (
        <ul className="ach-list ach-all" data-loaded="1">
          {[...ACHIEVEMENTS.map((a) => a.key), ...extra].map((k) => {
            const d = achievementDef(k);
            const at = earned.get(k);
            return (
              <li key={k} className={at ? 'ach on' : 'ach'} data-ach={k}>
                <span className="ach-medal" aria-hidden="true">
                  {at ? <Icon icon={Check} /> : '🏅'}
                </span>
                <span className="ach-text">
                  <strong>{d.name}</strong>
                  <span className="dim ach-desc" title={d.desc} data-wrap-ok>{at ? `${day(at)} 달성 · ${d.desc}` : d.desc}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

/** 한 번만 둔다(로비) — 아바타가 연 카드를 그린다 */
export function PersonCardHost() {
  const cur = useCurrentPopup();
  const p = useSyncExternalStore(subscribe, () => target);
  const close = useCallback(() => closePopup(), []);
  const open = cur === 'person' || cur === 'person-all';
  useEsc(open, close);
  if (!open || !p) return null;
  return cur === 'person-all' ? <AllAchievements p={p} onClose={close} /> : <Card p={p} onClose={close} />;
}

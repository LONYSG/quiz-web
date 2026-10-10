// =============================================================================
// ★★★ 모바일 참여자 창 (R041 · 건우: "모바일에서는 다른 참여자가 아예 안 보여서 불편했다")
//
// ★ 상단 👥 → 이 창 (팝업 — 한 번에 하나 · 화면 가운데 · ✕ / Esc / 바깥 누르면 닫힘)
// ★ 사람마다: 프로필 사진 · 닉네임(색) · 순위 · 점수 + 👑 방장 · 나 · 접속 종료 · 닉네임 변경 필요 · 경험
//   ★ 로비에서는 점수 대신 경험률(로비 칸과 같은 정보)
// ★ 순서 (판단): 게임 중·결과 = 점수 높은 순(같으면 들어온 순) / 로비 = 들어온 순
// ★ 창을 열어 둔 채로도 점수·순위가 바로 바뀐다 — 방 상태(snapshot)를 그대로 그린다
// ★ 방장에게는 사람마다 강퇴/차단 입구 (KickFlow — 고르기 → 최종 확인). 자기 자신은 없다
// ★ 최대 10명이 스크롤 없이 한 화면 (한 줄 약 46px)
// =============================================================================

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { nicknameFits } from '@quiz/shared';
import Avatar from './Avatar.js';
import FitText from './FitText.js';
import type { PlayerView } from './useRoom.js';
import Icon from './Icon.js';
import { Crown } from 'lucide-react';
import PopupClose from './PopupClose.js';

interface Props {
  players: PlayerView[];
  myAccountId: string;
  isHost: boolean;
  /** 게임 중·결과 — 점수·순위를 보인다 */
  showScore: boolean;
  rankOf: (score: number) => number;
  rateOf: (accountId: string) => string | null;
  experiencedIds: Set<string>;
  onPick: (p: PlayerView) => void;
  onClose: () => void;
}

export default function PeoplePanel({ players, myAccountId, isHost, showScore, rankOf, rateOf, experiencedIds, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const list = showScore ? [...players].sort((a, b) => b.score - a.score) : players;
  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal people-modal" role="dialog" aria-label="참여자">
        <div className="pop-head">
          <p className="pop-title">참여자 {players.length}명</p>
          <PopupClose onClose={onClose} />
        </div>
        <ul className="people-list">
          {list.map((p) => {
            const me = p.accountId === myAccountId;
            const pickable = isHost && !me;
            const body = (
              <>
                <Avatar nickname={p.nickname} colorIndex={p.colorIndex} accountId={p.accountId} avatarV={p.avatarV} />
                <span className="people-name">
                  <FitText text={p.nickname} className="nick" style={{ color: `var(--p${p.colorIndex})` }} minPx={12} />
                  <span className="people-badges">
                    {p.isHost && (
                      <span className="host-mark" title="방장">
                        <Icon icon={Crown} fill="currentColor" />
                      </span>
                    )}
                    {me && <span className="badge me">나</span>}
                    {experiencedIds.has(p.accountId) && <span className="badge exp">경험</span>}
                    {!p.connected && <span className="badge off">접속 종료</span>}
                    {!nicknameFits(p.nickname) && <span className="badge off">닉네임 변경 필요</span>}
                  </span>
                </span>
                {showScore ? (
                  <span className="people-score mono">
                    {p.score > 0 && <span className="people-rank">{rankOf(p.score)}위</span>}
                    {p.score}점
                  </span>
                ) : (
                  <span className="people-rate dim mono">{rateOf(p.accountId) ?? ''}</span>
                )}
              </>
            );
            return (
              <li key={p.accountId} data-account={p.accountId} className={p.connected ? undefined : 'offline'}>
                {pickable ? (
                  <button type="button" className="people-row pickable" onClick={() => onPick(p)} aria-label={`${p.nickname} — 강퇴·차단`}>
                    {body}
                  </button>
                ) : (
                  <div className="people-row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        {isHost && players.length > 1 && <p className="people-tip dim">사람을 누르면 강퇴 · 차단</p>}
      </div>
    </div>,
    document.body,
  );
}

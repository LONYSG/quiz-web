// =============================================================================
// ★★ 로비 "미니게임 골라 하기" (R050 · D-234 — 찬종: "로비에서는 원하는 미니게임을 골라서 하는 메뉴를 신설하자 …
//   미니게임 테스트를 위해 매번 퀴즈를 풀 순 없잖아.")
// ★ 방장만 · 로비에서만 · 방에 있는 사람 전원 참가 · **연습 판**(판 점수 · 포인트 · 경험 · 순위 보상에 넣지 않는다 — 기록만 practice)
// ★ 팝업 규칙(popup.ts — 한 번에 하나 · ✕ · 바깥 · Esc) 그대로
// =============================================================================

import { useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Gamepad2 } from 'lucide-react';
import { MINIGAMES } from '@quiz/shared';
import Icon from '../Icon.js';
import PopupClose from '../PopupClose.js';
import { usePopup } from '../popup.js';
import { useDismiss } from '../useDismiss.js';

export default function MinigamePicker({ socket }: { socket: Socket }) {
  const [open, setOpen] = usePopup('minigame-pick');
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, '.mg-pick');
  return (
    <span className="mg-pick">
      <button type="button" id="minigame-pick-btn" className="ghost tiny mg-pick-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon icon={Gamepad2} /> 미니게임 골라 하기
      </button>
      {open && (
        <div className="mg-pick-pop" role="dialog" aria-label="미니게임 골라 하기">
          <div className="pop-head">
            <p className="pop-title">
              <Icon icon={Gamepad2} /> 미니게임 골라 하기
            </p>
            <PopupClose onClose={close} />
          </div>
          <p className="dim mg-pick-note">연습 판 — 방 사람 모두 함께 · 점수 · 포인트 없음</p>
          <div className="mg-pick-list" data-arrow-nav>
            {MINIGAMES.map((m) => (
              <button
                key={m.key}
                type="button"
                className="mg-pick-item"
                data-key={m.key}
                onClick={() => {
                  close();
                  socket.emit('minigame.practice', { key: m.key });
                }}
              >
                <strong>{m.name}</strong>
                <span className="dim">{m.oneLine}</span>
                <span className="mg-pick-meta mono">
                  {m.rounds}판 · 약 {Math.round(m.estSec / 60 * 10) / 10}분
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

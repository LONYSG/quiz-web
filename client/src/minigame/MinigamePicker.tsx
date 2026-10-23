// =============================================================================
// ★★ 로비 "미니게임 골라 하기" (R050 · D-234 — 찬종: "로비에서는 원하는 미니게임을 골라서 하는 메뉴를 신설하자 …
//   미니게임 테스트를 위해 매번 퀴즈를 풀 순 없잖아.")
// ★ 방장만 · 로비에서만 · 방에 있는 사람 전원 참가 · **연습 판**(판 점수 · 포인트 · 경험 · 순위 보상에 넣지 않는다 — 기록만 practice)
// ★ 팝업 규칙(popup.ts — 한 번에 하나 · ✕ · 바깥 · Esc) 그대로
// =============================================================================

import { useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Gamepad2 } from 'lucide-react';
import Icon from '../Icon.js';
import { usePopup } from '../popup.js';
import MinigameCatalog from './MinigameCatalog.js';

// ★★ R063 (D-258) — 옛 목록 창(길어서 페이지가 내려갔다 — 찬종 #6) → 미니게임 고르기 창(카드 · 창 안 스크롤 · [시작])
export default function MinigamePicker({ socket }: { socket: Socket }) {
  const [open, setOpen] = usePopup('minigame-pick');
  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    <span className="mg-pick">
      <button type="button" id="minigame-pick-btn" className="ghost tiny mg-pick-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon icon={Gamepad2} /> 미니게임 골라 하기
      </button>
      {open && (
        <MinigameCatalog
          mode="practice"
          editable
          onClose={close}
          onStart={(key) => {
            close();
            socket.emit('minigame.practice', { key });
          }}
        />
      )}
    </span>
  );
}

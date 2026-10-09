// =============================================================================
// ★★★ 강퇴 · 차단 흐름 (R041 · 건우)
//
// ★ 건우: "팝업이 떠서 강퇴인지 차단인지 정하고, 버튼 한 번에 바로 적용하지 말고 **최종 확인**을 거쳐 결정하게."
//   사람 선택(PC 참여자 칸 · 모바일 👥 창) → ① 강퇴 / 차단 고르기 → ② 최종 확인 → 서버 host.kick
// ★ 강퇴 = 방에서 내보낸다(링크로 다시 들어올 수 있다) / 차단 = 내보내고 이 방이 있는 동안 다시 못 들어온다.
// ★ 팝업은 한 번에 하나 (popup.ts) — 두 단계 모두 같은 'kick' 팝업 자리를 쓴다.
// =============================================================================

import type { Socket } from 'socket.io-client';
import ConfirmModal from './ConfirmModal.js';

export interface KickTarget {
  accountId: string;
  nickname: string;
  step: 'choose' | 'kick' | 'ban';
}

interface Props {
  socket: Socket;
  target: KickTarget;
  onStep: (step: KickTarget['step']) => void;
  onClose: () => void;
}

export default function KickFlow({ socket, target, onStep, onClose }: Props) {
  const name = <strong className="confirm-nick">{target.nickname}</strong>;
  if (target.step === 'choose') {
    return (
      <ConfirmModal
        key="choose"
        kind="kick-choose"
        title={<>{name} 님을 어떻게 할까요?</>}
        note="강퇴 — 다시 들어올 수 있어요 · 차단 — 이 방엔 다시 못 와요"
        actions={[
          { label: '강퇴', danger: true, onClick: () => onStep('kick') },
          { label: '차단', danger: true, onClick: () => onStep('ban') },
        ]}
        onCancel={onClose}
      />
    );
  }
  const ban = target.step === 'ban';
  return (
    <ConfirmModal
      key={target.step}
      kind={ban ? 'kick-ban' : 'kick-kick'}
      title={<>{name} 님을 {ban ? '차단할까요?' : '내보낼까요?'}</>}
      note={ban ? '이 방이 있는 동안 다시 들어올 수 없어요.' : '링크로 다시 들어올 수 있어요.'}
      actions={[
        {
          label: ban ? '차단하기' : '내보내기',
          danger: true,
          onClick: () => {
            socket.emit('host.kick', { accountId: target.accountId, ban });
            onClose();
          },
        },
      ]}
      onCancel={onClose}
    />
  );
}

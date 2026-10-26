// =============================================================================
// ★★★ 이 사진 몇 년도? (R068 · docs/18 §8 · C82 ③)
//
// ★ 사진 한 장(잘라내지 않음 — 4:3 칸 안 contain · R068 사진 규칙) → 연도 4자리(1800 ~ 올해 · 모바일 숫자 키패드) · 한 번만 낸다.
// ★ 점수 = 오차(년) 작은 순(서버) · 대략(circa) 사진은 범위 안이면 오차 0. 공개 화면은 QuizReveal(정답 연도 · 제목 · 장소 · 각자 오차 · 출처).
// =============================================================================

import type { Socket } from 'socket.io-client';
import type { MinigameView } from '../useRoom.js';
import { usePlayT0, useFrameNow } from './playClock.js';
import { NumberInput, QuizImage, SeenBadge } from './QuizParts.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

export default function PhotoYear({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const playing = view.phase === 'play';
  const { t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const playMs = view.round?.playMs ?? 20000;
  const left = t0 !== null ? Math.max(0, 1 - (now - t0) / playMs) : 1;
  const min = Number(p.min ?? 1800);
  const max = Number(p.max ?? new Date().getFullYear());
  return (
    <div className={`quiz-stage photo-stage photoyear-stage${mobile ? ' m' : ''}`}>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${left * 100}%` }} />
      </div>
      <SeenBadge view={view} />
      <div className="photo-frame" data-mode="plain">
        <QuizImage imageId={p.imageId as string | null} alt="찍은 해를 맞힐 사진" dummy={String(p.dummyShape ?? 'box')} className="photo-img" />
      </div>
      <p className="quiz-ask photoyear-ask">몇 년도에 찍은 사진일까요?</p>
      <NumberInput view={view} socket={socket} t0={t0} unit="년" allowDecimal={false} placeholder="예: 1988" year={{ min, max }} />
    </div>
  );
}

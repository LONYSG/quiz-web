// =============================================================================
// ★★★ 숫자 맞히기 셋 (R052 · D-239) — 얼마게요 · 빅맥지수 · 얼마나 될까
//
// ★ 얼마게요: 그림 + 이름 + 브랜드 → 가격(원) · 빅맥지수: 품목 그림 + "한국 N원 · A국 N원 · B국 N원 → 목표국은?" · 얼마나: 질문 + 그림 + 단위.
// ★ 점수 = 비율 오차 |ln(입력/정답)| 작은 순(서버). 입력은 한 번 · 12초.
// =============================================================================

import type { Socket } from 'socket.io-client';
import { formatInt } from '@quiz/shared';
import type { MinigameView } from '../useRoom.js';
import { usePlayT0, useFrameNow } from './playClock.js';
import { NumberInput, QuizImage, SeenBadge } from './QuizParts.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

type ShownRow = { cc: string; countryKo: string; localPrice: number; currency: string; krw: number };

export default function QuizNumber({ socket, view, serverNow }: Props) {
  const p = view.round?.params ?? {};
  const playing = view.phase === 'play';
  const { t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const playMs = view.round?.playMs ?? 12000;
  const left = t0 !== null ? Math.max(0, 1 - (now - t0) / playMs) : 1;

  return (
    <div className={`quiz-stage quiz-${view.key}`}>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${left * 100}%` }} />
      </div>
      <SeenBadge view={view} />
      {view.key === 'price' && (
        <div className="quiz-q">
          <QuizImage imageId={p.imageId as string | null} alt={String(p.name ?? '')} className="quiz-pic" />
          <div className="quiz-q-text" data-wrap-ok>
            <p className="quiz-brand dim">{String(p.brand ?? '')}</p>
            <p className="quiz-name no-copy">{String(p.name ?? '')}</p>
            <p className="quiz-ask">얼마일까요? (원)</p>
          </div>
        </div>
      )}
      {view.key === 'worldprice' && (
        <div className="quiz-q">
          <QuizImage imageId={p.imageId as string | null} alt={String(p.nameKo ?? '')} className="quiz-pic" />
          <div className="quiz-q-text" data-wrap-ok>
            <p className="quiz-name no-copy">
              {String(p.nameKo ?? '')} <span className="dim nowrap">· {String(p.unit ?? '')}</span>
            </p>
            <ul className="wp-shown">
              {((p.shown as ShownRow[] | undefined) ?? []).map((r) => (
                <li key={r.cc}>
                  <span className="wp-country">{r.countryKo}</span>
                  <span className="mono wp-krw">{formatInt(r.krw)}원</span>
                </li>
              ))}
            </ul>
            <p className="quiz-ask">
              <strong>{String((p.target as { countryKo?: string } | undefined)?.countryKo ?? '')}</strong>에서는 원화로 얼마?
            </p>
          </div>
        </div>
      )}
      {view.key === 'estimate' && (
        <div className="quiz-q">
          {Boolean(p.imageId || p.dummy) && <QuizImage imageId={p.imageId as string | null} alt="" className="quiz-pic" />}
          <div className="quiz-q-text" data-wrap-ok>
            <p className="quiz-name no-copy">{String(p.question ?? '')}</p>
            <p className="quiz-ask">
              단위: <span className="nowrap">{String(p.unit ?? '')}</span>
            </p>
          </div>
        </div>
      )}
      <NumberInput
        view={view}
        socket={socket}
        t0={t0}
        unit={view.key === 'estimate' ? String(p.unit ?? '') : '원'}
        allowDecimal={view.key === 'estimate' && Number(p.displayDecimals ?? 0) > 0}
        placeholder={view.key === 'estimate' ? '어림한 숫자' : '가격'}
      />
    </div>
  );
}

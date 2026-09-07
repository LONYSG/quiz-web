// =============================================================================
// 서버 시계 오프셋 측정
//
// 명세 원본: R003 2-4 "클라이언트 측 — 시계 오프셋 측정"
// 현재 유효 명세: docs/04-PROTOCOL.md
//
// ★ 왜 필요한가
//   guide 18절이 "각 사용자의 PC 시간이 정확한지 신뢰하지 않는다"고 못 박았고,
//   guide 46절이 "서버의 문제 시작 시각/종료 시각을 기준으로 동기화"하라고 요구한다.
//   그래서 서버는 절대 시각(questionEndsAt)을 보내고, 클라이언트는 자기 시계와
//   서버 시계의 차이를 추정해 남은 시간을 그린다.
//
// ★ 클라이언트 타이머가 0에 도달해도 어떤 상태 전환도 하지 않는다 (guide 45절).
//   "결과 확인 중..." 만 표시하고 서버의 question.resolved 를 기다린다.
//   이 파일은 표시용 시각만 계산한다. 판정 권한이 없다.
//
// 측정 방법
//   1. 클라이언트가 t0 = Date.now() 를 담아 time.ping 전송
//   2. 서버가 { t0, tServer } 로 time.pong 응답
//   3. 클라이언트가 t1 = Date.now() 기록
//   4. rtt = t1 - t0,  offset = tServer - (t0 + rtt / 2)
//
// ★ 채택 값: 최근 N회 측정 중 RTT가 가장 작은 측정의 offset을 쓴다.
//   평균이나 중앙값이 아니다. RTT가 작을수록 편도 지연의 비대칭이 작아 추정이 정확하다.
//   큰 RTT 측정 하나가 평균을 오염시키는 것을 막는다. NTP가 쓰는 원리와 같다.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RULES } from '@quiz/shared';

export interface ClockSample {
  rtt: number;
  offset: number;
  at: number;
}

export interface ServerClock {
  /** 서버시각 - 클라이언트시각 추정치(ms). 아직 측정 전이면 null */
  offset: number | null;
  /** 채택된 측정의 RTT(ms) */
  rtt: number | null;
  /** 최근 측정 이력 (진단 표시용) */
  samples: ClockSample[];
  /** 현재 추정 서버 시각 */
  serverNow: () => number;
  /** 즉시 한 번 더 측정 */
  measure: () => void;
}

export function useServerClock(socket: Socket | null): ServerClock {
  const [samples, setSamples] = useState<ClockSample[]>([]);
  const offsetRef = useRef<number>(0);
  const [best, setBest] = useState<ClockSample | null>(null);

  const measure = useCallback(() => {
    if (!socket?.connected) return;
    socket.emit('time.ping', { t0: Date.now() });
  }, [socket]);

  useEffect(() => {
    if (!socket) return undefined;

    const onPong = (payload: { t0: number; tServer: number }) => {
      const t1 = Date.now();
      const rtt = t1 - payload.t0;
      const offset = payload.tServer - (payload.t0 + rtt / 2);
      const sample: ClockSample = { rtt, offset, at: t1 };

      setSamples((prev) => {
        const next = [...prev, sample].slice(-RULES.TIME_SYNC_SAMPLE_SIZE);
        // ★ RTT 최소인 측정을 채택한다.
        const chosen = next.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        offsetRef.current = chosen.offset;
        setBest(chosen);
        return next;
      });
    };

    socket.on('time.pong', onPong);

    // 연결 직후 3회를 200ms 간격으로 측정한다 (R003 2-4).
    // 한 번만 재면 그 한 번이 튀었을 때 오프셋이 크게 틀어진다.
    const burst: ReturnType<typeof setTimeout>[] = [];
    const startBurst = () => {
      for (let i = 0; i < 3; i += 1) {
        burst.push(setTimeout(() => measure(), i * 200));
      }
    };
    if (socket.connected) startBurst();
    socket.on('connect', startBurst);

    // 이후 주기적 재측정
    const interval = setInterval(measure, RULES.TIME_SYNC_INTERVAL_MS);

    // ★ 백그라운드 복귀 시 즉시 재측정 (guide 46절)
    //   모바일 브라우저는 백그라운드에서 타이머를 조이거나 멈추고,
    //   기기가 절전에서 복귀하면 시스템 시각이 보정되기도 한다.
    //   오프셋이 낡은 상태로 남으면 남은 시간이 틀리게 표시된다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') measure();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      socket.off('time.pong', onPong);
      socket.off('connect', startBurst);
      burst.forEach(clearTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [socket, measure]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return {
    offset: best?.offset ?? null,
    rtt: best?.rtt ?? null,
    samples,
    serverNow,
    measure,
  };
}

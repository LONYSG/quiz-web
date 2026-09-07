// =============================================================================
// Phase 0 진단 화면
//
// 목적은 예쁜 UI가 아니라 R003 2-4 타이머 설계의 실증이다.
// 여기서 오프셋과 RTT가 이상하면 30초 타이머가 전부 어긋난다.
//
// 표시하는 것
//   · 소켓 연결 상태
//   · 서버 추정 시각 / 로컬 시각 / 오프셋 / RTT / 최근 측정 이력
//   · ★ window.location.origin  — 초대 링크 생성 방식의 실증 (R004 0장)
//     초대 링크는 서버 환경 변수가 아니라 방장 브라우저의 origin으로 만든다.
//     터널 URL이 바뀌어도 방장 브라우저는 이미 새 URL에 있으므로 항상 올바른 값을 얻는다.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useServerClock } from './useServerClock.js';

function useSocket(): { socket: Socket | null; connected: boolean } {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // ★ 접속 주소를 하드코딩하지 않는다. 같은 오리진에 붙는다.
    //   개발 중에는 Vite 프록시가, 배포 시에는 같은 Node 서버가 받는다.
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on('connect', on);
    s.on('disconnect', off);
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
      s.close();
    };
  }, []);

  return { socket, connected };
}

export default function App() {
  const { socket, connected } = useSocket();
  const clock = useServerClock(socket);
  const [, forceTick] = useState(0);

  // 화면의 시각 표시를 100ms마다 갱신한다. 서버 tick 주기와 같은 값을 쓴다.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const origin = useMemo(() => window.location.origin, []);
  const localNow = Date.now();
  const serverNow = clock.serverNow();

  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString('ko-KR', { hour12: false }) +
    '.' +
    String(ms % 1000).padStart(3, '0');

  return (
    <main className="wrap">
      <h1>퀴즈 서버 — Phase 0 진단</h1>
      <p className="sub">
        게임 로직은 아직 없습니다. 이 화면은 R003 2-4의 시계 동기화 설계가 실제로 동작하는지
        확인하기 위한 것입니다.
      </p>

      <section className="card">
        <h2>연결</h2>
        <dl>
          <dt>소켓</dt>
          <dd className={connected ? 'ok' : 'bad'}>{connected ? '연결됨' : '끊김'}</dd>
          <dt>접속 주소 (origin)</dt>
          <dd className="mono">{origin}</dd>
        </dl>
        <p className="note">
          초대 링크는 서버 설정이 아니라 이 origin 값으로 만듭니다. 터널 URL이 바뀌어도
          방장 브라우저는 항상 올바른 주소를 갖습니다.
        </p>
      </section>

      <section className="card">
        <h2>서버 시계 동기화</h2>
        <dl>
          <dt>서버 추정 시각</dt>
          <dd className="mono big">{fmt(serverNow)}</dd>
          <dt>내 브라우저 시각</dt>
          <dd className="mono">{fmt(localNow)}</dd>
          <dt>오프셋 (서버 − 로컬)</dt>
          <dd className="mono big">
            {clock.offset === null ? '측정 중…' : `${clock.offset >= 0 ? '+' : ''}${clock.offset} ms`}
          </dd>
          <dt>채택된 RTT</dt>
          <dd className="mono">{clock.rtt === null ? '측정 중…' : `${clock.rtt} ms`}</dd>
        </dl>
        <button type="button" onClick={clock.measure} disabled={!connected}>
          지금 다시 측정
        </button>
      </section>

      <section className="card">
        <h2>최근 측정 이력</h2>
        <p className="note">
          최근 {5}회 중 RTT가 가장 작은 측정의 오프셋을 채택합니다(굵게 표시). 평균이 아닙니다.
        </p>
        <table>
          <thead>
            <tr>
              <th>시각</th>
              <th>RTT</th>
              <th>오프셋</th>
            </tr>
          </thead>
          <tbody>
            {clock.samples.length === 0 && (
              <tr>
                <td colSpan={3} className="note">
                  아직 측정값이 없습니다.
                </td>
              </tr>
            )}
            {clock.samples.map((s) => {
              const chosen = clock.rtt !== null && s.rtt === clock.rtt;
              return (
                <tr key={s.at} className={chosen ? 'chosen' : undefined}>
                  <td className="mono">{fmt(s.at)}</td>
                  <td className="mono">{s.rtt} ms</td>
                  <td className="mono">
                    {s.offset >= 0 ? '+' : ''}
                    {s.offset} ms
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

// =============================================================================
// 로비 화면 (guide 6절)
//
// Phase 1 범위: 방 제목 / 참가자 목록 / 인원 / 방장 표시 / 초대 링크 복사 / 채팅
// ★ 게임 설정 UI와 경험률 표시는 Phase 2다. 지금은 만들지 않는다.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { ChatView, RoomSnapshot } from './useRoom.js';

interface Props {
  socket: Socket;
  snapshot: RoomSnapshot;
  chat: ChatView[];
  onLeave: () => void;
}

export default function Lobby({ socket, snapshot, chat, onLeave }: Props) {
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  /** 사용자가 과거 메시지를 보고 있으면 강제로 아래로 끌어내리지 않는다 (guide 36절) */
  const stickToBottom = useRef(true);

  /**
   * ★ 초대 링크는 방장 브라우저의 origin 으로 만든다 (R004 0장).
   *   서버 환경 변수에서 읽지 않는다. 터널 URL이 바뀌어도 서버 재시작이 필요 없다.
   *   이 브라우저는 이미 새 URL에 있으므로 항상 올바른 값을 얻는다.
   */
  const inviteUrl = useMemo(
    () => `${window.location.origin}/r/${snapshot.room.id}`,
    [snapshot.room.id],
  );

  useEffect(() => {
    if (stickToBottom.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [chat]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    socket.emit('chat.send', { text });
    setDraft('');
    // ★ PC에서 입력창을 계속 쓸 수 있어야 한다 (guide 14·42절).
    //   전송 후 포커스를 잃지 않게 한다.
    inputRef.current?.focus();
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드 API가 막힌 환경(비-https 등)에서는 선택 상태로 대체한다
      const el = document.getElementById('invite-url') as HTMLInputElement | null;
      el?.select();
    }
  };

  const me = snapshot.players.find((p) => p.accountId === snapshot.me.accountId);

  return (
    <div className="lobby">
      <header className="lobby-head">
        <div>
          <h1>{snapshot.room.title}</h1>
          <p className="sub">
            {snapshot.players.length} / {snapshot.room.maxPlayers}명
            <span className="dim"> · 접속 {snapshot.room.activeCount}명</span>
            <span className="dim"> · {snapshot.room.state}</span>
          </p>
        </div>
        <button type="button" className="ghost" onClick={onLeave}>
          방 나가기
        </button>
      </header>

      <section className="card">
        <h2>초대 링크</h2>
        <div className="invite-row">
          <input id="invite-url" className="mono" readOnly value={inviteUrl} />
          <button type="button" onClick={copyInvite}>
            {copied ? '복사됨' : '복사'}
          </button>
        </div>
        <p className="note">
          이 주소는 지금 접속한 주소를 기준으로 만들어집니다. 터널을 다시 띄워 주소가 바뀌면
          새 주소에서 다시 복사해 주세요.
        </p>
      </section>

      <section className="card">
        <h2>참가자</h2>
        <ol className="players">
          {snapshot.players.map((p, index) => (
            <li key={p.accountId} className={p.connected ? undefined : 'offline'}>
              <span className="seat">{index + 1}</span>
              {/* ★ 닉네임 자체를 플레이어 색상으로 표시한다 (guide 35절).
                  별도 색상 아이콘을 쓰지 않는다.
                  색약을 고려해 순번(seat)을 함께 표시한다. */}
              <span className="nick" style={{ color: `var(--p${p.colorIndex})` }}>
                {p.nickname}
              </span>
              {p.isHost && <span className="badge">방장</span>}
              {p.accountId === snapshot.me.accountId && <span className="badge me">나</span>}
              {!p.connected && <span className="badge off">접속 종료</span>}
              {snapshot.me.isHost && !p.connected && (
                <button
                  type="button"
                  className="tiny"
                  onClick={() =>
                    socket.emit('host.kickDisconnected', { accountId: p.accountId })
                  }
                >
                  내보내기
                </button>
              )}
            </li>
          ))}
        </ol>
        <p className="note">
          접속이 끊긴 사람은 5초 뒤에 &quot;접속 종료&quot;로 표시됩니다. 새로고침으로 표시가
          깜빡이지 않게 하기 위한 것입니다.
        </p>
      </section>

      <section className="card">
        <h2>게임 설정</h2>
        <p className="note">
          문제 수와 시작 방식 설정, 참가자 경험률 표시는 Phase 2에서 만듭니다.
          현재 저장된 값: 문제 {snapshot.room.settings.questionCount}개 ·{' '}
          {snapshot.room.settings.startMode === 'instant'
            ? '즉시 시작'
            : `${snapshot.room.settings.countdownSec}초 카운트다운`}
        </p>
      </section>

      <section className="card chat-card">
        <h2>채팅</h2>
        <div
          className="chat-log"
          ref={logRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          {chat.length === 0 && <p className="note">아직 대화가 없습니다.</p>}
          {chat.map((m) =>
            m.system ? (
              <p key={m.id} className="chat-system">
                {m.text}
              </p>
            ) : (
              <p key={m.id} className="chat-line">
                <span className="nick" style={{ color: `var(--p${m.colorIndex})` }}>
                  {m.nickname}
                </span>
                <span className="chat-text">{m.text}</span>
              </p>
            ),
          )}
        </div>
        <div className="chat-input">
          <input
            ref={inputRef}
            value={draft}
            maxLength={100}
            placeholder={me ? '메시지를 입력하세요' : '참가자가 아닙니다'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // ★ 한글 IME 조합 중 Enter는 전송으로 처리하지 않는다.
              //   조합을 확정하는 Enter가 전송이 되면 "훈민정" 같은 미완성 문자열이 나간다.
              //   Phase 3의 선착순 판정에서는 0.1초 차이로 승패가 갈리므로 치명적이다.
              if (e.key !== 'Enter') return;
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              send();
            }}
          />
          <button type="button" onClick={send}>
            전송
          </button>
        </div>
        <p className="note">
          Phase 3부터는 여기 입력하는 모든 메시지가 동시에 답안 제출이 됩니다.
        </p>
      </section>
    </div>
  );
}

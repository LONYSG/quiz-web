// =============================================================================
// 로비 화면 (guide 6절)
//
// Phase 1 범위: 방 제목 / 참가자 목록 / 인원 / 방장 표시 / 초대 링크 복사 / 채팅
// Phase 2 범위: 게임 설정 / 경험률 / 게임 시작 / 카운트다운
// ★ Phase 3 범위 (R014): 문제 화면 / 타이머 / 힌트 / 스킵 / 점수판 / 결과 화면
//
// ★★ 채팅 입력창이 곧 답안 제출이다 (guide 12절 절대 규칙).
//   ★ 별도의 답안 입력창을 만들지 않는다. 이 파일에 그것이 없는 것이 그 구현이다.
//   ★ chat.send 에 **epoch 를 담는다** — 그것이 장치 B 의 클라이언트 쪽 절반이다.
//
// ★ 새로 만드는 버튼과 배지는 styles.css 의 라벨 규칙을 그대로 받는다 (A-2 / D-022).
//   개별 요소에 white-space 를 다시 쓰지 않는다.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { formatExperienceRate } from '@quiz/shared';
import Countdown from './Countdown.js';
import GameSettings from './GameSettings.js';
import Question from './Question.js';
import GameResult from './GameResult.js';
import Paused from './Paused.js';
import ShortcutBar from './ShortcutBar.js';
import { useFocusChatOnEscape, useShortcuts, type Shortcut } from './shortcuts.js';
import type { ChatView, RoomSnapshot } from './useRoom.js';

interface Props {
  socket: Socket;
  snapshot: RoomSnapshot;
  chat: ChatView[];
  onLeave: () => void;
  /** 서버 시각 추정치. 카운트다운·문제 타이머 표시에 쓴다 */
  serverNow: () => number;
  /** ★ 도배 억제 안내 (Q-18). 입력창 바로 위에 인라인으로 표시한다 */
  throttledUntil: number | null;
}

export default function Lobby({
  socket,
  snapshot,
  chat,
  onLeave,
  serverNow,
  throttledUntil,
}: Props) {
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  /** ★ 도배 억제 안내가 지금 유효한가. 시각이 지나면 스스로 사라진다 */
  const [throttled, setThrottled] = useState(false);
  /** ★ Q-56 — 단축키 전체 목록을 펼쳤는가 */
  const [showKeys, setShowKeys] = useState(false);
  /**
   * ★★ Q-82 — 게임 중 나가기 확인창.
   *   ★ 근거: 마지막 활성자가 나가면 **즉시 방이 폭파된다.**
   *     실수로 눌렀는데 게임이 날아가면 안 된다.
   *   ★ 로비에서는 확인창을 두지 않는다 — 판단 근거는 아래 leaveWithConfirm 주석에 있다.
   */
  const [confirmLeave, setConfirmLeave] = useState(false);
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

  // ★ 억제 안내는 서버가 준 시각까지만 보여주고 스스로 사라진다.
  //   ★ 사용자가 닫아야 사라지는 알림으로 만들지 않는다 — 입력 중에 뜨는 것이므로
  //     닫기 버튼을 누르게 하면 입력을 방해한다.
  useEffect(() => {
    if (throttledUntil === null) return undefined;
    const remain = throttledUntil - Date.now();
    if (remain <= 0) return undefined;
    setThrottled(true);
    const id = setTimeout(() => setThrottled(false), remain);
    return () => clearTimeout(id);
  }, [throttledUntil]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    // ★★ 장치 B — 지금 보고 있는 문제의 epoch 를 함께 보낸다 (guide 20절 / R003 2-3).
    //   ★ 이것이 "정답 공개 5초 구간에 친 메시지가 다음 문제의 정답과 우연히 일치해
    //     정답 처리되는" 사고를 막는다.
    //   ★ 문제가 없으면 null 이다. 서버가 판정하지 않는다.
    socket.emit('chat.send', { text, epoch: snapshot.question?.epoch ?? null });
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

  /** 게임 계열 상태인가. 로비 전용 섹션을 접는 기준이다 */
  const inGame =
    snapshot.room.state === 'QUESTION_ACTIVE' ||
    snapshot.room.state === 'QUESTION_RESOLVED' ||
    snapshot.room.state === 'PAUSED' ||
    snapshot.room.state === 'GAME_RESULT';

  /**
   * ★★ Q-82 — 게임 중 나가기에만 확인창을 둔다.
   *
   * ★ 게임 중(COUNTDOWN / QUESTION_ACTIVE / QUESTION_RESOLVED / PAUSED)
   *   → ★ 확인창. **마지막 활성자면 방이 즉시 폭파된다.**
   * ★ 로비 / 결과 화면 → 확인창 없음.
   *   ★ 판단 근거 — 그 상태에는 **잃을 것이 없다.** 진행 중인 게임이 없고,
   *     방이 사라져도 다시 만들면 된다. 점수도 경험 기록도 이미 확정되어 있다.
   *   ★★ 확인창을 남발하면 진짜 위험한 순간의 확인창도 습관적으로 넘기게 된다.
   */
  const needsLeaveConfirm =
    snapshot.room.state === 'COUNTDOWN' ||
    snapshot.room.state === 'QUESTION_ACTIVE' ||
    snapshot.room.state === 'QUESTION_RESOLVED' ||
    snapshot.room.state === 'PAUSED';

  const leaveWithConfirm = () => {
    if (needsLeaveConfirm) setConfirmLeave(true);
    else onLeave();
  };

  /** ★ 지금 답안이 판정되는 상태인가. 입력창 안내 문구를 바꾼다 */
  const judging = snapshot.room.state === 'QUESTION_ACTIVE' && !snapshot.question?.selfExperienced;

  /**
   * 경험률 문구.
   * ★ 아직 값이 오지 않았으면 "—" 를 보여 준다. 0% 로 단정하지 않는다.
   *   "경험 기록이 없다" 와 "아직 모른다" 는 다르다.
   */
  /** 접속 종료 표시 상태인 참가자가 있는가. 조건부 안내를 띄울 기준이다 */
  const hasDisconnected = snapshot.players.some((p) => !p.connected);

  // ───────────────────────────────────────────────────────────────────────────
  // ★★ Q-56 단축키 (R015)
  //   ★ 전부 Alt 조합이다. 단독 문자키를 쓰지 않는다 — 채팅 입력을 방해하면 안 된다.
  //   ★ 근거와 피한 키 목록은 shortcuts.ts 헤더에 있다.
  // ───────────────────────────────────────────────────────────────────────────
  const isActive = snapshot.room.state === 'QUESTION_ACTIVE';
  const isResult = snapshot.room.state === 'GAME_RESULT';
  const isPaused = snapshot.room.state === 'PAUSED';
  const epoch = snapshot.question?.epoch ?? null;

  const shortcuts: Shortcut[] = [
    {
      combo: 'Alt+S',
      fkey: 'F2',
      label: '넘기기 투표',
      when: isActive && snapshot.skip?.threshold != null,
      run: () => socket.emit('skip.vote', { vote: !snapshot.skip?.selfVoted, epoch }),
    },
    {
      combo: 'Alt+K',
      fkey: 'F4',
      label: '이 문제 넘기기 (방장)',
      when: isActive && snapshot.me.isHost,
      // ★ 확인창을 거친다. 단축키로 문제를 즉시 넘기면 실수를 되돌릴 수 없다
      run: () => window.dispatchEvent(new CustomEvent('qw:host-skip')),
    },
    {
      combo: 'Alt+R',
      fkey: 'F8',
      label: '재개 (방장)',
      when: isPaused && Boolean(snapshot.paused?.canResume),
      run: () => socket.emit('game.resume', {}),
    },
    {
      combo: 'Alt+Q',
      fkey: null,
      label: '게임 강제 종료 (방장)',
      when: (isActive || snapshot.room.state === 'QUESTION_RESOLVED' || isPaused) && snapshot.me.isHost,
      run: () => window.dispatchEvent(new CustomEvent('qw:host-end')),
    },
    {
      combo: 'Alt+A',
      fkey: null,
      label: '다시 하기 (방장)',
      when: isResult && snapshot.me.isHost,
      run: () => socket.emit('game.again', {}),
    },
    {
      combo: 'Alt+L',
      fkey: null,
      label: '로비로 (방장)',
      when: isResult && snapshot.me.isHost,
      run: () => socket.emit('game.toLobby', {}),
    },
    {
      combo: 'Alt+X',
      fkey: null,
      label: '방 나가기',
      when: true,
      run: leaveWithConfirm,
    },
    {
      combo: 'Alt+G',
      fkey: 'F9',
      label: '단축키 목록 열기/닫기',
      when: true,
      run: () => setShowKeys((v) => !v),
    },
  ];
  useShortcuts(shortcuts);
  // ★★ Esc 로 채팅 입력에 포커스를 되돌린다. 마우스 없이 돌아가려면 반드시 필요하다
  useFocusChatOnEscape(inputRef);

  const rateText = (accountId: string): string => {
    const rate = snapshot.experienceRates?.find((r) => r.accountId === accountId);
    if (!rate) return '경험률 —';
    return formatExperienceRate(rate.experienced, rate.total);
  };

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
        <button type="button" className="ghost" onClick={leaveWithConfirm}>
          방 나가기
        </button>
      </header>

      {/* ★★ Q-82 — 게임 중 나가기 확인창.
          ★ 마지막 활성자가 나가면 방이 즉시 폭파된다. 실수로 누르면 게임이 날아간다.
          ★ autoFocus 로 Enter 만으로 조작할 수 있다 (Q-56 요구). */}
      {confirmLeave && (
        <section className="card confirm-card">
          <h2>방을 나갈까요?</h2>
          <p className="note">
            ★ <strong>내가 마지막 접속자라면 방이 즉시 사라집니다.</strong> 진행 중인 게임도
            함께 끝납니다.
            <br />
            다른 사람이 남아 있으면 게임은 계속되고, 자리는 게임이 끝날 때까지 유지됩니다.
            <br />
            <span className="dim">
              ★ 잠깐 끊기는 것(새로고침·네트워크)은 나가기와 다릅니다. 그때는 일시정지되고
              기다립니다.
            </span>
          </p>
          <div className="field-row">
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmLeave(false);
                onLeave();
              }}
            >
              나가기
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setConfirmLeave(false);
                inputRef.current?.focus();
              }}
            >
              취소
            </button>
          </div>
        </section>
      )}

      {/* ★ 초대 링크·참가자·설정은 로비 계열 상태에서만 보여준다.
          ★ 근거: 게임 중 화면 위쪽은 문제 지문과 남은 시간이 차지해야 한다 (D-032).
            ★ 30초 승부의 핵심 정보다. 초대 링크가 그 위에 있으면 안 된다. */}
      {inGame ? null : (
        <>
      <section className="card">
        <h2>초대 링크</h2>
        <div className="field-row">
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
              {/* ★ 경험률 (Q-12). 백분율과 절대 개수를 함께 보여 준다.
                  ★ 표기 형식은 shared 의 함수 하나로만 만든다. 분모가 0이어도 NaN 이 되지 않는다. */}
              <span className="rate dim mono">{rateText(p.accountId)}</span>
            </li>
          ))}
        </ol>
        {/* ★ "내보내기" 버튼은 방장에게만, 접속 종료자에게만 나타난다 (Q-15).
            ★ 조건부로 나타나는 UI 는 왜 안 보이는지도 알려 줘야 한다.
              R008에서 건우가 이 버튼을 찾지 못해 결함으로 의심했다. */}
        {hasDisconnected && (
          <p className="info">
            {snapshot.me.isHost
              ? '접속이 끊긴 참가자 옆의 "내보내기" 로 자리를 비울 수 있습니다. (방장만 가능)'
              : '접속이 끊긴 참가자를 내보내는 것은 방장만 할 수 있습니다.'}
          </p>
        )}
        <p className="note">
          접속이 끊긴 사람은 5초 뒤에 &quot;접속 종료&quot;로 표시됩니다. 새로고침으로 표시가
          깜빡이지 않게 하기 위한 것입니다.
          <br />
          숫자는 문제 경험률입니다. 이미 풀어 본 문제는 그 사람의 정답 판정 대상에서
          빠집니다(Phase 6). ★ 경험률이 높다는 이유로 게임 시작을 막지는 않습니다.
        </p>
      </section>

      <GameSettings
        socket={socket}
        settings={snapshot.room.settings}
        settingsLocked={snapshot.room.settingsLocked}
        availableQuestionCount={snapshot.room.availableQuestionCount}
        isHost={snapshot.me.isHost}
      />
        </>
      )}

      {/* ── 카운트다운 (COUNTDOWN 상태) */}
      {snapshot.countdown && (
        <Countdown
          socket={socket}
          endsAt={snapshot.countdown.endsAt}
          serverNow={serverNow}
          isHost={snapshot.me.isHost}
        />
      )}

      {/* ── 게임 시작 버튼 (LOBBY + 방장) */}
      {snapshot.room.state === 'LOBBY' && (
        <section className="card">
          <h2>게임 시작</h2>
          {snapshot.me.isHost ? (
            <>
              <button type="button" onClick={() => socket.emit('game.start', {})}>
                게임 시작
              </button>
              <p className="note">
                {snapshot.room.settings.startMode === 'instant'
                  ? '누르면 곧바로 시작합니다.'
                  : `누르면 ${snapshot.room.settings.countdownSec}초 카운트다운이 시작됩니다. 카운트다운은 취소할 수 있습니다.`}
              </p>
            </>
          ) : (
            <p className="note">방장이 게임을 시작할 때까지 기다려 주세요.</p>
          )}
        </section>
      )}

      {/* ── ★★ 문제 화면 (Phase 3). Phase 2 의 임시 안내 화면(옛 표식 02)을 교체한 자리다 */}
      {snapshot.question && (
        <Question
          socket={socket}
          question={snapshot.question}
          resolution={snapshot.resolution}
          skip={snapshot.skip}
          serverNow={serverNow}
          isHost={snapshot.me.isHost}
          state={snapshot.room.state}
          players={snapshot.players}
          myAccountId={snapshot.me.accountId}
        />
      )}

      {/* ── ★★ 일시정지 화면 (Phase 5) */}
      {snapshot.paused && (
        <Paused socket={socket} paused={snapshot.paused} serverNow={serverNow} />
      )}

      {/* ── ★ 결과 화면 (TEMP-P4-01: Phase 4 에서 다시 만든다) */}
      {snapshot.result && (
        <GameResult
          socket={socket}
          result={snapshot.result}
          isHost={snapshot.me.isHost}
          myAccountId={snapshot.me.accountId}
        />
      )}

      {/* ★ 게임이 시작됐는데 문제가 아직 없는 순간이 있을 수 있다 (첫 문제 선정 직전).
          ★ 그 짧은 구간에 빈 화면을 보여주지 않는다. */}
      {snapshot.game && !snapshot.question && !snapshot.result && !snapshot.paused && (
        <section className="card">
          <h2>게임 진행</h2>
          <p className="big dim">문제를 준비하고 있습니다…</p>
        </section>
      )}

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
        {/* ★★ 도배 억제 안내 (Q-18). **본인에게만** 온다.
            ★ 토스트로 띄우지 않는다 — 이 알림이 필요한 순간은 정확히 키보드가 올라와 있는
              순간이고, iOS 에서 화면 하단 고정 토스트는 키보드에 가려질 수 있다 (D-032 한계).
            ★ 그래서 입력창 바로 위 문서 흐름에 둔다. 키보드가 올라오면 함께 밀려 올라온다. */}
        {throttled && (
          <p className="warn throttle-note">
            너무 빨리 보내고 있습니다. 잠시 후 다시 보내 주세요.
          </p>
        )}
        <div className="field-row">
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
        {/* ★★ Q-56 — 단축키 설명.
            ★ 어디에 둘지 판단: **채팅 입력창 바로 아래**다.
              ★ 근거 (1) 게임 중 시선과 손이 그곳에 있다
                     (2) 상시 전체 표시는 자리를 먹는다 — 건우의 "스크롤 없이 한 화면" 목표와 충돌
                     (3) 그래서 **지금 쓸 수 있는 것만** 한 줄로 보여주고 Alt+G 로 전체를 편다 */}
        <ShortcutBar shortcuts={shortcuts} expanded={showKeys} onToggle={() => setShowKeys((v) => !v)} />

        <p className="note">
          {judging ? (
            <>
              ★ <strong>여기 입력하는 모든 메시지가 곧 답안입니다.</strong> 정답과 일치하면
              가장 먼저 보낸 사람이 1점을 얻습니다. 틀려도 그냥 채팅으로 남습니다.
            </>
          ) : snapshot.question?.selfExperienced ? (
            <>
              ★ 이미 풀어본 문제여서 <strong>이번 문제에서는 점수를 얻을 수 없습니다.</strong>{' '}
              채팅은 자유롭게 할 수 있습니다.
            </>
          ) : snapshot.room.state === 'QUESTION_RESOLVED' ? (
            <>★ 정답이 공개된 구간입니다. 지금 입력한 메시지는 정답으로 판정되지 않습니다.</>
          ) : (
            <>게임이 시작되면 여기 입력하는 모든 메시지가 동시에 답안 제출이 됩니다.</>
          )}
        </p>
      </section>

      {/* ★ 라이선스 의무 (Q-41 / DATA_LICENSE.md).
          방 안 화면에도 출처가 보여야 한다. 게임 중에 보게 되는 화면이 여기다. */}
      <section className="card">
        <h2>문제 출처</h2>
        <p className="note">
          문제 데이터의 일부는{' '}
          <a href="https://opentdb.com/" target="_blank" rel="noreferrer noopener">
            Open Trivia Database
          </a>{' '}
          (CC BY-SA 4.0) 를 한국어 주관식으로 번역·가공한 것입니다. 가공된 데이터도 같은
          라이선스로 공개됩니다.
        </p>
      </section>
    </div>
  );
}

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
import { formatExperienceRate, RULES } from '@quiz/shared';
import { changeNickname, errorMessage } from './api.js';
import InfoTip from './InfoTip.js';
import Seat from './Seat.js';
import ChatText from './ChatText.js';
import Countdown from './Countdown.js';
import GameSettings from './GameSettings.js';
import Question from './Question.js';
import GameResult from './GameResult.js';
import Paused from './Paused.js';
import ShortcutBar from './ShortcutBar.js';
import { useFocusChatOnEscape, useShortcuts, type Shortcut } from './shortcuts.js';
import Avatar from './Avatar.js';
import { setRoomOwnsKeys } from './Prefs.js';
import { toggleMuteAll } from './sound.js';
import { cycleTheme } from './theme.js';
import { useGameSounds } from './useGameSounds.js';
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
  /** ★ R034 — 닉네임을 바꿨다 (App 의 계정 표시를 맞춘다) */
  onNicknameChanged: (nickname: string) => void;
}

/** ★ R034 — 말풍선이 떠 있는 시간 */
const BUBBLE_MS = 4_000;

export default function Lobby({
  socket,
  snapshot,
  chat,
  onLeave,
  serverNow,
  throttledUntil,
  onNicknameChanged,
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
  /** ★ R034 — 닉네임 바꾸기 입력. null = 손대지 않음(현재 닉네임을 보여 준다) */
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [renameMsg, setRenameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  /**
   * ★★ R034 — 참여자 칸 말풍선. 계정마다 **가장 최근 메시지 하나**를 BUBBLE_MS 동안.
   *   ★ 처음 받은(스냅샷) 대화는 말풍선으로 띄우지 않는다 — 들어오자마자 옛 말이 뜨면 이상하다.
   *   ★ 메시지 객체를 그대로 담는다 → 마스킹이 채팅 로그와 똑같이 걸린다 (Seat.tsx 헤더).
   */
  const [bubbles, setBubbles] = useState<Record<string, ChatView>>({});
  const seenRef = useRef<Set<string> | null>(null);
  const bubbleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
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

  // ★★ R034 — 새로 온 메시지를 말풍선으로
  useEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Set(chat.map((m) => m.id));
      return;
    }
    const seen = seenRef.current;
    const fresh: ChatView[] = [];
    for (const m of chat) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (!m.system && m.accountId) fresh.push(m);
    }
    if (fresh.length === 0) return;
    setBubbles((prev) => {
      const next = { ...prev };
      for (const m of fresh) next[m.accountId] = m;
      return next;
    });
    for (const m of fresh) {
      const old = bubbleTimers.current.get(m.accountId);
      if (old) clearTimeout(old);
      bubbleTimers.current.set(
        m.accountId,
        setTimeout(() => {
          bubbleTimers.current.delete(m.accountId);
          setBubbles((prev) => {
            if (prev[m.accountId]?.id !== m.id) return prev;
            const next = { ...prev };
            delete next[m.accountId];
            return next;
          });
        }, BUBBLE_MS),
      );
    }
  }, [chat]);
  useEffect(() => {
    const timers = bubbleTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  /** ★ R034 — 닉네임 바꾸기. 결과(성공·겹침·게임 중)를 칸 아래에 바로 보여 준다 */
  const doRename = async () => {
    const next = (renameDraft ?? snapshot.me.nickname).trim();
    if (!next || next === snapshot.me.nickname || renameBusy) return;
    setRenameBusy(true);
    try {
      const saved = await changeNickname(next);
      setRenameDraft(null);
      setRenameMsg({ ok: true, text: `닉네임을 ${saved}(으)로 바꿨습니다.` });
      onNicknameChanged(saved);
    } catch (err) {
      setRenameMsg({ ok: false, text: errorMessage(err, '닉네임을 바꿀 수 없습니다.') });
    } finally {
      setRenameBusy(false);
    }
  };

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
    // ★ R033 — 테마·소리. 방 안에서는 여기가 맡는다 (Prefs 의 전역 키는 쉰다)
    {
      combo: 'Alt+T',
      fkey: null,
      label: '테마 바꾸기',
      when: true,
      run: () => {
        cycleTheme();
      },
    },
    {
      combo: 'Alt+M',
      fkey: null,
      label: '소리 켜기/끄기',
      when: true,
      run: () => {
        toggleMuteAll();
      },
    },
  ];
  useShortcuts(shortcuts);
  // ★ 방 안에 있는 동안 Alt+T / Alt+M 은 위 목록이 맡는다
  useEffect(() => {
    setRoomOwnsKeys(true);
    return () => setRoomOwnsKeys(false);
  }, []);
  // ★★ R033 — 소리 (오답에는 소리가 없다)
  useGameSounds(snapshot, serverNow);
  // ★★ Esc 로 채팅 입력에 포커스를 되돌린다. 마우스 없이 돌아가려면 반드시 필요하다
  useFocusChatOnEscape(inputRef);

  const rateText = (accountId: string): string => {
    const rate = snapshot.experienceRates?.find((r) => r.accountId === accountId);
    if (!rate) return '경험률 —';
    return formatExperienceRate(rate.experienced, rate.total);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // ★★ R034 — 캐치마인드식 배치: [왼쪽 참여자 5칸] [가운데 = 문제·로비·결과 + 채팅] [오른쪽 5칸]
  // ───────────────────────────────────────────────────────────────────────────
  const phase = inGame ? (isResult ? 'result' : 'game') : 'lobby';
  const showScore = phase !== 'lobby';
  const experiencedIds = new Set(
    snapshot.room.state === 'QUESTION_ACTIVE' || snapshot.room.state === 'QUESTION_RESOLVED'
      ? (snapshot.question?.experiencedPlayers ?? []).map((p) => p.accountId)
      : [],
  );
  const topScore = Math.max(0, ...snapshot.players.map((p) => p.score));
  const seatOf = (index: number) => {
    const p = snapshot.players[index] ?? null;
    return (
      <Seat
        key={p ? p.accountId : `empty-${index}`}
        seatNo={index + 1}
        player={p}
        me={p?.accountId === snapshot.me.accountId}
        experienced={p ? experiencedIds.has(p.accountId) : false}
        showScore={showScore}
        lead={Boolean(p && showScore && topScore > 0 && p.score === topScore)}
        rate={p && phase === 'lobby' ? rateText(p.accountId) : null}
        bubble={p ? bubbles[p.accountId] ?? null : null}
        canKick={Boolean(p && snapshot.me.isHost && !p.connected)}
        onKick={() => p && socket.emit('host.kickDisconnected', { accountId: p.accountId })}
      />
    );
  };
  const slots = Array.from({ length: snapshot.room.maxPlayers }, (_, i) => i);
  const half = Math.ceil(slots.length / 2);

  /** ★ 입력창 자리표시 — 지금 입력이 답안으로 판정되는지 (옛 안내 문장을 대신한다) */
  const placeholder = !me
    ? '참가자가 아닙니다'
    : judging
      ? '정답을 입력하세요 — 모든 메시지가 답안입니다'
      : snapshot.question?.selfExperienced && snapshot.room.state === 'QUESTION_ACTIVE'
        ? '이미 풀어본 문제 — 이번 문제는 점수를 얻을 수 없어요'
        : snapshot.room.state === 'QUESTION_RESOLVED'
          ? '정답 공개 중 — 지금은 판정되지 않습니다'
          : '메시지를 입력하세요';

  return (
    <div className={`room room-${phase}${inGame ? ' in-game' : ''}`}>
      <header className="room-head">
        <div className="room-title">
          <h1>{snapshot.room.title}</h1>
          <span className="state-pill">{stateLabel(snapshot.room.state)}</span>
          <span className="dim room-count">
            {snapshot.players.length} / {snapshot.room.maxPlayers}명 · 접속 {snapshot.room.activeCount}명
          </span>
        </div>
        <div className="room-tools">
          {/* ★★ ⓘ — 늘 깔려 있던 안내 문장을 여기로 접었다 (R034) */}
          <InfoTip>
            <ul className="info-list">
              <li>
                <strong>채팅 입력창이 곧 답안 입력창입니다.</strong> 문제 중에 보낸 메시지가 정답과
                같으면 가장 먼저 보낸 사람이 1점을 얻습니다. 틀려도 그냥 채팅으로 남습니다.
              </li>
              <li>
                문제는 <strong>40초</strong>입니다. 남은 30초에 일반 힌트(있는 문제만), 남은 15초에
                초성 힌트가 나옵니다.
              </li>
              <li>
                <strong>넘기기 투표</strong> — 접속한 사람 중 정해진 수가 누르면 문제를 넘깁니다
                (다시 누르면 취소). 누가 눌렀는지는 보이지 않습니다. 혼자일 때는 투표로 넘길 수
                없고, 방장은 언제든 넘길 수 있습니다.
              </li>
              <li>
                <span className="badge exp">경험</span> 이 문제를 이미 풀어 본 사람입니다. 판정에서
                빠지고, 그 사람이 쓴 정답은 다른 사람에게 <span className="masked-chip">가려짐</span>
                으로 보입니다 (말풍선도 같습니다).
              </li>
              <li>
                로비의 경험률은 문제 DB 를 얼마나 풀어 봤는지입니다. 높다고 게임 시작을 막지는
                않습니다.
              </li>
              <li>
                접속이 끊긴 사람은 5초 뒤에 &quot;접속 종료&quot;로 표시됩니다 (새로고침 깜빡임
                방지).{' '}
                {snapshot.me.isHost
                  ? '접속 종료자 칸의 "내보내기" 로 자리를 비울 수 있습니다.'
                  : '접속 종료자를 내보내는 것은 방장만 할 수 있습니다.'}
              </li>
              <li>
                닉네임은 로비에서만 바꿀 수 있습니다. 바꿔도 점수·경험 기록은 계정에 그대로
                남습니다.
              </li>
            </ul>
          </InfoTip>
          <button type="button" className="ghost tiny" onClick={leaveWithConfirm}>
            방 나가기
          </button>
        </div>
      </header>

      {/* ★★ Q-82 — 게임 중 나가기 확인창. autoFocus 로 Enter 만으로 조작할 수 있다 (Q-56) */}
      {confirmLeave && (
        <section className="card confirm-card">
          <h2>방을 나갈까요?</h2>
          <p className="note">
            ★ <strong>내가 마지막 접속자라면 방이 즉시 사라집니다.</strong> 진행 중인 게임도
            함께 끝납니다. 다른 사람이 남아 있으면 게임은 계속되고, 자리는 게임이 끝날 때까지
            유지됩니다.{' '}
            <span className="dim">
              잠깐 끊기는 것(새로고침·네트워크)은 나가기와 다릅니다. 그때는 일시정지되고
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

      <div className="stage">
        <aside className="seats seats-left" aria-label="참여자 1~5">
          {slots.slice(0, half).map(seatOf)}
        </aside>

        <div className="center">
          <div className="center-main">
            {/* ── 로비 (LOBBY / COUNTDOWN) — 왼쪽 = 설정 / 오른쪽 = 시작·초대·내 이름 */}
            {!inGame && (
              <div className="lobby-cols">
                <div className="lobby-col">
                  <GameSettings
                    socket={socket}
                    settings={snapshot.room.settings}
                    settingsLocked={snapshot.room.settingsLocked}
                    availableQuestionCount={snapshot.room.availableQuestionCount}
                    isHost={snapshot.me.isHost}
                  />
                </div>
                <div className="lobby-col">
                  {snapshot.countdown && (
                    <Countdown
                      socket={socket}
                      endsAt={snapshot.countdown.endsAt}
                      serverNow={serverNow}
                      isHost={snapshot.me.isHost}
                    />
                  )}
                  {snapshot.room.state === 'LOBBY' && (
                    <section className="card start-card">
                      {snapshot.me.isHost ? (
                        <>
                          <button
                            type="button"
                            className="primary big-btn"
                            onClick={() => socket.emit('game.start', {})}
                          >
                            게임 시작
                          </button>
                          {/* ★ R033 (Q-11 개정) — 시작은 항상 5초 뒤다 */}
                          <p className="note">누르면 5초 뒤에 시작합니다. 그 사이 취소할 수 있습니다.</p>
                        </>
                      ) : (
                        <p className="note">방장이 게임을 시작할 때까지 기다려 주세요.</p>
                      )}
                    </section>
                  )}
                  <section className="card invite-card">
                    <h2>초대 링크</h2>
                    <div className="field-row">
                      <input id="invite-url" className="mono" readOnly value={inviteUrl} />
                      <button type="button" onClick={copyInvite}>
                        {copied ? '복사됨' : '복사'}
                      </button>
                    </div>
                  </section>
                  {/* ★★ R034 — 내 닉네임 바꾸기 (로비에서만) */}
                  {snapshot.room.state === 'LOBBY' && me && (
                    <section className="card rename-card">
                      <h2>내 닉네임</h2>
                      <div className="field-row">
                        <input
                          id="rename-input"
                          value={renameDraft ?? snapshot.me.nickname}
                          maxLength={RULES.NICKNAME_MAX_LENGTH}
                          onChange={(e) => {
                            setRenameDraft(e.target.value);
                            setRenameMsg(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              void doRename();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void doRename()}
                          disabled={renameBusy || (renameDraft ?? snapshot.me.nickname).trim() === snapshot.me.nickname}
                        >
                          바꾸기
                        </button>
                      </div>
                      {renameMsg && (
                        <p className={renameMsg.ok ? 'note rename-msg' : 'form-error rename-msg'}>
                          {renameMsg.text}
                        </p>
                      )}
                    </section>
                  )}
                </div>
              </div>
            )}

            {/* ── ★★ 문제 화면 */}
            {snapshot.question && !snapshot.result && (
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
                activeCount={snapshot.room.activeCount}
                difficulties={snapshot.room.settings.difficulties}
                topics={snapshot.room.settings.topics}
              />
            )}

            {/* ── ★★ 일시정지 화면 (Phase 5) */}
            {snapshot.paused && (
              <Paused socket={socket} paused={snapshot.paused} serverNow={serverNow} />
            )}

            {/* ── ★★ 결과 화면 */}
            {snapshot.result && (
              <GameResult
                socket={socket}
                result={snapshot.result}
                isHost={snapshot.me.isHost}
                myAccountId={snapshot.me.accountId}
              />
            )}

            {/* ★ 게임이 시작됐는데 문제가 아직 없는 짧은 순간 — 빈 화면을 보여주지 않는다 */}
            {snapshot.game && !snapshot.question && !snapshot.result && !snapshot.paused && (
              <section className="card">
                <h2>게임 진행</h2>
                <p className="big dim">문제를 준비하고 있습니다…</p>
              </section>
            )}
          </div>

          {/* ── 채팅 로그 + 입력 (= 답안 입력. guide 12절). 가운데 아래에 늘 있다 */}
          <section className="card chat-card">
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
                    <ChatText
                      text={m.text}
                      mine={m.accountId === snapshot.me.accountId}
                      masked={m.masked}
                    />
                  </p>
                ),
              )}
            </div>
            {/* ★★ 도배 억제 안내 (Q-18). 입력창 바로 위 문서 흐름에 둔다 (iOS 키보드) */}
            {throttled && (
              <p className="warn throttle-note">
                너무 빨리 보내고 있습니다. 잠시 후 다시 보내 주세요.
              </p>
            )}
            <div className="field-row chat-input-row">
              <input
                ref={inputRef}
                value={draft}
                maxLength={100}
                className={judging ? 'judging' : undefined}
                placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // ★ 한글 IME 조합 중 Enter는 전송으로 처리하지 않는다 (미완성 문자열이 나간다)
                  if (e.key !== 'Enter') return;
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  send();
                }}
              />
              <button type="button" className="primary" onClick={send}>
                전송
              </button>
              {/* ★★ R034 — 단축키는 접어 둔다 (넘기기 투표만 넘기기 버튼에 크게) */}
              <ShortcutBar
                shortcuts={shortcuts}
                expanded={showKeys}
                onToggle={() => setShowKeys((v) => !v)}
              />
            </div>
          </section>
        </div>

        <aside className="seats seats-right" aria-label="참여자 6~10">
          {slots.slice(half).map(seatOf)}
        </aside>
      </div>
    </div>
  );
}

/** ★ R033 — 상태 코드를 사람 말로 (영문 상태값을 화면에 그대로 내보이지 않는다) */
function stateLabel(state: string): string {
  switch (state) {
    case 'LOBBY':
      return '대기 중';
    case 'COUNTDOWN':
      return '곧 시작';
    case 'QUESTION_ACTIVE':
      return '문제 풀이 중';
    case 'QUESTION_RESOLVED':
      return '정답 공개';
    case 'PAUSED':
      return '일시정지';
    case 'GAME_RESULT':
      return '결과';
    default:
      return state;
  }
}

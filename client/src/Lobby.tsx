// =============================================================================
// 방 화면 — 로비 · 게임 · 결과 (guide 6절 ~ 38절)
//
// ★★ R035 배치 (건우: "칸을 줄이고 합쳐라 / 공간을 잘 써라 / 설명은 숨겨라")
//   · ★ **상단 바 하나** — 방 제목 · 상태 · 인원 | 🔗 초대 · ✏ 닉네임(로비) · ⚙(테마·소리·로그아웃) · ⓘ 안내 · 나가기
//   · ★ 가운데 **카드 하나** — 로비: 설정 + 게임 시작 / 게임: 문제 카드 / 일시정지 / 결과: 순위 카드
//   · ★ 가운데 아래 채팅 / 양옆 참여자 칸 (좌 5 · 우 5)
//   · ★ 화면에는 **진행에 필요한 알림만** 남기고 규칙·단축키·화면 설명은 ⓘ 안으로 (R035 보고 1장 표)
//
// ★★ 채팅 입력창이 곧 답안 제출이다 (guide 12절 절대 규칙). 별도의 답안 입력창을 만들지 않는다.
//   ★ chat.send 에 **epoch 를 담는다** — 장치 B 의 클라이언트 쪽 절반이다.
// ★ 새로 만드는 버튼과 배지는 styles.css 의 라벨 규칙을 그대로 받는다 (D-022).
// =============================================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { formatExperienceRate, RULES } from '@quiz/shared';
import { changeNickname, deleteAvatar, errorMessage, uploadAvatar } from './api.js';
import Avatar from './Avatar.js';
import ProfileEditor from './ProfileEditor.js';
import ChatText from './ChatText.js';
import Countdown from './Countdown.js';
import GameSettings from './GameSettings.js';
import Question from './Question.js';
import GameResult from './GameResult.js';
import InfoTip from './InfoTip.js';
import Paused from './Paused.js';
import Prefs, { setRoomOwnsKeys } from './Prefs.js';
import Seat from './Seat.js';
import Emoji from './Emoji.js';
import EmojiPicker from './EmojiPicker.js';
import { useEmojiSlots } from './emojiCatalog.js';
import ShortcutBar from './ShortcutBar.js';
import { useFocusChatOnEscape, useShortcuts, type Shortcut } from './shortcuts.js';
import { chatSound, toggleMuteAll } from './sound.js';
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
  /** ★ R035 — 로그아웃은 상단 바 ⚙ 안에 있다 */
  onLogout: () => void;
}

export default function Lobby({
  socket,
  snapshot,
  chat,
  onLeave,
  serverNow,
  throttledUntil,
  onNicknameChanged,
  onLogout,
}: Props) {
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [throttled, setThrottled] = useState(false);
  /** ★ Q-56 — 단축키 전체 목록을 펼쳤는가 */
  const [showKeys, setShowKeys] = useState(false);
  /** ★★ Q-82 — 게임 중 나가기 확인창 (마지막 활성자가 나가면 방이 즉시 사라진다) */
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** ★ R034 — 닉네임 바꾸기 (R035 부터 상단 바 ✏ 의 작은 창) */
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [renameMsg, setRenameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  /** ★ R039 — 편집 중인 프로필 사진 파일 */
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  /** ★★ R035 — 채팅을 올려 보는 중에 새 메시지가 왔는가 (↓ 버튼) */
  const [newBelow, setNewBelow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  /** ★ 처음 받은 대화(스냅샷)는 반짝이지 않는다 — 들어오자마자 전부 반짝이면 이상하다 */
  const initialIds = useRef<Set<string> | null>(null);
  if (initialIds.current === null) initialIds.current = new Set(chat.map((m) => m.id));

  /**
   * ★ 초대 링크는 지금 브라우저의 origin 으로 만든다 (R004 0장). 터널 URL 이 바뀌어도 서버 재시작이 필요 없다.
   * ★★ R035 — 주소는 화면에 보이지 않는다 (건우: "못생겨서 방해된다"). 🔗 버튼이 복사만 한다.
   */
  const inviteUrl = useMemo(() => `${window.location.origin}/r/${snapshot.room.id}`, [snapshot.room.id]);

  // ── ★★ 채팅: 사용자가 **일부러 올려 본 때만** 멈추고, 그 밖에는 언제나 맨 아래 (R038 — 건우 버그 보고)
  //   ★ 옛 방식의 결함 (R038 1장): "맨 아래인가" 를 **scroll 이벤트**로 판단했다.
  //     (1) 코드가 맨 아래로 내린 직후 다음 메시지가 먼저 붙으면, 늦게 도착한 scroll 이벤트가 "맨 아래가 아니다" 로 읽혀
  //         따라 내려가기가 꺼졌다 — 친구들이 빨리 칠수록 잘 깨졌다.
  //     (2) 채팅 칸 높이가 바뀌면(정답 공개 카드가 커지는 등) 아래가 가려져도 아무도 다시 내리지 않았다.
  //   ★ 고친 방식: "올려 보는 중" 은 **사용자 동작(휠 위로 · 터치 끌기 · PageUp/↑ 키)** 으로만 켠다.
  //     맨 아래에 다시 닿거나 ↓ 를 누르면 끈다. 새 메시지 · 칸 크기 변화 때는 그 상태만 보고 내린다.
  const userScrolledUp = useRef(false);
  const pinToBottom = () => {
    const el = logRef.current;
    if (!el || userScrolledUp.current) return;
    el.scrollTop = el.scrollHeight;
  };
  useLayoutEffect(() => {
    if (userScrolledUp.current) setNewBelow(true);
    else {
      pinToBottom();
      setNewBelow(false);
    }
  }, [chat]);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => pinToBottom());
    ro.observe(el);
    const markUp = () => {
      // 다음 프레임에 실제로 맨 아래에서 벗어났는지 본다
      requestAnimationFrame(() => {
        if (el.scrollHeight - el.scrollTop - el.clientHeight > 24) userScrolledUp.current = true;
      });
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) markUp();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['PageUp', 'ArrowUp', 'Home'].includes(e.key)) markUp();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', markUp, { passive: true });
    el.addEventListener('keydown', onKey);
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', markUp);
      el.removeEventListener('keydown', onKey);
    };
  }, []);
  const scrollChatToBottom = () => {
    userScrolledUp.current = false;
    pinToBottom();
    setNewBelow(false);
  };

  // ── ★★ 모바일 키보드 (R039) — 키보드가 내려가면 **올라가기 전 화면 위치로** 돌아온다
  //   ★ 원인: 키보드가 올라오면 브라우저가 입력창이 보이도록 화면을 밀어 올린다. 내려가도 그 위치가 남아
  //     아래에 빈 공간(모바일 하단 여백 160px)이 드러났다. → 여백을 없애고(CSS), 내려갈 때 위치를 되돌린다.
  //   ★ visualViewport(보이는 영역) 높이로 키보드가 올라왔는지 판단한다 — 키보드는 이 높이만 줄인다.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let full = vv.height;
    let open = false;
    let saved = 0;
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement && !open) saved = window.scrollY;
    };
    const onResize = () => {
      if (vv.height < full * 0.8) {
        open = true;
      } else {
        full = Math.max(full, vv.height);
        if (open) {
          open = false;
          window.scrollTo({ top: saved });
        }
      }
    };
    document.addEventListener('focusin', onFocus);
    vv.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('focusin', onFocus);
      vv.removeEventListener('resize', onResize);
    };
  }, []);

  // ★ 억제 안내는 서버가 준 시각까지만 보여주고 스스로 사라진다
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
    // ★★ 장치 B — 지금 보고 있는 문제의 epoch 를 함께 보낸다 (guide 20절 / R003 2-3)
    socket.emit('chat.send', { text, epoch: snapshot.question?.epoch ?? null });
    setDraft('');
    // ★ 내가 보낸 메시지는 맨 아래로 따라간다
    userScrolledUp.current = false;
    inputRef.current?.focus();
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      // ★ 클립보드 API 가 막힌 환경(비-https 등) — 숨은 입력칸으로 복사한다
      const el = document.createElement('textarea');
      el.value = inviteUrl;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  /** ★ R034 — 닉네임 바꾸기. 결과(성공·겹침·게임 중)를 창 안에 바로 보여 준다 */
  const doRename = async () => {
    const next = (renameDraft ?? snapshot.me.nickname).trim();
    if (!next || next === snapshot.me.nickname || renameBusy) return;
    setRenameBusy(true);
    try {
      const saved = await changeNickname(next);
      setRenameDraft(null);
      setRenameMsg({ ok: true, text: `${saved}(으)로 바꿨습니다.` });
      onNicknameChanged(saved);
    } catch (err) {
      setRenameMsg({ ok: false, text: errorMessage(err, '닉네임을 바꿀 수 없습니다.') });
    } finally {
      setRenameBusy(false);
    }
  };
  useEffect(() => {
    if (!renameOpen) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.rename') && !(e.target as Element).closest('.modal-back')) setRenameOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [renameOpen]);

  const me = snapshot.players.find((p) => p.accountId === snapshot.me.accountId);
  const state = snapshot.room.state;
  const inLobby = state === 'LOBBY' || state === 'COUNTDOWN';
  const isActive = state === 'QUESTION_ACTIVE';
  const isResult = state === 'GAME_RESULT';
  const isPaused = state === 'PAUSED';
  const epoch = snapshot.question?.epoch ?? null;

  /**
   * ★★ Q-82 — 게임 중 나가기에만 확인창을 둔다. 로비·결과에는 잃을 것이 없다
   *   (확인창을 남발하면 진짜 위험한 순간의 확인창도 습관적으로 넘기게 된다).
   */
  const needsLeaveConfirm =
    state === 'COUNTDOWN' || state === 'QUESTION_ACTIVE' || state === 'QUESTION_RESOLVED' || isPaused;
  const leaveWithConfirm = () => {
    if (needsLeaveConfirm) setConfirmLeave(true);
    else onLeave();
  };

  /** ★ 지금 답안이 판정되는 상태인가. 입력창 자리표시를 바꾼다 */
  const judging = isActive && !snapshot.question?.selfExperienced;

  // ───────────────────────────────────────────────────────────────────────────
  // ★★ Q-56 단축키 — 전부 Alt 조합 (채팅 입력을 방해하지 않는다). 근거는 shortcuts.ts 헤더
  // ───────────────────────────────────────────────────────────────────────────
  // ★★ R039 — 이모티콘 (번호로 보낸다). 내 10칸 = Alt+1 ~ Alt+0
  const emojiSlots = useEmojiSlots();
  const [emojiFlash, setEmojiFlash] = useState<{ id: number; key: number } | null>(null);
  const sendEmoji = (id: number) => {
    if (!id) return;
    socket.emit('emoji.send', { emojiId: id });
    setEmojiFlash({ id, key: Date.now() });
  };

  const shortcuts: Shortcut[] = [
    {
      combo: 'Alt+S',
      fkey: 'F2',
      label: '넘기기 투표 / 취소',
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
      when: (isActive || state === 'QUESTION_RESOLVED' || isPaused) && snapshot.me.isHost,
      run: () => window.dispatchEvent(new CustomEvent('qw:host-end')),
    },
    {
      combo: 'Alt+A',
      fkey: null,
      label: '다시 하기 — 5초 뒤 바로 시작 (방장)',
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
    { combo: 'Alt+X', fkey: null, label: '방 나가기', when: true, run: leaveWithConfirm },
    { combo: 'Alt+G', fkey: 'F9', label: '단축키 목록 열기/닫기', when: true, run: () => setShowKeys((v) => !v) },
    // ★ R033 — 테마·소리. 방 안에서는 여기가 맡는다 (Prefs 의 전역 키는 쉰다)
    { combo: 'Alt+T', fkey: null, label: '테마 바꾸기', when: true, run: () => void cycleTheme() },
    { combo: 'Alt+M', fkey: null, label: '소리 켜기/끄기', when: true, run: () => void toggleMuteAll() },
    // ★ R039 — 이모티콘 10칸. 목록 창에는 한 줄로만 보인다
    { combo: 'Alt+1~0', fkey: null, label: '이모티콘 보내기 (내 10칸 — 😊 에서 바꿀 수 있다)', when: true, run: () => {}, displayOnly: true },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((k, i) => ({
      combo: `Alt+${k}`,
      fkey: null,
      label: `이모티콘 ${k}`,
      when: emojiSlots.length > 0,
      hideInList: true,
      run: () => sendEmoji(emojiSlots[i] ?? 0),
    })),
  ];
  useShortcuts(shortcuts);
  useEffect(() => {
    setRoomOwnsKeys(true);
    return () => setRoomOwnsKeys(false);
  }, []);
  // ★★ R033 — 소리 (오답에는 소리가 없다)
  useGameSounds(snapshot, serverNow);
  // ★★ Esc 로 채팅 입력에 포커스를 되돌린다
  useFocusChatOnEscape(inputRef);

  /** ★ 경험률 — 아직 값이 오지 않았으면 "—" (0% 로 단정하지 않는다) */
  const rateText = (accountId: string): string => {
    const rate = snapshot.experienceRates?.find((r) => r.accountId === accountId);
    if (!rate) return '경험률 —';
    return formatExperienceRate(rate.experienced, rate.total);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // ★★ 참여자 칸 — 마지막 메시지 · 반짝 · 정답자 반짝
  // ───────────────────────────────────────────────────────────────────────────
  // ★★ R039 — 참여자 칸의 이모티콘: 계정마다 마지막 이모티콘을 6초 동안
  const [emojiNow, setEmojiNow] = useState(() => Date.now());
  const lastEmojiOf = useMemo(() => {
    const out: Record<string, { id: number; key: string; at: number }> = {};
    for (const m of chat) if (m.emojiId && m.accountId) out[m.accountId] = { id: m.emojiId, key: m.id, at: Date.now() };
    return out;
  }, [chat]);
  const emojiSeen = useRef(new Map<string, number>());
  for (const [acc, e] of Object.entries(lastEmojiOf)) {
    const seenKey = `${acc}:${e.key}`;
    if (!emojiSeen.current.has(seenKey)) emojiSeen.current.set(seenKey, initialIds.current?.has(e.key) ? 0 : Date.now());
  }
  useEffect(() => {
    const t = setInterval(() => setEmojiNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seatEmoji = (accountId: string) => {
    const e = lastEmojiOf[accountId];
    if (!e) return null;
    const at = emojiSeen.current.get(`${accountId}:${e.key}`) ?? 0;
    return emojiNow - at < 6000 ? { id: e.id, key: e.key } : null;
  };
  /** 순위 (같은 점수는 같은 순위) */
  const rankOf = (score: number) => 1 + snapshot.players.filter((p) => p.score > score).length;
  // ── ★★★ 세레머니 (R038) — 정답 공개 동안 정답자가 친 채팅. 정답 메시지부터 모은다
  //   ★ 기준점: 정답 공개를 처음 본 순간, 채팅 목록에 있던 정답자의 마지막 메시지(= 정답 메시지)
  const ceremonyFrom = useRef<{ epoch: number; seq: number } | null>(null);
  const ceremonyWinner =
    state === 'QUESTION_RESOLVED' && snapshot.resolution?.reason === 'correct' ? snapshot.resolution.winnerAccountId : null;
  if (ceremonyWinner && snapshot.resolution && ceremonyFrom.current?.epoch !== snapshot.resolution.epoch) {
    let seq = Number.MAX_SAFE_INTEGER;
    for (const m of chat) if (m.accountId === ceremonyWinner) seq = m.seq;
    ceremonyFrom.current = { epoch: snapshot.resolution.epoch, seq };
  }
  const ceremony = useMemo(() => {
    if (!ceremonyWinner || !ceremonyFrom.current) return [];
    const from = ceremonyFrom.current.seq;
    return chat.filter((m) => !m.system && m.accountId === ceremonyWinner && m.seq >= from);
  }, [chat, ceremonyWinner]);

  // ── ★★ 채팅 소리 (R038) — 메시지가 올라올 때마다 (내 귀에만, 음량은 ⚙). 세레머니 중 정답자 채팅은 킹받는 소리
  const heard = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (heard.current === null) {
      heard.current = new Set(chat.map((m) => m.id));
      return;
    }
    for (const m of chat) {
      if (heard.current.has(m.id)) continue;
      heard.current.add(m.id);
      if (m.system) continue;
      if (m.emojiId) {
        chatSound('emoji');
        continue;
      }
      const taunt = Boolean(ceremonyWinner && m.accountId === ceremonyWinner && ceremony.some((c) => c.id === m.id));
      chatSound(taunt ? 'taunt' : 'chat');
    }
  }, [chat, ceremony, ceremonyWinner]);

  // ── ★★ 방향키로 버튼 사이 이동 (R038 — 결과 화면·확인창). 엔터로 누른다
  //   ★ [data-arrow-nav] 안의 버튼에 포커스가 있을 때만. 기본 동작(글자 사이 캐럿 이동)을 막는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const cur = document.activeElement as HTMLElement | null;
      const group = cur?.closest<HTMLElement>('[data-arrow-nav]');
      if (!cur || !group || cur.tagName !== 'BUTTON') return;
      const btns = [...group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const i = btns.indexOf(cur as HTMLButtonElement);
      if (i < 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      btns[(i + step + btns.length) % btns.length]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** ★ R039 — 계정별 사진 버전 (채팅 줄·결과 화면의 작은 아바타) */
  const avatarOf = (accountId: string) => snapshot.players.find((p) => p.accountId === accountId)?.avatarV ?? null;

  const showScore = !inLobby;
  const experiencedIds = new Set(
    state === 'QUESTION_ACTIVE' || state === 'QUESTION_RESOLVED'
      ? (snapshot.question?.experiencedPlayers ?? []).map((p) => p.accountId)
      : [],
  );
  const topScore = Math.max(0, ...snapshot.players.map((p) => p.score));
  const res = snapshot.resolution;
  const winnerId = state === 'QUESTION_RESOLVED' && res?.reason === 'correct' ? res.winnerAccountId : null;
  const seatOf = (index: number) => {
    const p = snapshot.players[index] ?? null;
    return (
      <Seat
        key={p ? p.accountId : `empty-${index}`}
        player={p}
        me={p?.accountId === snapshot.me.accountId}
        experienced={p ? experiencedIds.has(p.accountId) : false}
        showScore={showScore}
        lead={Boolean(p && showScore && topScore > 0 && p.score === topScore)}
        rate={p && inLobby ? rateText(p.accountId) : null}
        emoji={p ? seatEmoji(p.accountId) : null}
        rank={p && showScore ? rankOf(p.score) : null}
        winnerKey={p && winnerId === p.accountId ? res?.epoch ?? 0 : null}
        canKick={Boolean(p && snapshot.me.isHost && !p.connected)}
        onKick={() => p && socket.emit('host.kickDisconnected', { accountId: p.accountId })}
      />
    );
  };
  const slots = Array.from({ length: snapshot.room.maxPlayers }, (_, i) => i);
  const half = Math.ceil(slots.length / 2);

  // ★ R039 — 입력칸 자리표시(placeholder)를 지웠다 (건우). 지금 판정되는지는 입력칸 테두리 색(judging)으로 보인다

  const phase = inLobby ? 'lobby' : isResult ? 'result' : 'game';

  return (
    <div className={`room room-${phase}`}>
      {/* ── ★★ 상단 바 하나 */}
      <header className="room-head">
        <div className="room-title">
          <h1>{snapshot.room.title}</h1>
          <span className="state-pill">{stateLabel(state)}</span>
          <span className="dim room-count">
            {snapshot.players.length} / {snapshot.room.maxPlayers}명 · 접속 {snapshot.room.activeCount}명
          </span>
        </div>
        <div className="room-tools">
          <button type="button" id="invite-btn" className="ghost tiny" onClick={() => void copyInvite()} title="초대 링크 복사">
            {copied ? '✓' : '🔗'}<span className="lbl">{copied ? ' 복사됨' : ' 초대'}</span>
          </button>
          {state === 'LOBBY' && me && (
            <span className="rename">
              <button
                type="button"
                id="rename-btn"
                className="ghost tiny"
                aria-expanded={renameOpen}
                onClick={() => {
                  setRenameOpen((v) => !v);
                  setRenameMsg(null);
                }}
              >
                ✏️<span className="lbl"> 프로필</span>
              </button>
              {renameOpen && (
                <div className="rename-pop" role="dialog" aria-label="내 프로필">
                  {/* ★★ R039 — 프로필 사진: 누르면 사진 고르기 → 원형 편집기 */}
                  <div className="profile-row">
                    <label className="profile-photo" title="사진 바꾸기">
                      <Avatar
                        nickname={snapshot.me.nickname}
                        colorIndex={snapshot.me.colorIndex}
                        large
                        accountId={snapshot.me.accountId}
                        avatarV={me?.avatarV}
                      />
                      <span className="profile-cam" aria-hidden="true">📷</span>
                      <input
                        id="avatar-file"
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) setPhotoFile(f);
                        }}
                      />
                    </label>
                    {me?.avatarV ? (
                      <button
                        type="button"
                        className="ghost tiny"
                        onClick={() => {
                          void deleteAvatar().catch((err) => setRenameMsg({ ok: false, text: errorMessage(err) }));
                        }}
                      >
                        사진 지우기
                      </button>
                    ) : (
                      <span className="dim profile-tip">📷 눌러 사진 넣기</span>
                    )}
                  </div>
                  <div className="field-row">
                    <input
                      id="rename-input"
                      autoFocus
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
                        if (e.key === 'Escape') setRenameOpen(false);
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
                    <p className={renameMsg.ok ? 'note rename-msg' : 'form-error rename-msg'}>{renameMsg.text}</p>
                  )}
                </div>
              )}
            </span>
          )}
          <Prefs variant="gear" onLogout={onLogout} />
          {/* ★★ ⓘ — 규칙·단축키·화면 설명은 전부 여기 (R035) */}
          <InfoTip>
            <ul className="info-list">
              <li>
                <strong>채팅 입력창이 곧 답안 입력창입니다.</strong> 문제 중에 보낸 메시지가 정답과 같으면 가장 먼저 보낸
                사람이 1점. 틀려도 그냥 채팅으로 남습니다.
              </li>
              <li>
                문제는 <strong>40초</strong> — 남은 30초에 일반 힌트(있는 문제만), 15초에 초성 힌트. 정답 공개는{' '}
                <strong>8초</strong>(마지막 문제도 같다) 뒤 다음 문제로 갑니다.
              </li>
              <li>
                <strong>넘기기 투표</strong> — 접속한 사람 중 정해진 수가 누르면 넘깁니다(다시 누르면 취소). 누가
                눌렀는지는 보이지 않습니다. 혼자일 때는 투표로 넘길 수 없고, 방장은 언제든 넘길 수 있습니다.
              </li>
              <li>
                <span className="badge exp">경험</span> 이미 풀어 본 사람. 판정에서 빠지고, 그 사람이 쓴 정답은 남에게{' '}
                <span className="masked-chip">가려짐</span> 으로 보입니다(참여자 칸도 같다). 강제 종료한 문제는 경험
                기록을 남기지 않습니다.
              </li>
              <li>
                시작 버튼을 누르면 <strong>5초 뒤</strong> 시작합니다(방장은 취소 가능). 카운트다운 중에 들어온 사람도 그
                게임에 참가합니다.
              </li>
              <li>
                결과 화면 — <strong>다시 하기</strong>는 같은 설정으로 5초 뒤 바로 시작(그때 접속 중인 사람만),{' '}
                <strong>로비로</strong>는 설정을 바꾸러 갑니다. 경험 기록은 계속 남고 문제는 새로 고릅니다.
              </li>
              <li>
                모두 끊기면 일시정지. <strong>자동으로 재개되지 않습니다</strong> — 다들 돌아올 시간을 주려는 것입니다.
                5분 동안 아무도 없으면 방이 사라집니다. 게임 중 마지막 사람이 나가기를 누르면 방이 바로 사라집니다.
              </li>
              <li>
                로비의 경험률은 문제 DB 를 얼마나 풀어 봤는지입니다(높아도 시작은 막지 않는다). 접속이 끊긴 사람은 5초 뒤
                &quot;접속 종료&quot;로 보이고, 방장은 그 칸의 &quot;내보내기&quot;로 자리를 비울 수 있습니다.
              </li>
              <li>
                닉네임은 로비에서만 바꿀 수 있고 점수·경험 기록은 그대로입니다. ⚙ 의 테마·소리는 로그인한 계정에
                저장됩니다. 오답에는 소리가 없고, 소리는 화면을 한 번 누른 뒤부터 납니다.
              </li>
              <li>
                단축키는 전부 <kbd>Alt</kbd> 조합(정답 입력을 방해하지 않게). F키는 F2·F4·F8·F9 만. 목록은 입력창 옆
                ⌨ 또는 <kbd>Alt+G</kbd>.
              </li>
            </ul>
          </InfoTip>
          <button type="button" className="ghost tiny" onClick={leaveWithConfirm} aria-label="나가기">
            🚪<span className="lbl"> 나가기</span>
          </button>
        </div>
      </header>

      {photoFile && (
        <ProfileEditor
          file={photoFile}
          onCancel={() => setPhotoFile(null)}
          onDone={async (blob) => {
            await uploadAvatar(blob);
            setPhotoFile(null);
            setRenameMsg({ ok: true, text: '프로필 사진을 바꿨습니다.' });
          }}
        />
      )}

      {/* ★★ Q-82 — 게임 중 나가기 확인창. autoFocus 로 Enter 만으로 조작할 수 있다 (Q-56) */}
      {confirmLeave && (
        <section className="card confirm-card">
          <p className="big">방을 나갈까요?</p>
          <p className="note">
            ★ <strong>내가 마지막 접속자라면 방이 즉시 사라집니다.</strong> 잠깐 끊기는 것(새로고침)은 나가기와 달리
            일시정지됩니다.
          </p>
          <div className="field-row" data-arrow-nav>
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

      {/* ★ R038 — 모바일은 참여자 칸을 숨기므로, 방장에게 접속 종료자 "내보내기" 를 여기 따로 보인다 (넓은 화면에서는 숨김) */}
      {snapshot.me.isHost && snapshot.players.some((p) => !p.connected) && (
        <div className="mobile-kick" role="group" aria-label="접속 종료자">
          {snapshot.players
            .filter((p) => !p.connected)
            .map((p) => (
              <span key={p.accountId} className="mobile-kick-item">
                <span className="nick" style={{ color: `var(--p${p.colorIndex})` }}>{p.nickname}</span>{' '}
                <span className="badge off">접속 종료</span>{' '}
                <button type="button" className="tiny" onClick={() => socket.emit('host.kickDisconnected', { accountId: p.accountId })}>
                  내보내기
                </button>
              </span>
            ))}
        </div>
      )}

      <div className="stage">
        <aside className="seats seats-left" aria-label="참여자">
          {slots.slice(0, half).map(seatOf)}
        </aside>

        <div className="center">
          <div className="center-main">
            {/* ── 로비 (LOBBY / COUNTDOWN) — 카드 하나: 설정 + 게임 시작 */}
            {inLobby && (
              <section className="card lobby-card">
                <GameSettings
                  socket={socket}
                  settings={snapshot.room.settings}
                  settingsLocked={snapshot.room.settingsLocked}
                  availableQuestionCount={snapshot.room.availableQuestionCount}
                  isHost={snapshot.me.isHost}
                />
                <div className="start-area">
                  {snapshot.countdown ? (
                    <Countdown
                      socket={socket}
                      endsAt={snapshot.countdown.endsAt}
                      serverNow={serverNow}
                      isHost={snapshot.me.isHost}
                    />
                  ) : snapshot.me.isHost ? (
                    <button type="button" className="primary big-btn" onClick={() => socket.emit('game.start', {})}>
                      게임 시작
                    </button>
                  ) : (
                    <p className="note">방장이 게임을 시작할 때까지 기다려 주세요.</p>
                  )}
                </div>
              </section>
            )}

            {/* ── ★★ 문제 화면 (카드 하나) */}
            {snapshot.question && !snapshot.result && !snapshot.paused && (
              <Question
                socket={socket}
                question={snapshot.question}
                resolution={snapshot.resolution}
                skip={snapshot.skip}
                serverNow={serverNow}
                isHost={snapshot.me.isHost}
                state={state}
                players={snapshot.players}
                myAccountId={snapshot.me.accountId}
                activeCount={snapshot.room.activeCount}
                difficulties={snapshot.room.settings.difficulties}
                topics={snapshot.room.settings.topics}
                ceremony={ceremony}
              />
            )}

            {/* ── ★★ 일시정지 */}
            {snapshot.paused && <Paused socket={socket} paused={snapshot.paused} serverNow={serverNow} />}

            {/* ── ★★ 결과 (순위 카드 하나) */}
            {snapshot.result && (
              <GameResult
                socket={socket}
                players={snapshot.players}
                result={snapshot.result}
                isHost={snapshot.me.isHost}
                myAccountId={snapshot.me.accountId}
              />
            )}

            {/* ★ 게임이 시작됐는데 문제가 아직 없는 짧은 순간 — 빈 화면을 보여주지 않는다 */}
            {snapshot.game && !snapshot.question && !snapshot.result && !snapshot.paused && (
              <section className="card">
                <p className="big dim">문제를 준비하고 있습니다…</p>
              </section>
            )}
          </div>

          {/* ── 채팅 로그 + 입력 (= 답안 입력. guide 12절). ★ 스크롤바는 보이지 않고 휠로 올려 본다 (R035) */}
          <section className="card chat-card">
            <div className="chat-wrap">
              <div
                className="chat-log"
                ref={logRef}
                onScroll={(e) => {
                  // ★ 여기서는 "맨 아래에 다시 닿았다" 만 본다 (멈추는 것은 사용자 동작으로만 — 위 주석)
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
                    userScrolledUp.current = false;
                    setNewBelow(false);
                  }
                }}
              >
                {chat.map((m) =>
                  m.system ? (
                    <p key={m.id} className="chat-system">
                      {m.text}
                    </p>
                  ) : (
                    <p key={m.id} className="chat-line">
                      <Avatar
                        xs
                        nickname={m.nickname}
                        colorIndex={m.colorIndex}
                        accountId={m.accountId}
                        avatarV={avatarOf(m.accountId)}
                      />
                      <span className="nick" style={{ color: `var(--p${m.colorIndex})` }}>
                        {m.nickname}
                      </span>
                      {m.emojiId ? (
                        <Emoji id={m.emojiId} size={24} className="chat-emoji" />
                      ) : (
                        <ChatText text={m.text} mine={m.accountId === snapshot.me.accountId} masked={m.masked} />
                      )}
                    </p>
                  ),
                )}
              </div>
              {newBelow && (
                <button type="button" className="chat-down" aria-label="최신 메시지로" onClick={scrollChatToBottom}>
                  ↓
                </button>
              )}
            </div>
            {/* ★★ 도배 억제 안내 (Q-18) — 입력창 바로 위 문서 흐름 (iOS 키보드) */}
            {throttled && <p className="warn throttle-note">너무 빨리 보내고 있습니다. 잠시 후 다시 보내 주세요.</p>}
            <div className="field-row chat-input-row">
              <EmojiPicker slots={emojiSlots} onSend={sendEmoji} flash={emojiFlash} />
              <input
                ref={inputRef}
                value={draft}
                maxLength={RULES.CHAT_MAX_LENGTH}
                className={judging ? 'judging' : undefined}
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
              <ShortcutBar shortcuts={shortcuts} expanded={showKeys} onToggle={() => setShowKeys((v) => !v)} />
            </div>
          </section>
        </div>

        <aside className="seats seats-right" aria-label="참여자">
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

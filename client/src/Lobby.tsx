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
import { formatExperienceRate, NICKNAME_LIMIT_HINT, nicknameFits, NICKNAME_TOO_LONG_MESSAGE, RULES } from '@quiz/shared';
import { changeNickname, deleteAvatar, errorMessage, uploadAvatar } from './api.js';
import Avatar from './Avatar.js';
import ProfileEditor from './ProfileEditor.js';
import ConfirmModal from './ConfirmModal.js';
import KickFlow, { type KickTarget } from './KickFlow.js';
import PeoplePanel from './PeoplePanel.js';
import { openPopup, usePopup, useCurrentPopup } from './popup.js';
import MobileMenu from './MobileMenu.js';
import InvitePopup from './InvitePopup.js';
import InfoText from './InfoText.js';
import PopupClose from './PopupClose.js';
import Icon from './Icon.js';
import { ArrowDown, Camera, Check, Keyboard, Link, LogOut, Menu, Pencil, Send, SkipForward, Smile, Users } from 'lucide-react';
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
import { useFocusChatOnEscape, useShortcuts, type Shortcut } from './shortcuts.js';
import { chatSound, toggleMuteAll } from './sound.js';
import { cycleTheme } from './theme.js';
import { useGameSounds } from './useGameSounds.js';
import type { ChatView, RoomSnapshot } from './useRoom.js';
import BusyButton from './BusyButton.js';
import { BellButton, FriendsButton } from './SocialPopups.js';
import type { Social } from './useSocial.js';

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
  /** ★ R043 C — 친구 · 알림 */
  social: Social;
  /** ★ R043 C — 다른 방으로 (친구 방 · 초대) — 확인은 App 이 한다 */
  onJoinOther: (roomId: string) => void;
}

/** ★ R040 C-4 — 모바일 맞춤 글자의 하한 (문제 19px → 약 14px · 해설 16.8px → 약 12.6px) */
const MOBILE_FIT_MIN = 0.75;

/**
 * ★ R040 — 모바일 키보드를 내리는 상태 (C-3).
 * ★★ R041 (건우) — **새 문제 시작(QUESTION_ACTIVE)도** 더한다: "문제를 봐야 하니까. 소감을 치다가 새 문제가 시작되면 안 보인다."
 */
const KEYBOARD_DROP_STATES = new Set(['QUESTION_ACTIVE', 'QUESTION_RESOLVED', 'GAME_RESULT', 'LOBBY', 'PAUSED', 'COUNTDOWN']);

export default function Lobby({
  socket,
  snapshot,
  chat,
  onLeave,
  serverNow,
  throttledUntil,
  onNicknameChanged,
  onLogout,
  social,
  onJoinOther,
}: Props) {
  const [draft, setDraft] = useState('');
  // ★ R043 A-7 — 초대는 팝업 (방 코드 + 링크 복사)
  const [inviteOpen, setInviteOpen] = usePopup('invite');
  const [throttled, setThrottled] = useState(false);
  /** ★ Q-56 — 단축키 전체 목록을 펼쳤는가 */
  // ★★ R041 — 떠 있는 창은 전부 popup.ts 한 저장소 (한 번에 하나)
  // ★ R043 A-9 — 단축키 목록 창은 없앴다 (옛 'keys' 팝업)
  /** ★★ Q-82 — 게임 중 나가기 확인창 (마지막 활성자가 나가면 방이 즉시 사라진다) */
  const [confirmLeave, setConfirmLeave] = usePopup('leave');
  const [peopleOpen, setPeopleOpen] = usePopup('people');
  const [menuOpen, setMenuOpen] = usePopup('menu');
  const [kickOpen, setKickOpen] = usePopup('kick');
  const [kickTarget, setKickTarget] = useState<KickTarget | null>(null);
  const [photoOpen, setPhotoOpen] = usePopup('photo');
  const [photoDelOpen, setPhotoDelOpen] = usePopup('photo-delete');
  const openPopupId = useCurrentPopup();
  /** ★ R034 — 닉네임 바꾸기 (R035 부터 상단 바 ✏ 의 작은 창) */
  const [renameOpen, setRenameOpen] = usePopup('profile');
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
  /**
   * ★★ R040 — 한도(R041 10칸)를 넘는 옛 닉네임 (건우 확정): 로비에 들어오면 프로필 창을 **열어 두고** 바꾸라고 안내한다.
   *   바꾸기 전까지는 서버가 게임 시작을 막는다(NICKNAME_CHANGE_REQUIRED). 창은 바꿀 때까지 닫히지 않는다.
   */
  const mustRename = !nicknameFits(snapshot.me.nickname);
  useEffect(() => {
    // ★ R041 — 다른 창이 닫히고 아무 창도 없으면 다시 연다 (바꿀 때까지)
    if (mustRename && snapshot.room.state === 'LOBBY' && openPopupId === null) setRenameOpen(true);
  }, [mustRename, snapshot.room.state, openPopupId, setRenameOpen]);
  const renameText = renameDraft ?? snapshot.me.nickname;
  const renameFits = nicknameFits(renameText.trim());
  useEffect(() => {
    if (!renameOpen || mustRename) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.rename') && !(e.target as Element).closest('.modal-back')) setRenameOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [renameOpen, mustRename, setRenameOpen]);

  const me = snapshot.players.find((p) => p.accountId === snapshot.me.accountId);
  const state = snapshot.room.state;
  /**
   * ★★★ R040 — 모바일 키보드: **기본은 유지**, 이벤트 때만 내린다 (건우 확정).
   *   ★ 보내기·새 문제 시작에는 내리지 않는다 — 답을 연달아 빨리 쳐야 한다.
   *   ★ 내리는 때 = 화면을 봐야 하는 순간: 정답 공개(QUESTION_RESOLVED) · 결과(GAME_RESULT) · 로비로 돌아옴(LOBBY) ·
   *     일시정지(PAUSED) · 게임 시작 카운트다운(COUNTDOWN). ★ 정답자를 포함해 **모두** 내린다.
   *   ★ 방법: 입력칸 포커스를 푼다(blur) — 휴대폰 키보드가 내려간다. 다시 치려면 입력칸을 누른다.
   *   ★ 모바일 배치(1000px 미만)에서만 한다. PC 에는 화면 키보드가 없고, 포커스를 빼앗으면 바로 칠 수 없다.
   */
  const prevStateRef = useRef(state);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (prev === state) return;
    if (!KEYBOARD_DROP_STATES.has(state)) return;
    if (!window.matchMedia('(max-width: 999px)').matches) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) {
      a.blur();
      document.documentElement.dataset.kbDropped = String(Number(document.documentElement.dataset.kbDropped ?? 0) + 1);
    }
  }, [state]);
  const inLobby = state === 'LOBBY' || state === 'COUNTDOWN';
  const isActive = state === 'QUESTION_ACTIVE';
  const isResult = state === 'GAME_RESULT';
  const isPaused = state === 'PAUSED';
  const epoch = snapshot.question?.epoch ?? null;

  /**
   * ★★ Q-82 — 게임 중 나가기에만 확인창을 둔다. 로비·결과에는 잃을 것이 없다
   *   (확인창을 남발하면 진짜 위험한 순간의 확인창도 습관적으로 넘기게 된다).
   */
  // ★★ R043 A-6 (건우) — "돌이키기 힘든 결정은 반드시 확인 팝업". 로비·결과에서도 나가기는 확인한다 (옛 Q-82: 게임 중에만)
  const inGameForLeave =
    state === 'COUNTDOWN' || state === 'QUESTION_ACTIVE' || state === 'QUESTION_RESOLVED' || isPaused;
  const leaveWithConfirm = () => setConfirmLeave(true);

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
    /* ★★ R043 A-9 (건우) — "스킵 투표와 이모티콘 말고는 쓸 일이 없다" → 아래 단축키는 **비활성화**(지우지 않고 주석).
       되돌리는 법: 이 주석을 풀면 그대로 다시 동작한다 (Question · Paused 의 qw:host-skip / qw:host-end 받는 쪽은 남아 있다).
       단축키 목록 창(ShortcutBar)과 여는 버튼도 그렸던 자리에서 뺐다 — 07-DECISIONS D-206.
        {
          combo: 'Alt+K',
          fkey: 'F4',
          label: '이 문제 넘기기 (방장)', hostOnly: true,
          when: isActive && snapshot.me.isHost,
          // ★ 확인창을 거친다. 단축키로 문제를 즉시 넘기면 실수를 되돌릴 수 없다
          run: () => window.dispatchEvent(new CustomEvent('qw:host-skip')),
        },
        {
          combo: 'Alt+R',
          fkey: 'F8',
          label: '재개 (방장)', hostOnly: true,
          when: isPaused && Boolean(snapshot.paused?.canResume),
          run: () => socket.emit('game.resume', {}),
        },
        {
          combo: 'Alt+Q',
          fkey: null,
          label: '게임 강제 종료 (방장)', hostOnly: true,
          when: (isActive || state === 'QUESTION_RESOLVED' || isPaused) && snapshot.me.isHost,
          run: () => window.dispatchEvent(new CustomEvent('qw:host-end')),
        },
        {
          combo: 'Alt+A',
          fkey: null,
          label: '다시 하기 — 5초 뒤 바로 시작 (방장)', hostOnly: true,
          when: isResult && snapshot.me.isHost,
          run: () => socket.emit('game.again', {}),
        },
        {
          combo: 'Alt+L',
          fkey: null,
          label: '로비로 (방장)', hostOnly: true,
          when: isResult && snapshot.me.isHost,
          run: () => socket.emit('game.toLobby', {}),
        },
        { combo: 'Alt+X', fkey: null, label: '방 나가기', when: true, run: leaveWithConfirm },
        { combo: 'Alt+G', fkey: 'F9', label: '단축키 목록 열기/닫기', when: true, run: () => setShowKeys((v) => !v) },
        // ★ R033 — 테마·소리. 방 안에서는 여기가 맡는다 (Prefs 의 전역 키는 쉰다)
        { combo: 'Alt+T', fkey: null, label: '테마 바꾸기', when: true, run: () => void cycleTheme() },
        { combo: 'Alt+M', fkey: null, label: '소리 켜기/끄기', when: true, run: () => void toggleMuteAll() },
    */
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
    const t = setInterval(() => setEmojiNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const seatEmoji = (accountId: string) => {
    const e = lastEmojiOf[accountId];
    if (!e) return null;
    const at = emojiSeen.current.get(`${accountId}:${e.key}`) ?? 0;
    // ★ R040 (건우) — 칸의 이모티콘은 **3초**만 (R039 의 6초 개정)
    return emojiNow - at < RULES.SEAT_EMOJI_MS ? { id: e.id, key: e.key } : null;
  };
  /** 순위 (같은 점수는 같은 순위) — ★ 0점에는 붙이지 않는다 (R039 검수: 모두 0점이면 전원 "1위" 가 떠 군더더기) */
  const rankOf = (score: number) => 1 + snapshot.players.filter((p) => p.score > score).length;
  // ── ★★★ 소감 칸 (R038 세레머니 → ★ R040 이름 "소감") — 정답 공개 동안 정답자가 친 채팅.
  //   ★ 기준점: 정답 공개를 처음 본 순간, 채팅 목록에 있던 정답자의 마지막 메시지(= 정답 메시지)
  //   ★★ R040 (건우) — 정답 메시지는 **빼고** 그 **뒤**부터 모은다: "정답 단어는 이미 따로 나와 있다. 그냥 빈 칸으로 둬라"
  //     ★ 서버는 정답 채팅(chat.message)을 먼저 보내고 question.resolved 를 보낸다 → 처음 본 순간의 마지막 메시지가 정답 메시지다
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
    return chat.filter((m) => !m.system && m.accountId === ceremonyWinner && m.seq > from);
  }, [chat, ceremonyWinner]);

  /**
   * ★★ R040 C-4 — 모바일은 화면 스크롤이 생기면 안 된다 (건우: "글자 크기를 화면에 맞춤형으로").
   *   ★ 가장 긴 문제·정답·해설 + 소감이 한꺼번에 나오는 정답 공개 화면이 360·390 폭에서 넘쳤다 (실측 최대 202px).
   *   ★ 방법: 화면이 넘치면 문제 카드의 글자(지문·정답·해설·소감)를 4%씩 줄인다 — 하한 75%.
   *     그래도 넘치면 채팅 칸의 최소 높이를 줄인다(240 → 150px, 입력칸 + 몇 줄). 그래도 넘치면 그대로 둔다(보고서 4장).
   *   ★ 입력칸에 포커스가 있을 때(키보드가 올라온 동안)는 다시 재지 않는다 — 키보드 때문에 글자가 줄어들면 안 된다.
   */
  const roomRef = useRef<HTMLDivElement>(null);
  const ceremonyCount = ceremony.length;
  /** 키보드가 없을 때의 화면 높이 — 안드로이드는 키보드가 올라오면 innerHeight 가 줄어든다 */
  const fullHeight = useRef(0);
  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room) return undefined;
    const typing = () => {
      const a = document.activeElement;
      return Boolean(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'));
    };
    if (!typing() || fullHeight.current === 0) fullHeight.current = window.innerHeight;
    const fit = () => {
      const se = document.scrollingElement ?? document.documentElement;
      room.style.removeProperty('--qs');
      room.classList.remove('squeeze');
      if (!window.matchMedia('(max-width: 999px)').matches) {
        room.dataset.qs = '1';
        return;
      }
      const over = () => se.scrollHeight - Math.max(window.innerHeight, fullHeight.current);
      let qs = 1;
      while (over() > 0 && qs > MOBILE_FIT_MIN) {
        qs = Math.max(MOBILE_FIT_MIN, Math.round((qs - 0.04) * 100) / 100);
        room.style.setProperty('--qs', String(qs));
      }
      if (over() > 0) room.classList.add('squeeze');
      room.dataset.qs = String(qs);
      room.dataset.fitOver = String(Math.max(0, over()));
    };
    fit();
    const onResize = () => {
      if (typing()) return;
      fullHeight.current = window.innerHeight;
      fit();
    };
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(fit);
    return () => window.removeEventListener('resize', onResize);
  }, [
    state,
    snapshot.question?.epoch,
    snapshot.question?.generalHint,
    snapshot.question?.hintRevealed,
    snapshot.resolution?.epoch,
    snapshot.resolution?.late.length,
    ceremonyCount,
  ]);


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
  /** ★★ R041 — 사람을 골랐다 (PC 참여자 칸 · 모바일 👥 창) → 강퇴 / 차단 고르기 팝업. 방장만 · 자기 자신은 안 된다 */
  // ★★ R043 C — 친구 신청은 누구나: 아직 친구도 아니고 신청도 없는 사람이면 "친구 신청" 이 붙는다
  const related = new Set([...social.friends, ...social.incoming, ...social.outgoing].map((f) => f.accountId));
  const canPick = (accountId: string) => accountId !== snapshot.me.accountId && (snapshot.me.isHost || !related.has(accountId));
  const pickPlayer = (p: { accountId: string; nickname: string; connected: boolean }) => {
    if (!canPick(p.accountId)) return;
    setKickTarget({ accountId: p.accountId, nickname: p.nickname, step: 'choose', connected: p.connected });
    setKickOpen(true);
  };
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
        rank={p && showScore && p.score > 0 ? rankOf(p.score) : null}
        winnerKey={p && winnerId === p.accountId ? res?.epoch ?? 0 : null}
        onPick={p && canPick(p.accountId) ? () => pickPlayer(p) : undefined}
      />
    );
  };
  const slots = Array.from({ length: snapshot.room.maxPlayers }, (_, i) => i);
  const half = Math.ceil(slots.length / 2);

  // ★ R039 — 입력칸 자리표시(placeholder)를 지웠다 (건우). 지금 판정되는지는 입력칸 테두리 색(judging)으로 보인다

  const phase = inLobby ? 'lobby' : isResult ? 'result' : 'game';

  return (
    <div ref={roomRef} className={`room room-${phase}`}>
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
          <span className="invite">
            <button type="button" id="invite-btn" className="ghost tiny" aria-expanded={inviteOpen} onClick={() => setInviteOpen((v) => !v)}>
              <Icon icon={Link} />
              <span className="lbl">초대</span>
            </button>
            {inviteOpen && <InvitePopup code={snapshot.room.code} url={inviteUrl} onClose={() => setInviteOpen(false)} />}
          </span>
          {/* ★★ R043 C — 친구 · 🔔 알림 (모바일은 ☰ 안) */}
          <FriendsButton social={social} inRoom={new Set(snapshot.players.map((p) => p.accountId))} />
          <BellButton social={social} onJoin={onJoinOther} />
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
                <Icon icon={Pencil} />
                <span className="lbl">프로필</span>
              </button>
              {renameOpen && (
                <div className="rename-pop" role="dialog" aria-label="내 프로필">
                  <div className="pop-head">
                    <p className="pop-title">프로필</p>
                    {!mustRename && <PopupClose onClose={() => setRenameOpen(false)} />}
                  </div>
                  {mustRename && (
                    <p className="rename-must">
                      <Icon icon={Pencil} /> 닉네임을 바꿔야 게임에 참여할 수 있어요
                      <span>{NICKNAME_LIMIT_HINT}</span>
                    </p>
                  )}
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
                      <span className="profile-cam" aria-hidden="true">
                        <Icon icon={Camera} />
                      </span>
                      <input
                        id="avatar-file"
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) {
                            setPhotoFile(f);
                            setPhotoOpen(true);
                          }
                        }}
                      />
                    </label>
                    {me?.avatarV ? (
                      <button
                        type="button"
                        className="ghost tiny"
                        onClick={() => setPhotoDelOpen(true)}
                      >
                        사진 지우기
                      </button>
                    ) : (
                      <span className="dim profile-tip">
                        <Icon icon={Camera} /> 눌러 사진 넣기
                      </span>
                    )}
                  </div>
                  <div className="field-row">
                    <input
                      id="rename-input"
                      className={renameFits ? undefined : 'nick-input-over'}
                      aria-invalid={!renameFits}
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
                        if (e.key === 'Escape' && !mustRename) setRenameOpen(false);
                      }}
                    />
                    <BusyButton
                      onClick={() => void doRename()}
                      busy={renameBusy}
                      disabled={!renameFits || renameText.trim() === snapshot.me.nickname}
                    >
                      바꾸기
                    </BusyButton>
                  </div>
                  {/* ★ R041 — 칸 수 대신: 넘으면 빨갛게 + 떨림 + 안내 (건우: "1씩 · 0.8씩 오르는 표시가 이상하다") */}
                  {!renameFits && <p className="form-error rename-msg nick-over">{NICKNAME_TOO_LONG_MESSAGE}</p>}
                  {renameMsg && (
                    <p className={renameMsg.ok ? 'note rename-msg' : 'form-error rename-msg'}>{renameMsg.text}</p>
                  )}
                </div>
              )}
            </span>
          )}
          {/* ★★ R041 — 모바일 참여자 창 (넓은 화면은 양옆 칸이 있어 숨긴다). 인원 수를 작게 붙인다 (판단) */}
          <button
            type="button"
            id="people-btn"
            className="ghost tiny people-btn"
            aria-label="참여자"
            aria-expanded={peopleOpen}
            onClick={() => setPeopleOpen((v) => !v)}
          >
            <Icon icon={Users} />
            <span className="people-count">{snapshot.players.length}</span>
          </button>
          <Prefs variant="gear" onLogout={onLogout} />
          {/* ★★ ⓘ — R041 (건우: "안내가 너무 많다. 필요한 설명만") — 처음 하는 사람이 꼭 알아야 할 것만. 뺀 것은 R041 보고서 4장 표 */}
          {/* ★★ R043 B — 안내문은 InfoText 한 곳 (웹 · 모바일 따로) */}
          <InfoTip>
            <InfoText />
          </InfoTip>
          <button type="button" className="ghost tiny" onClick={leaveWithConfirm} aria-label="나가기">
            <Icon icon={LogOut} />
            <span className="lbl">나가기</span>
          </button>
          {/* ★★ R042 B — 모바일 ☰ (초대 · 프로필 · 설정 · 안내 · 나가기를 몰아넣는다). 넓은 화면에서는 숨긴다 */}
          <button
            type="button"
            id="menu-btn"
            className="ghost tiny menu-btn"
            aria-label="메뉴"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon icon={Menu} />
            {/* ★ R043 C — 새 알림 · 받은 신청이 있으면 빨간 점 */}
            {(social.unread > 0 || social.incoming.length > 0) && <span className="red-dot" aria-label="새 알림" />}
          </button>
        </div>
      </header>

      {/* ★★ R042 B — 모바일 ☰ 메뉴 (팝업 — 한 번에 하나). 항목을 누르면 그 창이 이 자리를 넘겨받는다 */}
      {menuOpen && (
        <MobileMenu
          canRename={state === 'LOBBY' && Boolean(me)}
          onInvite={() => setInviteOpen(true)}
          onFriends={() => openPopup('friends')}
          onNotices={() => openPopup('notices')}
          noticeCount={social.unread}
          friendWaiting={social.incoming.length}
          onProfile={() => {
            setRenameMsg(null);
            setRenameOpen(true);
          }}
          onSettings={() => openPopup('prefs')}
          onInfo={() => openPopup('info')}
          onLeave={() => {
            setMenuOpen(false);
            leaveWithConfirm();
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {photoFile && photoOpen && (
        <ProfileEditor
          file={photoFile}
          onCancel={() => {
            setPhotoFile(null);
            // ★ R041 — 편집기는 프로필 창 자리를 잠깐 빌렸다(팝업 하나) → 닫으면 프로필 창으로 돌아간다
            setRenameOpen(true);
          }}
          onDone={async (blob) => {
            await uploadAvatar(blob);
            setPhotoFile(null);
            setRenameOpen(true);
            setRenameMsg({ ok: true, text: '프로필 사진을 바꿨습니다.' });
          }}
        />
      )}

      {/* ★ R043 A-6 — 사진 지우기도 확인 */}
      {photoDelOpen && (
        <ConfirmModal
          kind="photo-delete"
          title="프로필 사진을 지울까요?"
          actions={[
            {
              label: '지우기',
              tone: 'warn',
              onClick: () => {
                setPhotoDelOpen(false);
                void deleteAvatar().catch((err) => setRenameMsg({ ok: false, text: errorMessage(err) }));
              },
            },
          ]}
          onCancel={() => setPhotoDelOpen(false)}
        />
      )}

      {/* ★★ R041 — 모바일 참여자 창 · 강퇴/차단 (팝업 — 한 번에 하나) */}
      {peopleOpen && (
        <PeoplePanel
          players={snapshot.players}
          myAccountId={snapshot.me.accountId}
          isHost={snapshot.me.isHost}
          showScore={showScore}
          rankOf={rankOf}
          rateOf={(id) => (inLobby ? rateText(id) : null)}
          experiencedIds={experiencedIds}
          onPick={pickPlayer}
          canPick={canPick}
          onClose={() => setPeopleOpen(false)}
        />
      )}
      {kickOpen && kickTarget && snapshot.players.some((p) => p.accountId === kickTarget.accountId) && (
        <KickFlow
          socket={socket}
          target={kickTarget}
          isHost={snapshot.me.isHost}
          onFriend={related.has(kickTarget.accountId) ? undefined : () => social.request({ accountId: kickTarget.accountId })}
          onStep={(step) => setKickTarget({ ...kickTarget, step })}
          onClose={() => {
            setKickOpen(false);
            setKickTarget(null);
          }}
        />
      )}

      {/* ★★ Q-82 — 게임 중 나가기 확인 (★ R041 팝업 — 화면에 요소를 끼워 넣지 않는다). Enter 확정 · Esc 닫기 */}
      {confirmLeave && (
        <ConfirmModal
          kind="leave"
          title="방을 나갈까요?"
          note={inGameForLeave ? '마지막 접속자면 방이 바로 사라져요.' : `방 코드 ${snapshot.room.code} 로 다시 들어올 수 있어요.`}
          actions={[
            {
              label: '나가기',
              tone: 'warn',
              onClick: () => {
                setConfirmLeave(false);
                onLeave();
              },
            },
          ]}
          onCancel={() => {
            setConfirmLeave(false);
            inputRef.current?.focus();
          }}
        />
      )}

      {/* ★ R041 — 옛 모바일 "내보내기" 줄(R038)은 👥 참여자 창의 강퇴로 합쳤다 */}

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
                  <Icon icon={ArrowDown} />
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
              {/* ★ R040 C-3 — 누를 때 포커스가 버튼으로 가지 않게 → 휴대폰 키보드가 내려갔다 올라오지 않는다 (연달아 치기) */}
              <button type="button" className="primary send-btn" onMouseDown={(e) => e.preventDefault()} onClick={send}>
                <Icon icon={Send} /> 전송
              </button>
              {/* ★ R043 A-9 — 단축키 목록 버튼·창 삭제 (단축키는 넘기기 · 이모티콘만 — ⓘ 안내에 적었다) */}
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

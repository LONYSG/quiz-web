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

import { openPersonCard, setPersonActions, type PersonActions } from './PersonCard.js';
import { ReportButton } from './AppReport.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { countEmojiTokens, formatExperienceRate, INLINE_EMOJI_MAX, nicknameFits, RULES } from '@quiz/shared';
import Avatar from './Avatar.js';
import ConfirmModal from './ConfirmModal.js';
import KickFlow, { type KickTarget } from './KickFlow.js';
import PeoplePanel from './PeoplePanel.js';
import { openPopup, usePopup, useCurrentPopup } from './popup.js';
import MobileMenu from './MobileMenu.js';
import InvitePopup from './InvitePopup.js';
import InfoText from './InfoText.js';
import Icon from './Icon.js';
import { ArrowDown, Check, Keyboard, Link, LogOut, Menu, Send, SkipForward, Smile, Users } from 'lucide-react';
import ChatText from './ChatText.js';
import Countdown from './Countdown.js';
import GameSettings from './GameSettings.js';
import Question from './Question.js';
import GameResult from './GameResult.js';
import ErrorBoundary from './ErrorBoundary.js';
import InfoTip from './InfoTip.js';
import Paused from './Paused.js';
import Prefs, { setRoomOwnsKeys } from './Prefs.js';
import Seat from './Seat.js';
import Emoji from './Emoji.js';
import EmojiPicker from './EmojiPicker.js';
import { pushRecentEmoji } from './emojiRecent.js';
import { emojiToken, isSpecialEmoji, peekEmojiCatalog, specialDisplayMode, useEmojiSlots } from './emojiCatalog.js';
import { useFocusChatOnEscape, useShortcuts, type Shortcut } from './shortcuts.js';
import { chatSound, toggleMuteAll } from './sound.js';
import { cycleTheme } from './theme.js';
import { useGameSounds } from './useGameSounds.js';
import type { ChatView, RoomSnapshot } from './useRoom.js';
import { BellButton, FriendsButton } from './SocialPopups.js';
import ProfilePanel from './ProfilePanel.js';
import ShopPanel, { useShopDot } from './ShopPanel.js';
import MinigameStage from './minigame/MinigameStage.js';
import MinigamePicker from './minigame/MinigamePicker.js';
import { LastGameFeedback } from './QuestionFeedback.js';
import { fetchLastFeedbackGame } from './api.js';
import type { Social } from './useSocial.js';
import { isMobileUi, useUiMode } from './uiMode.js';

interface Props {
  socket: Socket;
  snapshot: RoomSnapshot;
  chat: ChatView[];
  /** ★ R045 B — roomGone: 내가 마지막이라 방이 사라진다 (코드 칸을 채우지 않는다) */
  onLeave: (roomGone: boolean) => void;
  /** 서버 시각 추정치. 카운트다운·문제 타이머 표시에 쓴다 */
  serverNow: () => number;
  /** ★ 도배 억제 안내 (Q-18). 입력창 바로 위에 인라인으로 표시한다 */
  throttledUntil: number | null;
  /** ★ R048 — 채팅 · 이모티콘 중 무엇이 잠겼나 */
  throttledKind: 'chat' | 'emoji' | 'special';
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
  throttledKind,
  onNicknameChanged,
  onLogout,
  social,
  onJoinOther,
}: Props) {
  const [draft, setDraft] = useState('');
  // ★ R043 A-7 — 초대는 팝업 (방 코드 + 링크 복사)
  const [inviteOpen, setInviteOpen] = usePopup('invite');
  const [throttled, setThrottled] = useState(false);
  /** ★ R048 — 잠금 남은 초 (매초 줄어든다) · 잠긴 채 보내려 하면 입력창이 떨린다 */
  const [lockLeft, setLockLeft] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  /** ★ Q-56 — 단축키 전체 목록을 펼쳤는가 */
  // ★★ R041 — 떠 있는 창은 전부 popup.ts 한 저장소 (한 번에 하나)
  // ★ R043 A-9 — 단축키 목록 창은 없앴다 (옛 'keys' 팝업)
  /** ★★ Q-82 — 게임 중 나가기 확인창 (마지막 활성자가 나가면 방이 즉시 사라진다) */
  const [confirmLeave, setConfirmLeave] = usePopup('leave');
  const [peopleOpen, setPeopleOpen] = usePopup('people');
  const [menuOpen, setMenuOpen] = usePopup('menu');
  // ★ R066 (D-288) — 포인트샵을 아직 안 열었으면 ☰ · 메뉴 줄에 빨간 점
  const shopDot = useShopDot();
  const [kickOpen, setKickOpen] = usePopup('kick');
  const [kickTarget, setKickTarget] = useState<KickTarget | null>(null);
  const openPopupId = useCurrentPopup();
  /** ★ R034 — 닉네임 바꾸기 (R035 부터 상단 바 ✏ 의 작은 창) */
  // ★ R046 D — 프로필 창은 ProfilePanel 한 곳 (방 목록 화면과 같은 창). 여기서는 "바꿔야 함" 이면 다시 여는 것만
  const [, setRenameOpen] = usePopup('profile');
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
  // ★★ R048 (찬종: "알림 잘 띄워") — 남은 초를 매초 줄이며 보인다. 잠기는 순간 입력창이 한 번 떨린다
  useEffect(() => {
    if (throttledUntil === null) return undefined;
    const remain = throttledUntil - Date.now();
    if (remain <= 0) return undefined;
    setThrottled(true);
    setLockLeft(Math.ceil(remain / 1000));
    setShakeKey((k) => k + 1);
    const tick = setInterval(() => {
      const left = throttledUntil - Date.now();
      if (left <= 0) {
        setThrottled(false);
        setLockLeft(0);
        clearInterval(tick);
      } else setLockLeft(Math.ceil(left / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, [throttledUntil]);
  /** 잠긴 동안 보내려 하면: 보내지 않고(치던 글은 남긴다) 입력창만 떨린다 */
  const lockedNow = throttled && throttledUntil !== null && throttledUntil > Date.now();
  // 떨림은 클래스를 잠깐 붙였다 뗀다 (입력창을 다시 만들지 않는다 — 포커스 · 커서를 지킨다)
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (shakeKey === 0) return undefined;
    setShaking(true);
    const id = setTimeout(() => setShaking(false), 340);
    return () => clearTimeout(id);
  }, [shakeKey]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (lockedNow && throttledKind === 'chat') {
      setShakeKey((k) => k + 1);
      return;
    }
    // ★★ 장치 B — 지금 보고 있는 문제의 epoch 를 함께 보낸다 (guide 20절 / R003 2-3)
    socket.emit('chat.send', { text, epoch: snapshot.question?.epoch ?? null });
    setDraft('');
    caretRef.current = null;
    // ★ 내가 보낸 메시지는 맨 아래로 따라간다
    userScrolledUp.current = false;
    inputRef.current?.focus();
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
    if (!isMobileUi()) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) {
      a.blur();
      document.documentElement.dataset.kbDropped = String(Number(document.documentElement.dataset.kbDropped ?? 0) + 1);
    }
  }, [state]);
  const inLobby = state === 'LOBBY' || state === 'COUNTDOWN';
  // ★★ R056 — 로비 "지난 판 문제 평가" 링크: 로비에 들어올 때마다 내가 참가한 마지막 판을 다시 묻는다
  const [lastFeedbackGame, setLastFeedbackGame] = useState<string | null>(null);
  useEffect(() => {
    if (state !== 'LOBBY') return undefined;
    let alive = true;
    void fetchLastFeedbackGame().then((id) => {
      if (alive) setLastFeedbackGame(id);
    });
    return () => {
      alive = false;
    };
  }, [state]);
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
  /**
   * ★★ R045 B — 내가 나가면 방이 사라지는가 (서버 leaveRoom 과 같은 기준)
   *   게임 중: 나 말고 **접속 중인** 사람이 없다 → 즉시 폭파(Q-82) / 로비 · 결과: 참가자 목록에 나만 → 즉시 정리
   *   (로비에서 접속이 끊긴 사람이 목록에 남아 있으면 방은 남는다 — 그 사람이 돌아올 수 있다)
   */
  const othersHere = snapshot.players.filter((p) => p.accountId !== snapshot.me.accountId && (!inGameForLeave || p.connected));
  const roomGoneOnLeave = othersHere.length === 0;

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
    // ★ R048 — 이모티콘 잠금 중에는 보내지 않는다 (안내만 떨린다) · ★ R049 — 특별은 특별 잠금만 본다 (따로 센다)
    const special = isSpecialEmoji(id);
    if (lockedNow && throttledKind === (special ? 'special' : 'emoji')) {
      setShakeKey((k) => k + 1);
      return;
    }
    socket.emit('emoji.send', { emojiId: id });
    setEmojiFlash({ id, key: Date.now() });
    pushRecentEmoji(id); // ★ R069 (#70) — "자주" 탭
  };
  // ★★★ R057 (D-250) — 입력창에 넣기: 커서 자리에 토큰(표준 = 글자 · 특별 = :sp:번호:) · 한 줄 10개까지
  //   ★ 터치 기기는 입력창에 포커스를 주지 않는다(키보드가 올라와 고르기 창을 덮는다) — 마지막 커서 자리에 넣는다
  const caretRef = useRef<number | null>(null);
  const insertEmoji = (id: number) => {
    const e = peekEmojiCatalog()?.byId.get(id);
    if (!e) return;
    const token = emojiToken(e);
    if (countEmojiTokens(draft) >= INLINE_EMOJI_MAX || draft.length + token.length > RULES.CHAT_MAX_LENGTH) {
      setShakeKey((k) => k + 1);
      return;
    }
    const at = Math.min(caretRef.current ?? draft.length, draft.length);
    const next = draft.slice(0, at) + token + draft.slice(at);
    pushRecentEmoji(id); // ★ R069 (#70)
    caretRef.current = at + token.length;
    setDraft(next);
    if (!window.matchMedia('(pointer: coarse)').matches) {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(at + token.length, at + token.length);
      });
    }
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
    const out: Record<string, { id: number; ids: number[]; key: string; at: number }> = {};
    // ★ R066 (D-275 · 찬종 #37) — 채팅으로 보낸 이모티콘(입력창에 넣기 · emojiIds 가 붙은 것)은 글로 친다 → 칸에 띄우지 않는다(이모티콘 보내기만)
    for (const m of chat) if (m.emojiId && m.accountId && !m.emojiIds?.length) out[m.accountId] = { id: m.emojiId, ids: [m.emojiId], key: m.id, at: Date.now() };
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
    return emojiNow - at < RULES.SEAT_EMOJI_MS ? { id: e.id, ids: e.ids, key: e.key } : null;
  };
  // ── ★★★ R049 D — 특별 이모티콘 = **떠 있는 큰 반응** (채팅 입력창 바로 위 · 약 96px · 3초 · 동시 최대 3개 · 보낸 사람 닉네임)
  //   ★ 찬종: "이 특별한 이모티콘은 공간을 좀더 차지해서 모두가 자세히 볼 수 있게 … 모바일에서는 채팅로그에 올라오지 않는 이상 안보이거든"
  //   → PC · 모바일 같은 자리(입력창 위)에 뜬다. 로그엔 "닉네임 + 작은 그림(32px)" 한 줄이 남는다.
  //   ★ 대안(로그 안에 크게 96px)은 specialDisplayMode() === 'inline' — 그림으로 비교하려고 남겨 둔 분기 (D-231)
  const specialDisplay = specialDisplayMode();
  const [floats, setFloats] = useState<{ key: string; id: number; nickname: string; colorIndex: number; at: number }[]>([]);
  const floatSeen = useRef<Set<string> | null>(null);
  if (floatSeen.current === null) floatSeen.current = new Set(chat.map((m) => m.id));
  useEffect(() => {
    if (specialDisplay !== 'float') return;
    const seen = floatSeen.current!;
    const fresh = chat.filter((m) => m.special && m.emojiId && !m.emojiIds?.length && !seen.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) seen.add(m.id);
    const now = Date.now();
    // ★ R057 — 채팅으로 보낸 이모티콘만 1~3개면 그중 특별인 것마다
    const add = fresh.flatMap((m) =>
      (m.emojiIds ?? [m.emojiId!]).filter((id) => isSpecialEmoji(id)).map((id, i) => ({ key: `${m.id}:${i}`, id, nickname: m.nickname, colorIndex: m.colorIndex, at: now })),
    );
    setFloats((prev) => [...prev, ...add].slice(-RULES.SPECIAL_FLOAT_MAX));
  }, [chat, specialDisplay]);
  useEffect(() => {
    if (floats.length === 0) return undefined;
    const t = setInterval(() => {
      const cut = Date.now() - RULES.SPECIAL_FLOAT_MS;
      setFloats((prev) => (prev.some((f) => f.at < cut) ? prev.filter((f) => f.at >= cut) : prev));
    }, 200);
    return () => clearInterval(t);
  }, [floats.length]);

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
  // ★ R055 — PC ↔ 모바일이 바뀌면 화면 부품이 다시 그려진 **뒤에** 다시 잰다(전에는 resize 순간 — 아직 PC 배치일 때 — 재고 끝나 360 폭에서 81px 넘쳤다)
  const uiModeNow = useUiMode();
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
      if (!isMobileUi()) {
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
    uiModeNow,
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
  // ★★ R063 (D-262) — 사람을 누르면 **프로필 카드 하나**(사진 · 업적 + 친구 · 강퇴 · 차단 버튼). "어떻게 할까요?" 고르기 창은 없앴다
  const canPick = (accountId: string) => accountId !== snapshot.me.accountId;
  const pickPlayer = (p: { accountId: string; nickname: string; colorIndex: number; avatarV?: number | null; connected: boolean }) => {
    if (!canPick(p.accountId)) return;
    openPersonCard({ accountId: p.accountId, nickname: p.nickname, colorIndex: p.colorIndex, avatarV: p.avatarV ?? null });
  };
  const friendIds = new Set(social.friends.map((f) => f.accountId));
  const actRef = useRef<(id: string) => PersonActions | null>(() => null);
  actRef.current = (id: string) => {
    const p = snapshot.players.find((x) => x.accountId === id);
    if (!p || id === snapshot.me.accountId) return null;
    const kick = (step: KickTarget['step']) => () => {
      setKickTarget({ accountId: p.accountId, nickname: p.nickname, step, connected: p.connected });
      setKickOpen(true);
    };
    return {
      friend: friendIds.has(id) ? 'friend' : related.has(id) ? 'pending' : 'none',
      onFriend: () => social.request({ accountId: id }),
      ...(snapshot.me.isHost ? { onKick: kick('kick'), onBan: kick('ban'), ...(p.connected ? { onHost: kick('host') } : {}) } : {}),
    };
  };
  useEffect(() => {
    setPersonActions((id) => actRef.current(id));
    return () => setPersonActions(null);
  }, []);
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
          <FriendsButton social={social} inRoom={new Set(snapshot.players.map((p) => p.accountId))} onJoin={onJoinOther} />
          {/* ★★ R044 A-3 (건우) — 🔔 알림은 화면에서 뺐다 (친구 창과 겹친다). 되살리려면 주석을 푼다 — 07-DECISIONS D-214
          <BellButton social={social} onJoin={onJoinOther} />
          */}
          {state === 'LOBBY' && me && (
            <ProfilePanel
              accountId={snapshot.me.accountId}
              nickname={snapshot.me.nickname}
              colorIndex={snapshot.me.colorIndex}
              avatarV={me.avatarV}
              mustRename={mustRename}
              onNicknameChanged={onNicknameChanged}
            />
          )}
          {/* ★★ R049 — 🎁 포인트샵 (로비 · 게임 중 · 결과 전부 — 찬종: "게임 플레이 중이더라도"). 모바일은 ☰ 안 */}
          <ShopPanel onClosed={() => inputRef.current?.focus()} />
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
          {/* ★ R063 — 제보(PC 위 막대 · 모바일은 ☰ 메뉴 안)
              ★★ R067 (D-300 · A91) — PC 는 ⚙ 창의 "제보" 탭으로 모았다(이 버튼 · ⓘ 는 PC 에서 숨김 — 모바일 ☰ 가 여는 창이라 남겨 둔다) */}
          <ReportButton />
          <Prefs variant="gear" onLogout={onLogout} tabs />
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
            {/* ★ R044 A-4 — 받은 신청 + 받은 초대 (옛: 안 읽은 알림 포함) */}
            {(social.pending > 0 || shopDot) && <span className="red-dot" aria-label={social.pending > 0 ? '새 친구 신청 · 초대' : '새 포인트샵'} />}
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
          friendWaiting={social.pending}
          onProfile={() => setRenameOpen(true)}
          onShop={() => openPopup('shop')}
          shopDot={shopDot}
          onSettings={() => openPopup('prefs')}
          onInfo={() => openPopup('info')}
          onLeave={() => {
            setMenuOpen(false);
            leaveWithConfirm();
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {/* ★★ R041 — 모바일 참여자 창      {/* ★★ R041 — 모바일 참여자 창 · 강퇴/차단 (팝업 — 한 번에 하나) */}
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
          note={roomGoneOnLeave ? '마지막 사람이라 나가면 방이 사라져요.' : `방 코드 ${snapshot.room.code} 로 다시 들어올 수 있어요.`}
          actions={[
            {
              label: '나가기',
              tone: 'warn',
              onClick: () => {
                setConfirmLeave(false);
                onLeave(roomGoneOnLeave);
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
                {/* ★ R066 (D-274 · 찬종 #38) — 손님은 안내 한 줄만 · 카드 오른쪽 아래(버튼 줄 자리)로 */}
                <div className={snapshot.me.isHost || snapshot.countdown ? 'start-area' : 'start-area guest'}>
                  {snapshot.countdown ? (
                    <Countdown
                      socket={socket}
                      endsAt={snapshot.countdown.endsAt}
                      serverNow={serverNow}
                      isHost={snapshot.me.isHost}
                    />
                  ) : snapshot.me.isHost ? (
                    <>
                      <button type="button" className="primary big-btn" onClick={() => socket.emit('game.start', {})}>
                        게임 시작
                      </button>
                      {/* ★★ R050 — 로비 "미니게임 골라 하기" (연습 판) */}
                      {state === 'LOBBY' && <MinigamePicker socket={socket} />}
                    </>
                  ) : (
                    <p className="note dim start-wait">방장이 게임을 시작할 때까지 기다려 주세요.</p>
                  )}
                  {/* ★★ R056 — 결과 화면을 놓친 사람용 "지난 판 문제 평가" (내가 참가한 마지막 판이 있을 때만) */}
                  {state === 'LOBBY' && lastFeedbackGame && <LastGameFeedback gameId={lastFeedbackGame} />}
                </div>
              </section>
            )}

            {/* ── ★★★ R050 — 미니게임 (퀴즈 판 중간 · 로비 연습) */}
            {snapshot.minigame && (
              <MinigameStage
                socket={socket}
                view={snapshot.minigame}
                players={snapshot.players}
                myAccountId={snapshot.me.accountId}
                isHost={snapshot.me.isHost}
                serverNow={serverNow}
              />
            )}

            {/* ── ★★ 문제 화면 (카드 하나) */}
            {snapshot.question && !snapshot.result && !snapshot.paused && !snapshot.minigame && (
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
                level={snapshot.room.settings.level}
                topics={snapshot.room.settings.topics}
                ceremony={ceremony}
                gameId={snapshot.game?.gameId ?? null}
              />
            )}

            {/* ── ★★ 일시정지 */}
            {snapshot.paused && <Paused socket={socket} paused={snapshot.paused} serverNow={serverNow} />}

            {/* ── ★★ 결과 (순위 카드 하나) */}
            {snapshot.result && (
              /* ★★ R064 (D-264) — 결과를 그리다 예외가 나도 방 화면이 통째로 비지 않게 · 방장은 로비로 갈 수 있게 */
              <ErrorBoundary
                name="result"
                fallback={() => (
                  <section className="card result-card" data-result-fallback>
                    <p className="info">결과를 그리지 못했어요.</p>
                    <div className="next-row">
                      {snapshot.me.isHost ? (
                        <button type="button" className="primary big-btn" onClick={() => socket.emit('game.toLobby', {})}>
                          로비로
                        </button>
                      ) : (
                        <p className="note">방장이 다음 게임을 준비 중입니다.</p>
                      )}
                    </div>
                  </section>
                )}
              >
                <GameResult
                  socket={socket}
                  players={snapshot.players}
                  result={snapshot.result}
                  isHost={snapshot.me.isHost}
                  myAccountId={snapshot.me.accountId}
                />
              </ErrorBoundary>
            )}

            {/* ★ 게임이 시작됐는데 문제가 아직 없는 짧은 순간 — 빈 화면을 보여주지 않는다 */}
            {snapshot.game && !snapshot.question && !snapshot.result && !snapshot.paused && !snapshot.minigame && (
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
                        zoom
                      />
                      <span className="nick" style={{ color: `var(--p${m.colorIndex})` }}>
                        {m.nickname}
                      </span>
                      {m.emojiId ? (
                        // ★ R049 — 특별 이모티콘: 기본(float)은 로그에 32px 한 줄(큰 반응은 입력창 위에 떠 있다) · 대안(inline)은 로그 안에 96px
                        // ★ R057 — 채팅으로 보낸 이모티콘만 1~3개면 나란히
                        (m.emojiIds ?? [m.emojiId]).map((id, i) => {
                          const sp = isSpecialEmoji(id);
                          return (
                            <Emoji
                              key={i}
                              id={id}
                              size={sp ? (specialDisplay === 'inline' ? 96 : 32) : 24}
                              className={sp ? (specialDisplay === 'inline' ? 'chat-emoji chat-special-big' : 'chat-emoji chat-special') : 'chat-emoji'}
                            />
                          );
                        })
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
            <div className="chat-foot">
            {/* ★★★ R049 D — 떠 있는 큰 반응 (입력창 바로 위에 겹쳐 뜨는 층 · 문서 흐름 밖 · 누를 수 없다) */}
            {specialDisplay === 'float' && floats.length > 0 && (
              <div className="special-layer" aria-live="polite" aria-label="특별 이모티콘">
                {floats.map((f) => (
                  <span key={f.key} className="special-float">
                    <Emoji id={f.id} size={RULES.SPECIAL_FLOAT_PX} className="special-float-pic" />
                    <span className="special-float-nick" style={{ color: `var(--p${f.colorIndex})` }}>
                      {f.nickname}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {/* ★★ 도배 억제 안내 (Q-18) — 입력창 바로 위 문서 흐름 (iOS 키보드) */}
            {throttled && (
              <p className="warn throttle-note" role="status" aria-live="polite">
                {throttledKind === 'special' ? '특별 이모티콘 도배 방지' : throttledKind === 'emoji' ? '이모티콘 도배 방지' : '도배 방지'} · <strong className="mono">{lockLeft}초</strong> 후 다시 보낼 수 있어요
              </p>
            )}
            {/* ★ R057 — 특별 이모티콘 토큰(:sp:번호:)이 든 글은 보낼 모습을 입력창 바로 위에 작게 보인다(입력창은 글자만 그린다) */}
            {draft.includes(':sp:') && (
              <div className="chat-preview" aria-label="보낼 모습">
                <ChatText text={draft} mine={false} masked={false} />
              </div>
            )}
            <div className="field-row chat-input-row">
              <EmojiPicker slots={emojiSlots} onSend={sendEmoji} onInsert={insertEmoji} flash={emojiFlash} />
              <input
                ref={inputRef}
                data-chat-input
                value={draft}
                maxLength={RULES.CHAT_MAX_LENGTH}
                className={[judging ? 'judging' : '', lockedNow ? 'locked' : '', shaking ? 'input-shake' : ''].filter(Boolean).join(' ') || undefined}
                onChange={(e) => {
                  setDraft(e.target.value);
                  caretRef.current = e.target.selectionStart;
                }}
                onSelect={(e) => {
                  caretRef.current = e.currentTarget.selectionStart;
                }}
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
    case 'MINIGAME':
      return '미니게임';
    default:
      return state;
  }
}

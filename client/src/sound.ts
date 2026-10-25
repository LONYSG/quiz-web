// =============================================================================
// 소리 (R033) — 배경음악 + 효과음. ★ 전부 브라우저에서 합성한다 (Web Audio).
//
// ★ 건우: "사운드도 하나도 없으니 너무 심심하다. 효과음도 다양하게 쓰면 좋겠다."
//   · 기본 배경음악을 깐다
//   · ★★ 정답 시 효과음 + 정답자 부각
//   · ★★ **오답에는 소리를 넣지 않는다** — 채팅이 곧 답이라 오답이 아주 많다
//
// ★ 왜 합성인가 (자체 판단)
//   · 파일이 없다 — 음원 수집·변환·용량·라이선스 확인이 필요 없다. 터널로 받는 데이터도 늘지 않는다
//   · 후보를 코드 몇 줄로 바꿔 끼울 수 있다 (건우가 들어 보고 고른다)
//   · 대가: 녹음된 음원보다 단순한 소리다. 고른 뒤 실제 음원으로 바꾸는 것은 쉽다 (R033 보고 4장)
//
// ★★ 자동재생 — 브라우저는 사용자가 한 번 누르기 전에는 소리를 막는다.
//   → 첫 클릭·키 입력에서 AudioContext 를 만들고(풀고) 그때부터 배경음악을 튼다.
//
// ★ 설정은 localStorage 에 남는다. 배경음악과 효과음을 **따로** 끄고 음량을 따로 조절한다.
// =============================================================================

// ★★ R034 (건우 선택) — 배경음악은 "통통 경쾌" · "8비트 게임기" 둘만 남긴다 (오르골 삭제).
//   ★ 정답 효과음은 "코인" 하나로 고정한다 (딩동댕·빰빠밤 삭제). 고르는 칸도 없앴다.
export type BgmId = 'bounce' | 'chip';

export const BGMS: readonly { id: BgmId; label: string }[] = [
  { id: 'bounce', label: '통통 경쾌' },
  { id: 'chip', label: '8비트 게임기' },
];

export interface SoundPrefs {
  bgmOn: boolean;
  sfxOn: boolean;
  /** 0~1 */
  bgmVol: number;
  /** 0~1 */
  sfxVol: number;
  bgm: BgmId;
  /**
   * ★★ R038 — 채팅 소리 (메시지가 하나 올라올 때마다 · 세레머니 때 정답자 채팅은 킹받는 소리).
   *   ★ 내 귀에 들리는 것만 정한다 — 남에게 들리는 것은 끌 수 없다 (건우 확정). 그래서 받는 쪽에서 재생한다.
   */
  chatOn: boolean;
  /** 0~1 */
  chatVol: number;
}

const KEY = 'qw.sound.v1';
const DEFAULTS: SoundPrefs = {
  bgmOn: true,
  sfxOn: true,
  // ★ 배경음악은 작게. 시끄러우면 끈다 — 그러면 효과음까지 끌 수 있다
  bgmVol: 0.35,
  sfxVol: 0.7,
  bgm: 'bounce',
  // ★ 채팅 소리는 작게 — 도배 때 귀가 아프지 않게
  chatOn: true,
  chatVol: 0.45,
};

let prefs: SoundPrefs = loadPrefs();

function loadPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      bgmOn: typeof p.bgmOn === 'boolean' ? p.bgmOn : DEFAULTS.bgmOn,
      sfxOn: typeof p.sfxOn === 'boolean' ? p.sfxOn : DEFAULTS.sfxOn,
      bgmVol: clamp01(p.bgmVol, DEFAULTS.bgmVol),
      sfxVol: clamp01(p.sfxVol, DEFAULTS.sfxVol),
      // ★ 지운 곡(오르골)이 저장돼 있으면 기본 곡으로
      bgm: BGMS.some((b) => b.id === p.bgm) ? (p.bgm as BgmId) : DEFAULTS.bgm,
      chatOn: typeof p.chatOn === 'boolean' ? p.chatOn : DEFAULTS.chatOn,
      chatVol: clamp01(p.chatVol, DEFAULTS.chatVol),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp01(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;
}

export function getSoundPrefs(): SoundPrefs {
  return { ...prefs };
}

export function setSoundPrefs(patch: Partial<SoundPrefs>): SoundPrefs {
  const before = prefs;
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* 이번 세션에는 적용된다 */
  }
  applyVolumes();
  if (prefs.bgmOn && (!before.bgmOn || before.bgm !== prefs.bgm)) restartBgm();
  if (!prefs.bgmOn) stopBgm();
  window.dispatchEvent(new CustomEvent('qw:sound', { detail: prefs }));
  return { ...prefs };
}

/** Alt+M — 둘 다 켜져 있거나 하나라도 켜져 있으면 전부 끄고, 전부 꺼져 있으면 전부 켠다 */
export function toggleMuteAll(): SoundPrefs {
  const anyOn = prefs.bgmOn || prefs.sfxOn || prefs.chatOn;
  return setSoundPrefs({ bgmOn: !anyOn, sfxOn: !anyOn, chatOn: !anyOn });
}

// ─────────────────────────────────────────────────────────────────────────────
// 오디오 그래프
// ─────────────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let bgmGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
/** ★ R038 — 채팅 소리 전용 (음량을 따로 조절한다) */
let chatGain: GainNode | null = null;
/** 문제 진행 중에는 배경음악을 조금 줄인다 (지문에 집중) */
let duck = 1;

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  bgmGain = ctx.createGain();
  sfxGain = ctx.createGain();
  chatGain = ctx.createGain();
  bgmGain.connect(ctx.destination);
  sfxGain.connect(ctx.destination);
  chatGain.connect(ctx.destination);
  applyVolumes();
  // ★★ R041 — 오디오가 다시 깨어나면(running) 배경음악을 이어 튼다 (탭 복귀 · 전화 뒤 · 다른 앱 소리 뒤 등)
  ctx.onstatechange = () => {
    // 검사용 표시 (ui-check — 탭 한 번 뒤 running 인가)
    document.documentElement.dataset.audio = ctx?.state ?? 'none';
    if (ctx?.state === 'running' && prefs.bgmOn && !timer) startBgm();
  };
  document.documentElement.dataset.audio = ctx.state;
  return ctx;
}

function applyVolumes(): void {
  if (!ctx || !bgmGain || !sfxGain) return;
  const t = ctx.currentTime;
  // ★ 음량은 제곱으로 — 슬라이더 중간이 귀에 "중간" 으로 들린다
  // ★ R041 — 배경음악 비중을 올렸다 (옛 0.5 → 1.2). 옛 값은 효과음보다 약 20dB 작아 노트북 스피커에서 "배경음이 안 들린다" (원인 — 코드 계산)
  bgmGain.gain.setTargetAtTime(prefs.bgmOn ? prefs.bgmVol ** 2 * 1.2 * duck : 0, t, 0.08);
  sfxGain.gain.setTargetAtTime(prefs.sfxOn ? prefs.sfxVol ** 2 : 0, t, 0.02);
  chatGain?.gain.setTargetAtTime(prefs.chatOn ? prefs.chatVol ** 2 : 0, t, 0.02);
}

export function setDuck(on: boolean): void {
  // ★ R041 — 문제 중 줄이는 폭도 줄였다 (0.55 → 0.7). 너무 줄이면 문제마다 배경음이 사라진 것처럼 들린다
  const next = on ? 0.7 : 1;
  if (next === duck) return;
  duck = next;
  applyVolumes();
}

/**
 * ★ 사용자 조작에서 소리를 연다. 앱 시작 때 한 번 건다.
 *   ★ 브라우저 자동재생 정책 — 조작 전에는 AudioContext 가 잠겨 있다.
 *
 * ★★★ R041 (건우: "삼성 인터넷은 소리가 아예 안 난다 · PC 도 배경음이 안 들릴 때가 있다") — 고친 것
 *   (확인) 옛 코드는 **첫 pointerdown 한 번**에만 깨우고 바로 리스너를 지웠다.
 *     ★ 터치의 pointerdown 은 브라우저가 "사용자 조작(활성화)" 으로 치지 않는다(활성화는 pointerup·touchend·click·keydown —
 *       HTML 명세의 activation-triggering 이벤트). 그래서 휴대폰에서는 그 한 번의 resume() 이 실패할 수 있고, 다시 시도할 길이 없었다.
 *       카카오톡 안 브라우저(WebView)는 자동 재생 제한이 느슨해 그 한 번으로도 열렸을 것이다 (추정 — 확인 필요).
 *   (확인) 탭이 가려졌다 돌아오거나 전화·다른 앱 소리로 오디오가 잠들면(suspended · iOS interrupted) 다시 깨우는 코드가 없었다.
 *   → 고침: 조작이 있을 **때마다**(pointerup · touchend · click · keydown · pointerdown) 잠들어 있으면 깨운다 — 리스너를 지우지 않는다.
 *     깨어나면(statechange) 배경음악을 이어 튼다. 화면으로 돌아오면(visibilitychange) 한 번 깨워 본다.
 *     WebKit 용으로 조작 안에서 무음 1샘플을 한 번 재생한다 (오디오 출력을 확실히 연다).
 */
export function installAudioUnlock(): void {
  let primed = false;
  const wake = () => {
    const c = ensureCtx();
    if (!c) return;
    if (!primed) {
      // ★ 조작 안에서 무음을 한 번 재생 — 일부 브라우저는 실제 재생이 있어야 출력을 연다
      try {
        const b = c.createBuffer(1, 1, 22050);
        const src = c.createBufferSource();
        src.buffer = b;
        src.connect(c.destination);
        src.start(0);
        primed = true;
      } catch {
        // 무시 — 다음 조작에서 다시
      }
    }
    if (c.state !== 'running') {
      void c.resume().then(
        () => {
          if (prefs.bgmOn) startBgm();
        },
        () => undefined,
      );
    } else if (prefs.bgmOn && !timer) {
      startBgm();
    }
  };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
    window.addEventListener(ev, wake, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !ctx) return;
    if (ctx.state !== 'running') {
      void ctx.resume().then(
        () => {
          if (prefs.bgmOn) startBgm();
        },
        () => undefined,
      );
    }
  });
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === 'running';
}

// ─────────────────────────────────────────────────────────────────────────────
// 악기
// ─────────────────────────────────────────────────────────────────────────────

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Voice {
  type: OscillatorType;
  /** 피크 음량 */
  gain: number;
  attack: number;
  decay: number;
  /** 화음 배음 (비율, 음량) */
  partials?: [number, number][];
}

function playNote(
  dest: AudioNode,
  freq: number,
  start: number,
  dur: number,
  v: Voice,
  glideTo?: number,
): void {
  if (!ctx) return;
  const parts = v.partials ?? [[1, 1]];
  for (const [ratio, amp] of parts) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(freq * ratio, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo * ratio, start + dur);
    const peak = v.gain * amp;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + v.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + v.attack + Math.max(v.decay, dur));
    osc.connect(g);
    g.connect(dest);
    osc.start(start);
    osc.stop(start + v.attack + Math.max(v.decay, dur) + 0.05);
  }
}

const BELL: Voice = { type: 'sine', gain: 0.35, attack: 0.005, decay: 0.6, partials: [[1, 1], [2, 0.35], [3.01, 0.12]] };
const PLUCK: Voice = { type: 'triangle', gain: 0.28, attack: 0.004, decay: 0.22 };
const SQUARE: Voice = { type: 'square', gain: 0.12, attack: 0.003, decay: 0.12 };
const SOFT: Voice = { type: 'sine', gain: 0.28, attack: 0.01, decay: 0.25 };

// ─────────────────────────────────────────────────────────────────────────────
// ★ 효과음
// ─────────────────────────────────────────────────────────────────────────────

export type SfxId =
  | 'join'
  | 'tick'
  | 'go'
  | 'question'
  | 'hint'
  | 'urgent'
  | 'correct'
  | 'mine'
  | 'timeout'
  | 'skip'
  | 'result'
  | 'pause'
  | 'resume'
  // ★★★ R050 — 미니게임 (D-236 · Web Audio 로 직접 만든 소리 — 무료 소스 후보는 /lab/sound 에서 찬종이 고른다)
  | 'mg-jingle'
  | 'mg-ready'
  | 'mg-go'
  | 'mg-round'
  | 'mg-final'
  | 'mg-return'
  | 'mg-tap'
  | 'mg-move'
  | 'mg-cut'
  // ★★★ R051 — 번개손 진짜 신호(가짜 "소리만" 도 같은 소리) · 실격 부저 · 다 맞게 침(타자) · 확정(각도)
  | 'mg-signal'
  | 'mg-foul'
  | 'mg-done';

/** ★ 효과음을 낸다. 꺼져 있거나 아직 잠겨 있으면 아무것도 하지 않는다 */
/**
 * ★ R042 — 소리 진단 기록 (전수 점검 · ui-check --sound). 호출마다 한 줄: 무엇을 · 실제로 울렸나 · 그때 오디오 상태.
 *   최근 200개만. 화면·서버로 보내지 않는다 (개발자 도구에서 window.__qwSoundLog 로 본다).
 */
interface SoundLogEntry {
  t: number;
  id: string;
  played: boolean;
  state: string;
  why?: string;
}
const soundLog: SoundLogEntry[] = [];
(window as unknown as { __qwSoundLog?: SoundLogEntry[] }).__qwSoundLog = soundLog;
function logSound(id: string, played: boolean, why?: string): void {
  soundLog.push({ t: Math.round(performance.now()), id, played, state: ctx?.state ?? 'none', why });
  if (soundLog.length > 200) soundLog.splice(0, soundLog.length - 200);
}

export function sfx(id: SfxId): void {
  if (!prefs.sfxOn || !ctx || ctx.state !== 'running' || !sfxGain) {
    logSound(id, false, !prefs.sfxOn ? 'off' : !ctx ? 'no-ctx' : `ctx-${ctx.state}`);
    return;
  }
  logSound(id, true);
  const t = ctx.currentTime + 0.01;
  const d = sfxGain;
  switch (id) {
    case 'join': // 뽁뽁
      playNote(d, mtof(76), t, 0.08, PLUCK);
      playNote(d, mtof(83), t + 0.08, 0.1, PLUCK);
      break;
    case 'tick': // 카운트다운 5·4·3·2·1
      playNote(d, mtof(81), t, 0.06, { ...SOFT, gain: 0.22, decay: 0.12 });
      break;
    case 'go': // 시작!
      [72, 76, 79, 84].forEach((m, i) => playNote(d, mtof(m), t + i * 0.06, 0.18, PLUCK));
      break;
    case 'question': // 문제 등장 — 위로 쓸어 올리는 소리
      playNote(d, mtof(67), t, 0.18, { ...SOFT, gain: 0.18 }, mtof(79));
      playNote(d, mtof(84), t + 0.16, 0.12, { ...BELL, gain: 0.18 });
      break;
    case 'hint': // 반짝
      [88, 91, 96].forEach((m, i) => playNote(d, mtof(m), t + i * 0.07, 0.15, { ...BELL, gain: 0.14 }));
      break;
    case 'urgent': // 마지막 5초 — 작게 똑딱
      playNote(d, mtof(93), t, 0.03, { ...SQUARE, gain: 0.05, decay: 0.05 });
      break;
    case 'correct':
      playCorrect(d, t);
      break;
    case 'mine': // 내가 맞혔을 때 덧붙는 반짝
      playCorrect(d, t);
      [96, 100, 103, 108].forEach((m, i) => playNote(d, mtof(m), t + 0.35 + i * 0.05, 0.1, { ...BELL, gain: 0.1 }));
      break;
    case 'timeout': // 아쉬움 — 거슬리지 않게 부드럽게 내려간다
      playNote(d, mtof(67), t, 0.22, SOFT);
      playNote(d, mtof(63), t + 0.22, 0.35, SOFT);
      break;
    case 'skip':
      playNote(d, mtof(76), t, 0.2, { ...SOFT, gain: 0.18 }, mtof(64));
      break;
    case 'result': // 결과 화면
      [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => playNote(d, mtof(m), t + i * 0.08, 0.3, { ...BELL, gain: 0.2 }));
      break;
    case 'pause':
      playNote(d, mtof(60), t, 0.3, { ...SOFT, gain: 0.2 });
      break;
    case 'resume':
      playNote(d, mtof(67), t, 0.12, PLUCK);
      playNote(d, mtof(72), t + 0.1, 0.18, PLUCK);
      break;
    // ── ★★★ R050 미니게임
    case 'mg-jingle': // 깜짝 이벤트! — 북 굴림 + 올라가는 팡파레
      for (let i = 0; i < 10; i += 1) playNote(d, mtof(48 + (i % 2)), t + i * 0.045, 0.05, { ...SQUARE, gain: 0.05 + i * 0.006, decay: 0.05 });
      [67, 71, 74, 79].forEach((m, i) => playNote(d, mtof(m), t + 0.5 + i * 0.09, 0.16, { ...BRASS, gain: 0.08 }));
      for (const m of [79, 83, 86]) playNote(d, mtof(m), t + 0.9, 0.7, { ...BRASS, gain: 0.07, decay: 0.7 });
      [91, 95, 98].forEach((m, i) => playNote(d, mtof(m), t + 0.95 + i * 0.06, 0.25, { ...BELL, gain: 0.08 }));
      break;
    case 'mg-ready': // 준비 — 짧은 두 음
      playNote(d, mtof(72), t, 0.08, PLUCK);
      playNote(d, mtof(72), t + 0.25, 0.08, PLUCK);
      break;
    case 'mg-go': // 시작!
      playNote(d, mtof(84), t, 0.22, { ...SQUARE, gain: 0.1, decay: 0.22 });
      playNote(d, mtof(79), t, 0.22, { ...BELL, gain: 0.1 });
      break;
    case 'mg-round': // 판 결과 — 위로 똑 떨어지는 세 음
      [76, 79, 84].forEach((m, i) => playNote(d, mtof(m), t + i * 0.07, 0.14, { ...BELL, gain: 0.14 }));
      break;
    case 'mg-final': // 최종 결과 — 짧은 빵빠레
      playCorrect(d, t);
      [84, 88, 91, 96].forEach((m, i) => playNote(d, mtof(m), t + 0.9 + i * 0.06, 0.2, { ...BELL, gain: 0.1 }));
      break;
    case 'mg-return': // 퀴즈로 돌아간다 — 내려오는 쓸기
      playNote(d, mtof(84), t, 0.35, { ...SOFT, gain: 0.16 }, mtof(67));
      playNote(d, mtof(72), t + 0.3, 0.2, PLUCK);
      break;
    case 'mg-tap': // 눌렀다 (케이크 — 내 화면에서만)
      playNote(d, mtof(88), t, 0.06, { ...PLUCK, gain: 0.18 });
      break;
    case 'mg-move': // 점 옮김 (균형 — 작게)
      playNote(d, mtof(96), t, 0.02, { ...SQUARE, gain: 0.025, decay: 0.03 });
      break;
    case 'mg-cut': // 칼이 지나간다 — 쉬익 + 똑
      playNote(d, mtof(100), t, 0.25, { ...SOFT, gain: 0.08 }, mtof(76));
      playNote(d, mtof(60), t + 0.24, 0.12, { ...PLUCK, gain: 0.2 });
      break;
    case 'mg-signal': // ★ 번개손 "지금!" — 짧고 날카로운 두 겹 삑 (가짜 "소리만" 도 이 소리)
      playNote(d, mtof(93), t, 0.12, { ...SQUARE, gain: 0.12, decay: 0.12 });
      playNote(d, mtof(100), t, 0.12, { ...BELL, gain: 0.16, decay: 0.2 });
      break;
    case 'mg-foul': // 실격 — 낮은 부저 두 번
      playNote(d, mtof(45), t, 0.14, { ...SQUARE, gain: 0.09, decay: 0.14 });
      playNote(d, mtof(44), t + 0.17, 0.2, { ...SQUARE, gain: 0.09, decay: 0.2 });
      break;
    case 'mg-done': // 다 맞게 쳤다 · 확정 — 위로 두 음
      playNote(d, mtof(84), t, 0.07, { ...PLUCK, gain: 0.2 });
      playNote(d, mtof(91), t + 0.07, 0.12, { ...BELL, gain: 0.14 });
      break;
  }
}

/**
 * ★★★ R067 (D-296 · 찬종 "똑·딱") — 고기 굽기 박자. 옛 메트로놈 틱(R066) · 박자 점을 바꿨다.
 *   strong = 정수 초의 "똑"(낮고 또렷 — 나무 블록 꼴) · weak = 반 초의 "딱"(짧고 작게 · 강세의 40%).
 *   vol = 1 → 0.25 (가린 뒤 0 까지 점점 작게 — 부르는 쪽이 정한다). 0초에는 부르지 않는다(정답 소리 금지). 효과음 음량을 따른다.
 */
export function cakeTick(strong: boolean, vol = 1): void {
  if (!prefs.sfxOn || !ctx || ctx.state !== 'running' || !sfxGain) {
    logSound(strong ? 'cake-tock' : 'cake-tick', false, !prefs.sfxOn ? 'off' : !ctx ? 'no-ctx' : `ctx-${ctx.state}`);
    return;
  }
  logSound(strong ? 'cake-tock' : 'cake-tick', true, `vol ${vol.toFixed(2)}`);
  const t = ctx.currentTime + 0.005;
  const d = sfxGain;
  const v = Math.max(0, Math.min(1, vol));
  if (strong) {
    playNote(d, 520, t, 0.07, { type: 'triangle', gain: 0.34 * v, attack: 0.001, decay: 0.07 });
    playNote(d, 260, t, 0.06, { type: 'sine', gain: 0.24 * v, attack: 0.001, decay: 0.06 });
  } else {
    playNote(d, 1250, t, 0.025, { type: 'triangle', gain: 0.34 * 0.4 * v, attack: 0.001, decay: 0.025 });
  }
}

const BRASS: Voice = { type: 'sawtooth', gain: 0.09, attack: 0.02, decay: 0.3, partials: [[1, 1], [1.004, 0.7]] };

/**
 * ★ 정답 효과음 — 코인 (R034 건우 선택) + ★★ R038 **빵빠레** (건우: "정답이 나오면 빵빠레 효과음").
 *   코인 "띠링" 뒤에 빰-빠-밤! 이 이어진다. 세레머니 8초의 시작 신호다.
 */
function playCorrect(d: AudioNode, t: number): void {
  playNote(d, mtof(83), t, 0.07, { ...SQUARE, gain: 0.14 });
  playNote(d, mtof(88), t + 0.07, 0.3, { ...SQUARE, gain: 0.14, decay: 0.3 });
  const f = t + 0.25;
  playNote(d, mtof(67), f, 0.11, BRASS);
  playNote(d, mtof(67), f + 0.12, 0.11, BRASS);
  for (const m of [72, 76, 79]) playNote(d, mtof(m), f + 0.24, 0.6, { ...BRASS, gain: 0.08, decay: 0.6 });
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★ R038 — 채팅 소리
//   · 'chat'  메시지가 올라왔다 — 짧고 작은 "톡". ★ 오답 소리가 아니다(중립 — D-177). 오답 전용 소리는 여전히 없다(D-149)
//   · 'taunt' 세레머니 8초 동안 **정답자가 친 채팅** — 많이 들으면 킹받는 "메~롱" (솔-미-라-솔-미 놀림 가락 + 떨림)
//   ★★ 도배 대비 — 1초에 20개까지 칠 수 있다(Q-84). 솎아 낸다:
//     · 직전 소리와 60ms 안이면 건너뛴다 · 0.5초 안에 6개를 넘으면 건너뛴다 → 아무리 쳐도 초당 12개 이하
//     · 놀림 소리는 길어서 0.35초에 한 번만
// ─────────────────────────────────────────────────────────────────────────────
let chatTimes: number[] = [];
let emojiTimes: number[] = [];
let lastTaunt = 0;

export function chatSound(kind: 'chat' | 'taunt' | 'emoji'): void {
  if (!prefs.chatOn || !ctx || ctx.state !== 'running' || !chatGain) {
    logSound(`chat:${kind}`, false, !prefs.chatOn ? 'off' : !ctx ? 'no-ctx' : `ctx-${ctx.state}`);
    return;
  }
  logSound(`chat:${kind}`, true);
  const nowMs = performance.now();
  if (kind === 'emoji') {
    // ★ R039 — 이모티콘은 채팅과 다른 "뽀잉" (위로 튀는 소리). 같은 방식으로 솎는다 (채팅 소리 음량에 묶는다 — D-187)
    emojiTimes = emojiTimes.filter((x) => nowMs - x < 500);
    const lastE = emojiTimes[emojiTimes.length - 1] ?? -1e9;
    if (nowMs - lastE < 70 || emojiTimes.length >= 5) return;
    emojiTimes.push(nowMs);
    const t = ctx.currentTime + 0.005;
    playNote(chatGain, mtof(72), t, 0.09, { type: 'triangle', gain: 0.2, attack: 0.004, decay: 0.12 }, mtof(91));
    return;
  }
  if (kind === 'taunt') {
    if (nowMs - lastTaunt < 350) return;
    lastTaunt = nowMs;
    playTaunt(chatGain, ctx.currentTime + 0.01);
    return;
  }
  chatTimes = chatTimes.filter((x) => nowMs - x < 500);
  const last = chatTimes[chatTimes.length - 1] ?? -1e9;
  if (nowMs - last < 60 || chatTimes.length >= 6) return;
  chatTimes.push(nowMs);
  // ★ 음 높이를 살짝 흔들어 연타해도 기계음처럼 똑같이 들리지 않게
  const pitch = 84 + ((chatTimes.length * 2) % 5);
  playNote(chatGain, mtof(pitch), ctx.currentTime + 0.005, 0.04, { type: 'sine', gain: 0.22, attack: 0.003, decay: 0.07 });
}

function playTaunt(d: AudioNode, t: number): void {
  if (!ctx) return;
  // 솔-미-라-솔-미 (놀림 가락) — 비음 섞인 소리 + 떨림
  const notes: [number, number][] = [[79, 0.13], [76, 0.13], [81, 0.11], [79, 0.11], [76, 0.2]];
  let at = t;
  for (const [m, dur] of notes) {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(mtof(m), at);
    lfo.frequency.setValueAtTime(14, at);
    lfoGain.gain.setValueAtTime(mtof(m) * 0.03, at);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.07, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(d);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + dur + 0.03);
    lfo.stop(at + dur + 0.03);
    at += dur * 0.92;
  }
}

/** 설정 창의 "들어 보기" */
export function previewCorrect(): void {
  sfx('correct');
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ 배경음악 — 짧은 악보를 반복한다 (앞질러 예약하는 방식)
// ─────────────────────────────────────────────────────────────────────────────

interface Track {
  bpm: number;
  /** 16분음표 칸마다 [멜로디, 베이스]. null 은 쉼 */
  steps: [number | null, number | null][];
  lead: Voice;
  bass: Voice;
}

/** "C5 . E5 . G5 ..." 같은 짧은 표기를 칸 배열로 */
function parse(lead: string, bass: string): [number | null, number | null][] {
  const toMidi = (s: string): number | null => {
    if (s === '.' || s === '') return null;
    const m = /^([A-G])(#?)(\d)$/.exec(s);
    if (!m) return null;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
    return 12 * (Number(m[3]) + 1) + base + (m[2] ? 1 : 0);
  };
  const a = lead.trim().split(/\s+/);
  const b = bass.trim().split(/\s+/);
  const n = Math.max(a.length, b.length);
  const out: [number | null, number | null][] = [];
  for (let i = 0; i < n; i += 1) out.push([toMidi(a[i] ?? '.'), toMidi(b[i] ?? '.')]);
  return out;
}

const TRACKS: Record<BgmId, Track> = {
  // ★ 통통 경쾌 — 장조 오음계, 통통 튀는 삼각파
  bounce: {
    bpm: 112,
    lead: { ...PLUCK, gain: 0.16 },
    bass: { type: 'triangle', gain: 0.2, attack: 0.005, decay: 0.18 },
    steps: parse(
      'C5 . E5 . G5 . E5 . A5 . G5 . E5 . D5 . ' +
        'C5 . D5 . E5 . G5 . E5 . D5 . C5 . . . ' +
        'A4 . C5 . D5 . C5 . E5 . D5 . C5 . A4 . ' +
        'G4 . A4 . C5 . D5 . E5 . D5 . C5 . . .',
      'C3 . . . G2 . . . C3 . . . G2 . . . ' +
        'F2 . . . C3 . . . F2 . . . G2 . . . ' +
        'A2 . . . E2 . . . F2 . . . C3 . . . ' +
        'G2 . . . D3 . . . G2 . . . C3 . . .',
    ),
  },
  // ★ 8비트 게임기 — 사각파 멜로디 + 통통 베이스
  chip: {
    bpm: 132,
    lead: { ...SQUARE, gain: 0.07, decay: 0.1 },
    bass: { type: 'square', gain: 0.06, attack: 0.002, decay: 0.08 },
    steps: parse(
      'E5 E5 . E5 . C5 E5 . G5 . . . G4 . . . ' +
        'C5 . . G4 . . E4 . . A4 . B4 . A#4 A4 . ' +
        'G4 E5 . G5 A5 . F5 G5 . E5 . C5 D5 B4 . . ' +
        'C5 . . G4 . . E4 . . A4 . B4 . A#4 A4 .',
      'C3 . C3 . G2 . G2 . C3 . C3 . G2 . G2 . ' +
        'A2 . A2 . E2 . E2 . F2 . F2 . G2 . G2 . ' +
        'C3 . C3 . G2 . G2 . F2 . F2 . G2 . G2 . ' +
        'A2 . A2 . E2 . E2 . F2 . G2 . C3 . . .',
    ),
  },
};

let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let stepIdx = 0;
let playing: string | null = null;

/**
 * ★★★ R050 — 미니게임 BGM (찬종: "미니게임 등장/진행/종료 등 … 브금이나 효과음도 같이 바뀌면 좋을듯. 깜짝 이벤트 발생 이라는 느낌으로.")
 *   빠른 게임쇼 꼴 · 사각파 · 150bpm. 미니게임 동안만(배경음악이 켜져 있을 때) · 'quiet' 은 케이크 판처럼 소리를 들어야 할 때 끈다.
 */
const MINIGAME_TRACK: Track = {
  bpm: 150,
  lead: { ...SQUARE, gain: 0.06, decay: 0.08 },
  bass: { type: 'triangle', gain: 0.2, attack: 0.002, decay: 0.1 },
  steps: parse(
    'G5 . G5 A5 B5 . G5 . E5 . G5 . D5 . . . ' +
      'C5 . E5 G5 C6 . B5 . A5 . G5 . E5 . . . ' +
      'F5 . F5 G5 A5 . F5 . D5 . F5 . C5 . . . ' +
      'D5 . E5 F#5 G5 . A5 . B5 . A5 . G5 . . .',
    'G2 . D3 . G2 . D3 . C3 . G2 . C3 . G2 . ' +
      'C3 . G2 . C3 . G2 . A2 . E3 . A2 . E3 . ' +
      'F2 . C3 . F2 . C3 . D3 . A2 . D3 . A2 . ' +
      'D3 . A2 . D3 . A2 . G2 . D3 . G2 . . .',
  ),
};
export type MusicMode = 'normal' | 'minigame' | 'quiet';
let musicMode: MusicMode = 'normal';
/** 미니게임이 부른다 — 바뀔 때만 다시 튼다 */
export function setMusicMode(mode: MusicMode): void {
  if (musicMode === mode) return;
  musicMode = mode;
  logSound(`music:${mode}`, true);
  stopBgm();
  if (prefs.bgmOn) startBgm();
}
function trackOf(id: string): Track {
  return id === 'minigame' ? MINIGAME_TRACK : TRACKS[id as BgmId] ?? TRACKS.bounce;
}

function scheduler(): void {
  if (!ctx || !bgmGain || !playing) return;
  const tr = trackOf(playing);
  const stepDur = 60 / tr.bpm / 4;
  // ★ R041 — 탭이 가려져 타이머가 늦게 돌면(브라우저가 1초에 한 번으로 줄인다) 밀린 음을 한꺼번에 울리지 않는다 → 지금으로 건너뛴다
  if (nextTime < ctx.currentTime - 0.1) nextTime = ctx.currentTime + 0.05;
  // ★ 0.25초 앞까지 미리 예약한다 — setInterval 이 늦어도 박자가 흔들리지 않는다
  while (nextTime < ctx.currentTime + 0.25) {
    const [lead, bass] = tr.steps[stepIdx % tr.steps.length]!;
    if (lead !== null) playNote(bgmGain, mtof(lead), nextTime, stepDur * 1.6, tr.lead);
    if (bass !== null) playNote(bgmGain, mtof(bass), nextTime, stepDur * 2.5, tr.bass);
    nextTime += stepDur;
    stepIdx += 1;
  }
}

export function startBgm(): void {
  if (!ctx || ctx.state !== 'running' || !prefs.bgmOn) return;
  if (musicMode === 'quiet') return;
  const want = musicMode === 'minigame' ? 'minigame' : prefs.bgm;
  if (playing === want && timer) return;
  logSound(`bgm:${want}`, true);
  stopBgm();
  playing = want;
  stepIdx = 0;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(scheduler, 60);
  scheduler();
}

export function stopBgm(): void {
  if (timer) clearInterval(timer);
  timer = null;
  playing = null;
}

function restartBgm(): void {
  stopBgm();
  startBgm();
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★ R050 F — 소리 실험실 (/lab/sound) — 후보를 들어 보는 곳. 게임 소리에는 쓰지 않는다
// ─────────────────────────────────────────────────────────────────────────────
export interface LabSynth {
  ctx: AudioContext;
  out: AudioNode;
  /** 지금(조금 뒤) */
  t: number;
  note: (freq: number, start: number, dur: number, v: { type: OscillatorType; gain: number; attack: number; decay: number; partials?: [number, number][] }, glideTo?: number) => void;
  mtof: (m: number) => number;
  V: { BELL: Voice; PLUCK: Voice; SQUARE: Voice; SOFT: Voice; BRASS: Voice };
}
/** 후보 하나를 낸다 (효과음 음량을 따른다 · 꺼져 있어도 들려준다 — 고르는 곳이라) */
export function labPlay(fn: (s: LabSynth) => void): boolean {
  const c = ensureCtx();
  if (!c || !sfxGain) return false;
  if (c.state !== 'running') void c.resume();
  const lab = c.createGain();
  lab.gain.value = Math.max(0.15, prefs.sfxVol);
  lab.connect(c.destination);
  fn({ ctx: c, out: lab, t: c.currentTime + 0.03, note: (f, s, d, v, g) => playNote(lab, f, s, d, v, g), mtof, V: { BELL, PLUCK, SQUARE, SOFT, BRASS } });
  return true;
}
/** 기존 효과음을 그대로 (꺼져 있어도) */
export function labSfx(id: SfxId): void {
  const c = ensureCtx();
  if (c && c.state !== 'running') void c.resume();
  const was = prefs.sfxOn;
  prefs.sfxOn = true;
  sfx(id);
  prefs.sfxOn = was;
}
/** 효과음 음량 (파일 후보의 볼륨) */
export function labVolume(): number {
  return Math.max(0.15, prefs.sfxVol);
}

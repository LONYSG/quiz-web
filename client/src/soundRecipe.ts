// =============================================================================
// ★★★ R112 — 소리 만드는 법(표) — 유튜브 "오늘의 상식" 영상과 **같은 값**
//
// 정본 = 영상 저장소 `quiz-video/brand/sound-recipe.js`(VOICES · SFX · ROLES · BGM) · `brand/bgm.json`(suite · use).
//   찬종 2026-11-17: "웹 사이트랑 컨셉을 통일 · 배경음 · 효과음도 같거나 비슷하게 · 유튜브에서 듣던 타이머 소리를 게임에서 직접 들으면 재미있을 것"
//   찬종 2026-11-24: "영상 형식은 거의 확정이니까 영상에서 사용한 톤과 효과음 등으로 퀴즈도장 web 에 적용시켜"
// 숫자는 영상 표에서 **그대로** 옮겼다(귀로 다듬지 않았다). 영상 표가 바뀌면 이 파일을 같이 고친다 —
//   `client/src/soundRecipe.test.ts` 가 영상 저장소가 있는 PC 에서 두 표를 견준다(없으면 건너뛴다).
// 이 파일은 window · AudioContext 를 쓰지 않는다(테스트가 node 에서 읽는다). 소리를 내는 곳은 sound.ts.
// =============================================================================

export interface Voice {
  type: OscillatorType;
  /** 가장 큰 음량 */
  gain: number;
  /** 초 */
  attack: number;
  /** 초 */
  decay: number;
  /** 배음 [주파수 배수, 음량 배수] — 없으면 [[1, 1]] */
  partials?: [number, number][];
}

export type VoiceName = 'BELL' | 'PLUCK' | 'SQUARE' | 'SOFT' | 'BRASS';

export const VOICES: Record<VoiceName, Voice> = {
  BELL: { type: 'sine', gain: 0.35, attack: 0.005, decay: 0.6, partials: [[1, 1], [2, 0.35], [3.01, 0.12]] },
  PLUCK: { type: 'triangle', gain: 0.28, attack: 0.004, decay: 0.22 },
  SQUARE: { type: 'square', gain: 0.12, attack: 0.003, decay: 0.12 },
  SOFT: { type: 'sine', gain: 0.28, attack: 0.01, decay: 0.25 },
  BRASS: { type: 'sawtooth', gain: 0.09, attack: 0.02, decay: 0.3, partials: [[1, 1], [1.004, 0.7]] },
};

/** 음 하나 = [미디 번호, 시작(초), 길이(초), 음색 이름, 음색에서 바꿀 값, 미끄러져 갈 미디 번호] — 영상 표와 같은 꼴 */
export type RecipeNote = [number, number, number, VoiceName, Partial<Voice>?, number?];

/** 영상 SFX 표 중 웹이 쓰는 것만(이름도 영상 표 그대로) */
export const SFX_NOTES = {
  // 문제 등장 — 통통 세 음
  questionPluck: [
    [72, 0, 0.08, 'PLUCK', { gain: 0.2 }],
    [76, 0.07, 0.08, 'PLUCK', { gain: 0.2 }],
    [79, 0.14, 0.14, 'PLUCK', { gain: 0.2 }],
  ],
  // 힌트 — 낮은 종 한 번
  hintLow: [[84, 0, 0.5, 'BELL', { gain: 0.15, decay: 0.5 }]],
  // 5초 타이머의 한 번 — 작은 삑
  urgent: [[93, 0, 0.03, 'SQUARE', { gain: 0.1, decay: 0.05 }]],
  // 여는 장면 — "시작!" 통통 네 음
  go: [72, 76, 79, 84].map((m, i) => [m, i * 0.06, 0.18, 'PLUCK', {}] as RecipeNote),
  // 정답 — 종 네 음 올라감
  correctBell: [
    [72, 0, 0.12, 'BELL', { gain: 0.14 }],
    [76, 0.08, 0.12, 'BELL', { gain: 0.14 }],
    [79, 0.16, 0.12, 'BELL', { gain: 0.14 }],
    [84, 0.24, 0.5, 'BELL', { gain: 0.16, decay: 0.5 }],
  ],
  // 다음 문제로 — 작은 종
  nextBell: [[88, 0, 0.2, 'BELL', { gain: 0.08 }]],
  // 작은 "똑" — 영상에서는 "다음 문제" 예고 3초(ROLES.nextCount)
  preHint: [[81, 0, 0.06, 'SOFT', { gain: 0.09, decay: 0.1 }]],
  // 닫는 장면 — 위로 올라가는 종 일곱 음
  result: [60, 64, 67, 72, 76, 79, 84].map((m, i) => [m, i * 0.08, 0.3, 'BELL', { gain: 0.2 }] as RecipeNote),
} satisfies Record<string, RecipeNote[]>;

export type RecipeSfxName = keyof typeof SFX_NOTES;

/**
 * 영상 ROLES 표 중 웹에 같은 자리가 있는 것 — 웹의 자리 → 영상 SFX 이름.
 *   · next(nextBell) 는 웹에서 울리지 않는다: 웹은 다음 문제가 뜨는 순간 문제 소리(questionPluck)가 나서 겹친다(찬종 11-18 "효과음이 겹친다").
 *     "N초 후 다음 문제" 자리에서 nextCount 똑-똑-똑을 낸다.
 *   · preHint = null(찬종 2026-11-19 "힌트 공개 때 똑-똑 하는 효과음 없애고") — 웹에도 힌트 예고 소리는 없다.
 *   · pageTurn · difficulty · stamp — 웹에 같은 순간이 없다(R112 보고 제안).
 */
export const ROLE_SFX = {
  open: 'go',
  question: 'questionPluck',
  hint: 'hintLow',
  timer: 'urgent',
  correct: 'correctBell',
  next: 'nextBell',
  nextCount: 'preHint',
  close: 'result',
} as const satisfies Record<string, RecipeSfxName>;

// ── 배경음 ── 영상 BGM 표의 곡 중 찬종이 고른 다섯 곡(bgm.json suite). 기본곡 = bgm.json use = bell-up.
export type BgmId = 'bounce' | 'bell-up' | 'gym' | 'sparkle' | 'hop';

export interface BgmSong {
  bpm: number;
  lead: Voice;
  bass: Voice;
  /** 16분음표 칸마다 음 이름 · '.' 쉼 · '|' 마디 금(읽을 때 버린다) */
  leadNotes: string;
  bassNotes: string;
}

const TRI = (gain: number, decay: number): Voice => ({ type: 'triangle', gain, attack: 0.005, decay });

export const BGM_SONGS: Record<BgmId, BgmSong> = {
  bounce: {
    bpm: 112, lead: { ...VOICES.PLUCK, gain: 0.16 }, bass: TRI(0.2, 0.18),
    leadNotes: 'C5 . E5 . G5 . E5 . A5 . G5 . E5 . D5 . | C5 . D5 . E5 . G5 . E5 . D5 . C5 . . . | A4 . C5 . D5 . C5 . E5 . D5 . C5 . A4 . | G4 . A4 . C5 . D5 . E5 . D5 . C5 . . .',
    bassNotes: 'C3 . . . G2 . . . C3 . . . G2 . . . | F2 . . . C3 . . . F2 . . . G2 . . . | A2 . . . E2 . . . F2 . . . C3 . . . | G2 . . . D3 . . . G2 . . . C3 . . .',
  },
  'bell-up': {
    bpm: 120, lead: { ...VOICES.BELL, gain: 0.1, decay: 0.3 }, bass: TRI(0.15, 0.16),
    leadNotes: 'B4 . . . D5 . . . G5 . . . . . D5 . | E5 . . . D5 . . . B4 . . . . . . . | C5 . . . E5 . . . A5 . . . . . G5 . | F#5 . . . D5 . . . G5 . . . . . . .',
    bassNotes: 'G2 . D3 . G3 . D3 . G2 . D3 . G3 . D3 . | E2 . B2 . E3 . B2 . G2 . D3 . G3 . D3 . | C3 . G3 . C4 . G3 . A2 . E3 . A3 . E3 . | D3 . A3 . D4 . A3 . G2 . D3 . G3 . . .',
  },
  gym: {
    bpm: 116, lead: { ...VOICES.BELL, gain: 0.1, decay: 0.3 }, bass: TRI(0.17, 0.18),
    leadNotes: 'E5 . G5 . C6 . G5 . A5 . G5 . E5 . . . | D5 . E5 . G5 . E5 . D5 . C5 . . . . . | F5 . A5 . C6 . A5 . G5 . E5 . G5 . . . | D5 . E5 . D5 . C5 . C5 . . . . . . .',
    bassNotes: 'C3 . . . G3 . . . C3 . . . G3 . . . | G2 . . . D3 . . . G2 . . . D3 . . . | F2 . . . C3 . . . C3 . . . G3 . . . | G2 . . . G2 . . . C3 . . . C3 . . .',
  },
  sparkle: {
    bpm: 112, lead: { ...VOICES.BELL, gain: 0.1, decay: 0.35 }, bass: TRI(0.17, 0.2),
    leadNotes: 'F#5 . . A5 . . D6 . . . A5 . F#5 . . . | E5 . . G5 . . B5 . . . A5 . . . . . | G5 . . B5 . . D6 . . . B5 . G5 . . . | A5 . . F#5 . . E5 . D5 . . . . . . .',
    bassNotes: 'D3 . . . A2 . . . D3 . . . A2 . . . | E3 . . . B2 . . . A2 . . . E3 . . . | G2 . . . D3 . . . G2 . . . D3 . . . | A2 . . . A2 . . . D3 . . . . . . .',
  },
  hop: {
    bpm: 118, lead: { ...VOICES.BELL, gain: 0.1, decay: 0.3 }, bass: TRI(0.15, 0.14),
    leadNotes: 'A5 . . . E5 . A5 . C#6 . . . A5 . . . | B5 . . . G#5 . E5 . . . . . . . . . | F#5 . . . A5 . D6 . C#6 . . . A5 . . . | B5 . . . G#5 . . . A5 . . . . . . .',
    bassNotes: 'A2 . E3 . A2 . E3 . A2 . E3 . A2 . E3 . | E2 . B2 . E2 . B2 . E2 . B2 . E2 . B2 . | D3 . A3 . D3 . A3 . A2 . E3 . A2 . E3 . | E2 . B2 . E2 . B2 . A2 . E3 . A2 . . .',
  },
};

/** 설정 화면의 곡 고르기 — 순서 = 영상 bgm.json suite · 이름 = 영상 주석의 우리말 이름 */
export const BGMS: readonly { id: BgmId; label: string }[] = [
  { id: 'bounce', label: '통통 경쾌' },
  { id: 'bell-up', label: '포근한 종 · 빠르게' },
  { id: 'gym', label: '아침 체조' },
  { id: 'sparkle', label: '반짝 산책' },
  { id: 'hop', label: '깡총' },
];

export const DEFAULT_BGM: BgmId = 'bell-up';

/** 음 이름 → 미디 번호. '.' · '' · '|' 는 null */
export function noteToMidi(s: string): number | null {
  const m = /^([A-G])(#?)(\d)$/.exec(s);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  return 12 * (Number(m[3]) + 1) + base + (m[2] ? 1 : 0);
}

/** "C5 . E5 | G5 ..." → 칸 배열 [가락, 베이스] — '|' 는 칸이 아니다(버린다) */
export function parseSteps(lead: string, bass: string): [number | null, number | null][] {
  const split = (s: string) => s.trim().split(/\s+/).filter((x) => x && x !== '|');
  const a = split(lead);
  const b = split(bass);
  const n = Math.max(a.length, b.length);
  const out: [number | null, number | null][] = [];
  for (let i = 0; i < n; i += 1) out.push([noteToMidi(a[i] ?? '.'), noteToMidi(b[i] ?? '.')]);
  return out;
}

/**
 * ★ 곡 고르기 판 번호 — R104 = 2(bell · bounce) · R112 = 3(위 다섯 곡).
 *   이 번호와 함께 저장된 곡만 지킨다(브라우저 · 계정 둘 다 — prefsSync).
 */
export const BGM_PICK_VER = 3;

/**
 * 저장된 곡(+ 판 번호) → 지금 틀 곡.
 *   · 판 3 + 지금 목록의 곡 → 그대로
 *   · 판 2(R104 뒤에 고른 것)의 bounce → 그대로(다섯 곡에 남았다 — 사람이 일부러 고른 것)
 *   · 그 밖(판 2 의 bell · 판 번호 없는 옛 bounce · 지운 chip 등) → 기본곡 bell-up
 */
export function migrateBgmPick(bgm: unknown, ver: unknown): BgmId {
  if (ver === BGM_PICK_VER && BGMS.some((b) => b.id === bgm)) return bgm as BgmId;
  if (ver === 2 && bgm === 'bounce') return 'bounce';
  return DEFAULT_BGM;
}

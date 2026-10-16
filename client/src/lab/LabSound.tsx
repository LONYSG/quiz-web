// =============================================================================
// ★★ /lab/sound — 소리 들어 보기 (R050 F · 로그인한 사람만)
//
// ★ 찬종: "직접 생성도 하고 무료 저작권 소스도 샘플을 가져와봐. 채택은 내가 직접 들어보고 할게.
//   하는김에 기존 배경음이나 효과음도 기존보다 좋으면 바꾸거나 추가할 수도."
// ★ 두 갈래를 나란히 — (가) 직접 만든 소리(Web Audio · 지금 게임에 붙어 있는 것 = "지금") · (나) 무료 소스(CC0 — Kenney · 출처 · 라이선스는
//   assets/sounds/LICENSES.md). 고르면 R051 에서 반영한다. 이 화면은 게임 소리를 바꾸지 않는다.
// ★ 효과음 음량을 따른다(꺼져 있어도 여기서는 들린다).
// =============================================================================

import { useState } from 'react';
import { labPlay, labSfx, labVolume, type LabSynth, type SfxId } from '../sound.js';

type Gen = (s: LabSynth) => void;

interface Cand {
  id: string;
  label: string;
  /** 쓰일 자리 */
  slot: string;
  kind: '지금' | '만든 후보' | 'CC0';
  play: () => void;
  src?: string;
  note?: string;
}

const g = (fn: Gen) => () => void labPlay(fn);
const file = (name: string) => () => {
  const a = new Audio(`/sounds/kenney/${name}`);
  a.volume = labVolume();
  void a.play();
};

// ── (가) 직접 만든 후보 ────────────────────────────────────────────────────
const jingleB: Gen = ({ t, note, mtof, V }) => {
  // 게임쇼 "따라라란!" — 빠른 위로 아르페지오 + 마지막 화음
  [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => note(mtof(m), t + i * 0.055, 0.12, { ...V.PLUCK, gain: 0.22 }));
  for (const m of [72, 76, 79, 84]) note(mtof(m), t + 0.42, 0.9, { ...V.BRASS, gain: 0.07, decay: 0.9 });
  note(mtof(96), t + 0.42, 0.5, { ...V.BELL, gain: 0.12 });
};
const jingleC: Gen = ({ t, note, mtof, V }) => {
  // 북 굴림이 커지다가 "징!" — 깜짝 등장
  for (let i = 0; i < 16; i += 1) note(mtof(45 + (i % 2)), t + i * 0.035, 0.04, { type: 'triangle', gain: 0.06 + i * 0.012, attack: 0.002, decay: 0.05 });
  note(mtof(48), t + 0.6, 1.2, { type: 'sine', gain: 0.3, attack: 0.002, decay: 1.2, partials: [[1, 1], [2.76, 0.4], [5.4, 0.2]] });
  [79, 84, 88].forEach((m, i) => note(mtof(m), t + 0.62 + i * 0.07, 0.4, { ...V.BELL, gain: 0.12 }));
};
const roundB: Gen = ({ t, note, mtof, V }) => {
  note(mtof(72), t, 0.1, { ...V.SQUARE, gain: 0.09 });
  note(mtof(79), t + 0.1, 0.25, { ...V.SQUARE, gain: 0.09, decay: 0.25 });
};
const finalB: Gen = ({ t, note, mtof, V }) => {
  // 긴 빵빠레 — 빰 빰 빰 빠~밤!
  const f = (m: number, s: number, d: number) => note(mtof(m), t + s, d, { ...V.BRASS, gain: 0.09, decay: d });
  f(67, 0, 0.12);
  f(67, 0.15, 0.12);
  f(67, 0.3, 0.12);
  f(72, 0.45, 0.5);
  for (const m of [72, 76, 79, 84]) f(m, 0.95, 1.1);
};
const returnB: Gen = ({ t, note, mtof, V }) => {
  [84, 79, 76, 72].forEach((m, i) => note(mtof(m), t + i * 0.07, 0.12, { ...V.PLUCK, gain: 0.18 }));
  note(mtof(67), t + 0.32, 0.3, { ...V.SOFT, gain: 0.2 });
};
/** 케이크 리듬 후보 — 4박(1초 간격으로 들으면 너무 기니 0.5초로 줄여 들려준다) */
const cakeRhythm = (style: 'A' | 'B' | 'C'): Gen => ({ t, note, mtof, V }) => {
  for (let k = 0; k < 8; k += 1) {
    const at = t + k * 0.5;
    const pos = (8 - k) % 4; // 8,7,6,5,4,3,2,1 → 강세는 8 · 4
    if (style === 'A') {
      const notes = [84, 79, 81, 83];
      note(mtof(notes[pos]!), at, pos === 0 ? 0.18 : 0.09, pos === 0 ? { ...V.BELL, gain: 0.24 } : { ...V.PLUCK, gain: 0.17 });
      note(mtof(104), at + 0.25, 0.02, { ...V.SQUARE, gain: 0.02, decay: 0.025 });
    } else if (style === 'B') {
      // 우드블록(클라베) — 높은 똑 · 낮은 똑
      note(mtof(pos === 0 ? 88 : 81), at, 0.04, { type: 'sine', gain: pos === 0 ? 0.35 : 0.22, attack: 0.001, decay: 0.06 });
      if (k % 2 === 0) note(mtof(76), at + 0.25, 0.03, { type: 'sine', gain: 0.12, attack: 0.001, decay: 0.05 });
    } else {
      // 마림바 — 박마다 한 음씩 올라가고 강세에서 화음
      const scale = [72, 74, 76, 79];
      note(mtof(scale[3 - pos] ?? 72), at, 0.2, { type: 'sine', gain: 0.22, attack: 0.002, decay: 0.25, partials: [[1, 1], [4, 0.2]] });
      if (pos === 0) note(mtof(60), at, 0.3, { type: 'triangle', gain: 0.18, attack: 0.002, decay: 0.3 });
    }
  }
};
/** 미니게임 BGM 후보 — 8초 들려준다 */
const bgmLoop = (bpm: number, lead: number[], bass: number[], voice: 'square' | 'pluck'): Gen => ({ t, note, mtof, V }) => {
  const step = 60 / bpm / 4;
  for (let i = 0; i * step < 8; i += 1) {
    const l = lead[i % lead.length]!;
    const b = bass[i % bass.length]!;
    if (l > 0) note(mtof(l), t + i * step, step * 1.6, voice === 'square' ? { ...V.SQUARE, gain: 0.06, decay: 0.08 } : { ...V.PLUCK, gain: 0.14 });
    if (b > 0) note(mtof(b), t + i * step, step * 2.4, { type: 'triangle', gain: 0.18, attack: 0.002, decay: 0.1 });
  }
};
const BGM_A = bgmLoop(150, [79, 0, 79, 81, 83, 0, 79, 0, 76, 0, 79, 0, 74, 0, 0, 0, 72, 0, 76, 79, 84, 0, 83, 0, 81, 0, 79, 0, 76, 0, 0, 0], [43, 0, 50, 0, 43, 0, 50, 0, 48, 0, 43, 0, 48, 0, 43, 0], 'square');
const BGM_B = bgmLoop(164, [76, 0, 79, 0, 81, 79, 76, 0, 74, 0, 76, 0, 72, 0, 0, 0, 77, 0, 81, 0, 84, 81, 77, 0, 76, 0, 74, 0, 72, 0, 0, 0], [48, 0, 0, 55, 48, 0, 0, 55, 53, 0, 0, 60, 53, 0, 0, 60], 'pluck');
const BGM_C = bgmLoop(132, [72, 0, 0, 74, 76, 0, 79, 0, 0, 76, 74, 0, 72, 0, 0, 0], [36, 0, 43, 0, 36, 0, 43, 0, 41, 0, 48, 0, 43, 0, 50, 0], 'pluck');

const NOW = (id: SfxId) => () => labSfx(id);

const CANDS: Cand[] = [
  // 깜짝 이벤트 징글
  { id: 'jingle-now', slot: '미니게임 등장 징글', label: '북 굴림 + 팡파레', kind: '지금', play: NOW('mg-jingle') },
  { id: 'jingle-b', slot: '미니게임 등장 징글', label: '게임쇼 아르페지오', kind: '만든 후보', play: g(jingleB) },
  { id: 'jingle-c', slot: '미니게임 등장 징글', label: '북 굴림 → 징', kind: '만든 후보', play: g(jingleC) },
  { id: 'k-nes00', slot: '미니게임 등장 징글', label: 'NES 징글 00', kind: 'CC0', src: 'jingles_NES00.ogg', play: file('jingles_NES00.ogg') },
  { id: 'k-nes03', slot: '미니게임 등장 징글', label: 'NES 징글 03', kind: 'CC0', src: 'jingles_NES03.ogg', play: file('jingles_NES03.ogg') },
  { id: 'k-steel01', slot: '미니게임 등장 징글', label: '스틸드럼 징글 01', kind: 'CC0', src: 'jingles_STEEL01.ogg', play: file('jingles_STEEL01.ogg') },
  { id: 'k-sax03', slot: '미니게임 등장 징글', label: '색소폰 징글 03', kind: 'CC0', src: 'jingles_SAX03.ogg', play: file('jingles_SAX03.ogg') },
  // 미니게임 BGM
  { id: 'bgm-now', slot: '미니게임 BGM (8초)', label: '게임쇼 사각파 150bpm', kind: '지금', play: g(BGM_A), note: '게임 안의 것과 같은 곡의 앞부분' },
  { id: 'bgm-b', slot: '미니게임 BGM (8초)', label: '통통 플럭 164bpm', kind: '만든 후보', play: g(BGM_B) },
  { id: 'bgm-c', slot: '미니게임 BGM (8초)', label: '느긋한 플럭 132bpm', kind: '만든 후보', play: g(BGM_C) },
  // 케이크 리듬
  { id: 'cake-a', slot: '케이크 리듬 (4박 × 2 · 빠르게)', label: '솔-라-시-도↑ + 칫', kind: '지금', play: g(cakeRhythm('A')) },
  { id: 'cake-b', slot: '케이크 리듬 (4박 × 2 · 빠르게)', label: '우드블록(클라베)', kind: '만든 후보', play: g(cakeRhythm('B')) },
  { id: 'cake-c', slot: '케이크 리듬 (4박 × 2 · 빠르게)', label: '마림바 오르막', kind: '만든 후보', play: g(cakeRhythm('C')) },
  // 판 시작 · 판 결과
  { id: 'ready-now', slot: '판 준비 · 시작', label: '똑 똑 → 띵!', kind: '지금', play: () => { labSfx('mg-ready'); setTimeout(() => labSfx('mg-go'), 600); } },
  { id: 'k-conf1', slot: '판 준비 · 시작', label: '확인음 001', kind: 'CC0', src: 'confirmation_001.ogg', play: file('confirmation_001.ogg') },
  { id: 'k-max3', slot: '판 준비 · 시작', label: '열림 003', kind: 'CC0', src: 'maximize_003.ogg', play: file('maximize_003.ogg') },
  { id: 'round-now', slot: '판 결과', label: '세 음 똑', kind: '지금', play: NOW('mg-round') },
  { id: 'round-b', slot: '판 결과', label: '8비트 두 음', kind: '만든 후보', play: g(roundB) },
  { id: 'k-conf4', slot: '판 결과', label: '확인음 004', kind: 'CC0', src: 'confirmation_004.ogg', play: file('confirmation_004.ogg') },
  { id: 'k-three1', slot: '판 결과', label: '세 음 1', kind: 'CC0', src: 'threeTone1.ogg', play: file('threeTone1.ogg') },
  // 최종 · 복귀
  { id: 'final-now', slot: '최종 결과', label: '코인 + 빵빠레', kind: '지금', play: NOW('mg-final') },
  { id: 'final-b', slot: '최종 결과', label: '긴 빵빠레', kind: '만든 후보', play: g(finalB) },
  { id: 'k-nes08', slot: '최종 결과', label: 'NES 징글 08', kind: 'CC0', src: 'jingles_NES08.ogg', play: file('jingles_NES08.ogg') },
  { id: 'k-pizzi02', slot: '최종 결과', label: '피치카토 징글 02', kind: 'CC0', src: 'jingles_PIZZI02.ogg', play: file('jingles_PIZZI02.ogg') },
  { id: 'k-up7', slot: '최종 결과', label: '파워업 7', kind: 'CC0', src: 'powerUp7.ogg', play: file('powerUp7.ogg') },
  { id: 'return-now', slot: '퀴즈로 돌아가기', label: '내려오는 쓸기', kind: '지금', play: NOW('mg-return') },
  { id: 'return-b', slot: '퀴즈로 돌아가기', label: '내려오는 플럭', kind: '만든 후보', play: g(returnB) },
  { id: 'k-min3', slot: '퀴즈로 돌아가기', label: '닫힘 003', kind: 'CC0', src: 'minimize_003.ogg', play: file('minimize_003.ogg') },
  { id: 'k-hit05', slot: '퀴즈로 돌아가기', label: '짧은 징글 HIT05', kind: 'CC0', src: 'jingles_HIT05.ogg', play: file('jingles_HIT05.ogg') },
  // 누르기 · 옮기기 · 자르기
  { id: 'tap-now', slot: '누르기 · 옮기기 · 자르기', label: '누름(톡)', kind: '지금', play: NOW('mg-tap') },
  { id: 'cut-now', slot: '누르기 · 옮기기 · 자르기', label: '자르기(쉬익 + 똑)', kind: '지금', play: NOW('mg-cut') },
  { id: 'k-click2', slot: '누르기 · 옮기기 · 자르기', label: '클릭 002', kind: 'CC0', src: 'click_002.ogg', play: file('click_002.ogg') },
  { id: 'k-pluck1', slot: '누르기 · 옮기기 · 자르기', label: '플럭 001', kind: 'CC0', src: 'pluck_001.ogg', play: file('pluck_001.ogg') },
  { id: 'k-drop2', slot: '누르기 · 옮기기 · 자르기', label: '떨어짐 002', kind: 'CC0', src: 'drop_002.ogg', play: file('drop_002.ogg') },
  { id: 'k-phase1', slot: '누르기 · 옮기기 · 자르기', label: '페이즈 점프 1', kind: 'CC0', src: 'phaseJump1.ogg', play: file('phaseJump1.ogg') },
  // 기존 효과음 — 바꿀 후보와 비교
  { id: 'correct-now', slot: '기존 — 정답', label: '코인 + 빵빠레', kind: '지금', play: NOW('correct') },
  { id: 'k-hit00', slot: '기존 — 정답', label: '짧은 징글 HIT00', kind: 'CC0', src: 'jingles_HIT00.ogg', play: file('jingles_HIT00.ogg') },
  { id: 'k-up2', slot: '기존 — 정답', label: '파워업 2', kind: 'CC0', src: 'powerUp2.ogg', play: file('powerUp2.ogg') },
  { id: 'result-now', slot: '기존 — 게임 결과', label: '종소리 오르막', kind: '지금', play: NOW('result') },
  { id: 'k-zapup', slot: '기존 — 게임 결과', label: '세 음 오르막(전자)', kind: 'CC0', src: 'zapThreeToneUp.ogg', play: file('zapThreeToneUp.ogg') },
  { id: 'hint-now', slot: '기존 — 힌트', label: '반짝', kind: '지금', play: NOW('hint') },
  { id: 'k-pep1', slot: '기존 — 힌트', label: '펩 사운드 1', kind: 'CC0', src: 'pepSound1.ogg', play: file('pepSound1.ogg') },
];

export default function LabSound() {
  const [last, setLast] = useState<string | null>(null);
  const slots = [...new Set(CANDS.map((c) => c.slot))];
  return (
    <div className="lab-page lab-sound">
      <h1>소리 들어 보기</h1>
      <p className="dim">
        「지금」 = 게임에 붙어 있는 소리(직접 만든 것) · 「만든 후보」 = 새로 만든 소리 · 「CC0」 = 무료 소스(Kenney · CC0 1.0 — 출처는 assets/sounds/LICENSES.md). 마음에 드는 것을 알려 주면 다음 라운드에 바꾼다. 효과음 음량을 따른다.
      </p>
      {slots.map((slot) => (
        <section key={slot} className="lab-sound-slot">
          <h2>{slot}</h2>
          <div className="lab-sound-row">
            {CANDS.filter((c) => c.slot === slot).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`lab-sound-btn kind-${c.kind === '지금' ? 'now' : c.kind === 'CC0' ? 'cc0' : 'gen'}${last === c.id ? ' on' : ''}`}
                data-cand={c.id}
                onClick={() => {
                  setLast(c.id);
                  c.play();
                }}
                title={c.note ?? c.src ?? ''}
              >
                <span className="lab-sound-kind">{c.kind}</span>
                <span className="lab-sound-label">{c.label}</span>
                {c.src && <span className="lab-sound-src mono">{c.src}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 보고서용 — 후보 목록 (이름 · 갈래 · 자리 · 파일) */
export const LAB_SOUND_CANDIDATES = CANDS.map(({ id, label, slot, kind, src }) => ({ id, label, slot, kind, src: src ?? null }));

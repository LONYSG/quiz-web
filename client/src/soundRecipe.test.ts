// ★ R112 — 웹의 소리 표(soundRecipe.ts) = 영상의 소리 표(quiz-video/brand/sound-recipe.js · bgm.json)
//   영상 저장소가 없는 환경(다른 PC · CI)에서는 견주기를 건너뛴다.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BGM_PICK_VER, BGM_SONGS, BGMS, DEFAULT_BGM, ROLE_SFX, SFX_NOTES, VOICES, migrateBgmPick, parseSteps } from './soundRecipe.js';

const VIDEO = process.env.QUIZ_VIDEO_DIR ?? 'C:/work/quiz-video';
const RECIPE = `${VIDEO}/brand/sound-recipe.js`;
const BGM_JSON = `${VIDEO}/brand/bgm.json`;
const hasVideo = fs.existsSync(RECIPE) && fs.existsSync(BGM_JSON);

describe.skipIf(!hasVideo)('R112 웹 소리 = 영상 표', async () => {
  const v = hasVideo ? await import(pathToFileURL(RECIPE).href) : null;
  const bgm = hasVideo ? JSON.parse(fs.readFileSync(BGM_JSON, 'utf8')) : null;

  it('음색 다섯 = 영상 VOICES', () => {
    expect(VOICES).toEqual(v.VOICES);
  });
  it('ROLES 자리마다 웹의 이름 = 영상의 이름 · 음표 = 영상 표의 음표', () => {
    const video = v.ROLES as Record<string, string | string[] | null>;
    for (const [role, name] of Object.entries(ROLE_SFX)) {
      const vn = video[role];
      const vName = Array.isArray(vn) ? vn[0] : vn;
      if (Array.isArray(vn)) expect(new Set(vn).size, `${role} 는 한 소리를 되풀이`).toBe(1);
      expect(name, role).toBe(vName);
      expect(SFX_NOTES[name], name).toEqual(v.SFX[name]);
    }
    expect(video.timerGain, '영상 타이머 gain 덮어쓰기 없음').toBeNull();
    expect(video.preHint, '힌트 예고 소리 없음').toBeNull();
  });
  it('배경음 = 영상 suite 다섯 곡(순서 그대로) · 기본 = bgm.json use · 곡 값 = 영상 BGM', () => {
    expect(BGMS.map((b) => b.id)).toEqual(bgm.suite);
    expect(DEFAULT_BGM).toBe(bgm.use);
    for (const id of bgm.suite as (keyof typeof BGM_SONGS)[]) expect(BGM_SONGS[id], id).toEqual(v.BGM[id]);
  });
});

describe('R112 곡 옮기기 · 읽기', () => {
  it('옛 bell(판 2) → bell-up · 판 2 의 bounce 는 지킨다 · 판 번호 없는 bounce → bell-up', () => {
    expect(BGM_PICK_VER).toBe(3);
    expect(migrateBgmPick('bell', 2)).toBe('bell-up');
    expect(migrateBgmPick('bounce', 2)).toBe('bounce');
    expect(migrateBgmPick('bounce', undefined)).toBe('bell-up');
    expect(migrateBgmPick('chip', undefined)).toBe('bell-up');
    expect(migrateBgmPick('gym', 3)).toBe('gym');
    expect(migrateBgmPick('bell', 3)).toBe('bell-up');
  });
  it("악보의 '|' 는 칸이 아니다 — 곡마다 64칸", () => {
    for (const s of Object.values(BGM_SONGS)) expect(parseSteps(s.leadNotes, s.bassNotes)).toHaveLength(64);
  });
});

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { buildAllowedWithLive, codeFromArg, needsCi, parseCodeChoice, playDir, samePath, tagName } from './play-tree.mjs';

describe('플레이 트리 (R078 · D-332)', () => {
  it('태그 이름 play/YYYYMMDD-HHmm · 겹치면 -2', () => {
    const d = new Date(2026, 10, 8, 14, 5);
    expect(tagName(d)).toBe('play/20261108-1405');
    expect(tagName(d, ['play/20261108-1405'])).toBe('play/20261108-1405-2');
    expect(tagName(d, ['play/20261108-1405', 'play/20261108-1405-2'])).toBe('play/20261108-1405-3');
  });

  it('메뉴 1 질문 분기', () => {
    expect(parseCodeChoice('')).toEqual({ kind: 'latest' });
    expect(parseCodeChoice('1')).toEqual({ kind: 'latest' });
    expect(parseCodeChoice(' 2 ')).toEqual({ kind: 'keep' });
    expect(parseCodeChoice('3')).toEqual({ kind: 'ref', ref: '' });
    expect(parseCodeChoice('play/20261108-1405')).toEqual({ kind: 'ref', ref: 'play/20261108-1405' });
    expect(parseCodeChoice('c6fcfaf6')).toEqual({ kind: 'ref', ref: 'c6fcfaf6' });
    expect(parseCodeChoice('a b')).toBeNull();
    expect(codeFromArg(undefined)).toEqual({ kind: 'latest' });
    expect(codeFromArg('keep')).toEqual({ kind: 'keep' });
    expect(codeFromArg('play/x')).toEqual({ kind: 'ref', ref: 'play/x' });
  });

  it('npm ci 조건 — node_modules 없음 · 해시 모름 · 해시 바뀜', () => {
    expect(needsCi({ hasNodeModules: false, prevLockHash: 'a', lockHash: 'a' })).toBe(true);
    expect(needsCi({ hasNodeModules: true, prevLockHash: '', lockHash: 'a' })).toBe(true);
    expect(needsCi({ hasNodeModules: true, prevLockHash: 'a', lockHash: 'b' })).toBe(true);
    expect(needsCi({ hasNodeModules: true, prevLockHash: 'a', lockHash: 'a' })).toBe(false);
  });

  it('경로 비교 · QUIZ_PLAY_DIR', () => {
    expect(samePath('C:\\work\\quiz-web', 'c:/work/quiz-web/')).toBe(true);
    expect(samePath('C:\\work\\quiz-web', 'C:\\work\\quiz-web-play')).toBe(false);
    expect(playDir({ QUIZ_PLAY_DIR: 'D:\\x\\play' })).toBe(path.resolve('D:\\x\\play'));
    expect(path.basename(playDir({}))).toBe('quiz-web-play');
  });

  it('빌드 빗장 — 3000 이 이 트리 밖(플레이 트리)에서 떴을 때만 허용', () => {
    const root = 'C:\\work\\quiz-web';
    const play = { dir: 'C:\\work\\quiz-web-play', pid: 111 };
    expect(buildAllowedWithLive({ health: null, playJson: null, root })).toBe(true);
    expect(buildAllowedWithLive({ health: { testServer: true }, playJson: null, root })).toBe(true);
    expect(buildAllowedWithLive({ health: { pid: 111 }, playJson: null, root })).toBe(false); // 과도기 — 파일 없음
    expect(buildAllowedWithLive({ health: { pid: 111 }, playJson: { dir: root, pid: 111 }, root })).toBe(false); // --here
    expect(buildAllowedWithLive({ health: { pid: 111 }, playJson: play, root })).toBe(true);
    expect(buildAllowedWithLive({ health: { pid: 222 }, playJson: play, root })).toBe(false); // 다른 서버
    expect(buildAllowedWithLive({ health: {}, playJson: play, root })).toBe(true); // 옛 서버(pid 없음)
  });
});

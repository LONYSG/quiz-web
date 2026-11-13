// ★ R100 (D · D2) — 임시 폴더 쓸기 · 프로세스 분류(고아 판정 · 보호 대상 제외)
import { describe, expect, it } from 'vitest';
import { ancestorsOf, classifyProcs, pickTempSweep, profilesInUse, topByName } from './proc-lib.mjs';

const H = 3_600_000;
const NOW = Date.parse('2026-11-13T20:00:00Z');
const at = (h) => NOW - h * H;

describe('R100 D — 임시 폴더 쓸기', () => {
  const e = (name, h) => ({ name, ageMs: h * H });
  it('하루 넘은 것 · 30분 넘었고 아무 chrome 도 안 쓰는 프로필만', () => {
    const entries = [e('quizui-old', 30), e('quizui-done', 2), e('quizui-live', 2), e('quizui-new', 0.1), e('r098-x', 1), e('r068av-a', 5), e('r068av-b', 25), e('other-x', 99), e('choice-1', 99)];
    expect(pickTempSweep(entries, new Set(['quizui-live']))).toEqual(['quizui-done', 'quizui-old', 'r068av-b', 'r098-x']);
  });
  it('쓰는 중인 것은 하루가 넘어도 남긴다', () => {
    expect(pickTempSweep([e('quizui-live', 30)], new Set(['quizui-live']))).toEqual([]);
  });
  it('chrome 명령줄의 --user-data-dir 폴더 이름', () => {
    const s = profilesInUse([
      { cmd: '"C:\\chrome.exe" --headless=new --user-data-dir=C:\\Users\\x\\AppData\\Local\\Temp\\quizui-Ab12 about:blank' },
      { cmd: '"C:\\chrome.exe" "--user-data-dir=C:\\Users\\x\\AppData\\Local\\Google\\Chrome\\User Data" /prefetch' },
      { cmd: 'node a.mjs' },
    ]);
    expect(s.has('quizui-Ab12')).toBe(true);
    expect(s.size).toBe(2);
  });
});

describe('R100 D2 — 프로세스 분류', () => {
  const p = (pid, ppid, name, cmd, h, mb = 100) => ({ pid, ppid, name, cmd, startMs: at(h), mb });
  const procs = [
    p(4, 0, 'System', '', 100),
    p(10, 4, 'explorer.exe', 'explorer', 50),
    p(20, 10, 'WindowsTerminal.exe', 'wt', 40),
    p(30, 20, 'claude.exe', 'claude', 10, 900),
    p(31, 30, 'bash.exe', 'bash', 9),
    // 살아 있는 검사 — 부모 있음 · chrome 1시간째 → 남김
    p(40, 31, 'node.exe', 'node scripts/ui-check.mjs --social', 1),
    p(41, 40, 'chrome.exe', 'chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=C:\\T\\quizui-aa', 1, 300),
    p(42, 41, 'chrome.exe', 'chrome.exe --type=renderer', 1, 200),
    // 고아 ui-check(부모 999 없음) + 그 chrome
    p(50, 999, 'node.exe', 'node scripts\\ui-check.mjs', 3),
    p(51, 50, 'chrome.exe', 'chrome.exe --headless=new --user-data-dir=C:\\T\\quizui-bb', 3, 400),
    // 부모는 살아 있지만 8시간 넘은 검사용 chrome
    p(60, 31, 'chrome.exe', 'chrome.exe --headless=new --remote-debugging-port=9334', 8, 250),
    // 부모 PID 를 늦게 시작한 다른 프로세스가 씀 = 고아
    p(70, 71, 'node.exe', 'node C:\\work\\quiz-web\\scripts\\bot.mjs liar', 5),
    p(71, 10, 'notepad.exe', 'notepad', 1),
    // 사용자 일반 chrome(표시 없음) — 목록에 안 오름
    p(80, 10, 'chrome.exe', '"chrome.exe" --no-startup-window', 20, 233),
    p(81, 80, 'chrome.exe', '"chrome.exe" --type=renderer', 20),
    // 실 서버(보호) — 그 자식 vite 처럼 보여도 보호
    p(90, 999, 'node.exe', 'node server/dist/index.js', 30),
    p(91, 90, 'node.exe', 'node C:\\work\\quiz-web\\node_modules\\vite\\bin\\vite.js', 30),
    // dev 3001(보호) — 부모가 없어도 보호
    p(95, 998, 'node.exe', 'node C:\\work\\quiz-web\\node_modules\\tsx\\dist\\cli.mjs server/src/index.ts', 30),
    // claude · codex · docker 는 표시가 있어도 안 건드림
    p(100, 999, 'node.exe', 'node C:\\x\\@anthropic-ai\\claude-code\\cli.js vitest', 2),
    p(101, 999, 'codex.exe', 'codex vitest', 2),
    // 다른 일(GEN 의 f.mjs) — 우리 것 아님
    p(110, 999, 'node.exe', 'node f.mjs en:Pug', 1),
  ];
  const { items } = classifyProcs(procs, { now: NOW, protect: [90, 95] });
  const by = Object.fromEntries(items.map((i) => [i.pid, i]));

  it('목록 = 표시 있는 chrome 나무의 뿌리 · 이 저장소 node 만', () => {
    expect(Object.keys(by).map(Number).sort((a, b) => a - b)).toEqual([40, 41, 50, 51, 60, 70, 91, 95]);
    expect(by[41].count).toBe(2);
    expect(by[41].treeMb).toBe(500);
  });
  it('고아 판정 — 부모 없음 · 부모 PID 재사용', () => {
    expect(by[50]).toMatchObject({ parentAlive: false, kill: true });
    expect(by[70]).toMatchObject({ parentAlive: false, kill: true });
    expect(by[40]).toMatchObject({ parentAlive: true, kill: false });
    expect(by[51]).toMatchObject({ parentAlive: true, kill: false }); // 고아 node 를 나무째 끝내면 같이 끝난다
  });
  it('6시간 넘은 검사용 chrome 은 끝냄 · 1시간째는 남김', () => {
    expect(by[60]).toMatchObject({ kill: true });
    expect(by[41]).toMatchObject({ kill: false });
  });
  it('보호 — 실 서버 자손 · dev 서버는 고아여도 안 끝냄', () => {
    expect(by[91]).toMatchObject({ protected: true, kill: false });
    expect(by[95]).toMatchObject({ protected: true, kill: false, parentAlive: false });
  });
  it('조상 — explorer 에 닿으면 멈춤', () => {
    expect(ancestorsOf(40, procs).map((a) => a.pid)).toEqual([31, 30, 20]);
  });
  it('이름별 합계', () => {
    expect(topByName(procs, 1)[0]).toMatchObject({ name: 'chrome.exe', count: 6 });
  });
});

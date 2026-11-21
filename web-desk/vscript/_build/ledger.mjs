// 영상 회차 장부 관리 — 설계 창이 돌린다.
//   node web-desk/vscript/_build/ledger.mjs                       장부 점검(중복 · 파일) + 완성\목록.md 다시 쓰기 + quiz-video 사본 맞추기
//   node web-desk/vscript/_build/ledger.mjs --uploaded 1 --url https://youtu.be/… [--at "2026-11-21 13:00"]
//        그 회차를 "올림"으로 적고, 세 파일(mp4 · png · txt)을 완성\올린 것\YYYY-MM\ 로 옮기고, 완성\구\ 의 그 회차 옛 판을 지운다.
//
// 폴더 규칙(찬종 2026-11-21: "무질서하게 쌓아두지 말고 · 기록을 남겨 중복 없게")
//   완성\                      아직 올리지 않은 회차만(회차마다 mp4 · png · txt 세 파일) — 찬종이 여기서 집어 올린다
//   완성\구\                   올리기 전 회차의 바로 앞 판(영상 창이 다시 뽑을 때 옮겨 둔다) — 그 회차가 올라가면 지운다
//   완성\올린 것\YYYY-MM\      올린 회차(달마다)
//   완성\목록.md               이 스크립트가 장부에서 뽑는 한눈표(손으로 고치지 않는다)
// 장부 정본 = quiz-web/web-desk/vscript/회차.json · quiz-video/data/episodes.json 은 사본(영상 창의 prepare.mjs 가 중복을 견줄 때 읽는다).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const LEDGER = 'C:/work/quiz-web/web-desk/vscript/회차.json';
const COPY = 'C:/work/quiz-video/data/episodes.json';
const DONE = 'C:/work/quiz-video/완성';
const UP = path.join(DONE, '올린 것');
const OLD = path.join(DONE, '구');
const EXT = ['.mp4', '.png', '.txt'];
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const norm = (s) => String(s).replace(/[\s·!?'"‘’“”.,-]/g, '').toLowerCase();
const now = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const probe = (f) => { try { return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim()); } catch { return null; } };
const monthDir = (e) => path.join(UP, e.date.slice(0, 7));
const where = (e) => {
  if (EXT.every((x) => existsSync(path.join(monthDir(e), e.file + x)))) return 'uploaded';
  if (existsSync(path.join(DONE, e.file + '.mp4'))) return 'ready';
  return 'none';
};

const j = JSON.parse(readFileSync(LEDGER, 'utf8'));
const problems = [];

// 1) --uploaded
const upNo = arg('--uploaded');
if (upNo) {
  const e = j.episodes.find((x) => String(x.no) === String(upNo));
  if (!e) throw new Error('장부에 없는 회차: ' + upNo);
  const missing = EXT.filter((x) => !existsSync(path.join(DONE, e.file + x)));
  if (missing.length) throw new Error(`완성\\ 에 ${e.file}${missing.join(' · ')} 이 없다 — 옮기지 않았다`);
  mkdirSync(monthDir(e), { recursive: true });
  for (const x of EXT) renameSync(path.join(DONE, e.file + x), path.join(monthDir(e), e.file + x));
  if (existsSync(OLD)) for (const f of readdirSync(OLD)) if (f.startsWith(e.file)) unlinkSync(path.join(OLD, f));
  e.uploaded = { at: arg('--at') || now(), url: arg('--url') || null };
  console.log(`${e.no}회 올림 — 완성\\올린 것\\${e.date.slice(0, 7)}\\ 로 옮김 · 구\\ 의 옛 판 지움`);
}

// 2) 중복 점검 — 같은 정답 · 같은 id 가 두 회차에 있으면 안 된다
const seen = new Map();
for (const e of j.episodes) for (const q of e.questions) {
  for (const key of [q.id != null ? 'id:' + q.id : null, 'a:' + norm(q.answer)].filter(Boolean)) {
    if (seen.has(key)) problems.push(`중복: ${q.answer} — ${seen.get(key)}회와 ${e.no}회`);
    else seen.set(key, e.no);
  }
}
const files = new Map();
for (const e of j.episodes) { if (files.has(e.file)) problems.push(`파일 이름 겹침: ${e.file} — ${files.get(e.file)}회와 ${e.no}회`); files.set(e.file, e.no); }

// 3) 파일 상태 · 길이 적기
for (const e of j.episodes) {
  const w = where(e);
  e.state = w === 'uploaded' ? '올림' : w === 'ready' ? '완성(올리기 전)' : '자료';
  const mp4 = w === 'uploaded' ? path.join(monthDir(e), e.file + '.mp4') : w === 'ready' ? path.join(DONE, e.file + '.mp4') : null;
  if (mp4) { const sec = probe(mp4); if (sec) e.length = mmss(sec); }
  if (e.uploaded && w !== 'uploaded') problems.push(`${e.no}회: 장부는 올림인데 파일이 올린 것\\ 에 없다`);
  if (w === 'uploaded' && !e.uploaded) problems.push(`${e.no}회: 파일은 올린 것\\ 에 있는데 장부에 올린 기록이 없다`);
}
// 장부에 없는 파일이 완성\ 에 있나
const known = new Set(j.episodes.map((e) => e.file));
for (const f of readdirSync(DONE)) { if (EXT.includes(path.extname(f)) && !known.has(path.basename(f, path.extname(f)))) problems.push(`장부에 없는 파일: 완성\\${f}`); }

writeFileSync(LEDGER, JSON.stringify(j, null, 1) + '\n');
copyFileSync(LEDGER, COPY);

// 4) 목록.md
const rows = j.episodes.map((e) => `| ${e.no} | ${e.date} | ${e.hook} | ${e.questions.map((q) => q.answer).join(' · ')} | ${e.state} | ${e.length || ''} | ${e.uploaded ? e.uploaded.at + (e.uploaded.url ? ' · ' + e.uploaded.url : '') : ''} |`);
const md = [
  '# 오늘의 상식 — 만든 영상 목록', '',
  `이 표는 장부(quiz-web/web-desk/vscript/회차.json)에서 자동으로 뽑습니다 — 손으로 고치지 않습니다. 마지막 갱신 ${now()}`, '',
  '- `완성\\` 바로 아래 = 아직 올리지 않은 회차(mp4 · png 썸네일 · txt 제목과 설명글)',
  '- `완성\\올린 것\\YYYY-MM\\` = 올린 회차 · `완성\\구\\` = 올리기 전 회차의 바로 앞 판(올라가면 지웁니다)',
  '- 한 번 영상에 쓴 문제(정답)는 다시 쓰지 않습니다.', '',
  '| 회 | 날짜 | 제목 줄 | 문제(정답) | 상태 | 길이 | 올린 때 · 주소 |', '|---|---|---|---|---|---|---|', ...rows, '',
  problems.length ? '## 점검에서 걸린 것\n' + problems.map((p) => '- ' + p).join('\n') : '점검: 중복 없음 · 파일과 장부가 맞습니다.', '',
].join('\n');
writeFileSync(path.join(DONE, '목록.md'), md);
console.log(rows.join('\n'));
console.log(problems.length ? '걸린 것:\n' + problems.join('\n') : '점검: 중복 없음 · 파일과 장부 맞음');
if (problems.length) process.exitCode = 1;

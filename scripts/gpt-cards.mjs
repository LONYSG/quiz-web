// gpt 카드 러너 — 현황판의 gpt 줄에 뜬 묶음을 Codex(gpt)에게 하나씩 맡겨 끝까지 돈다.
//   node scripts/gpt-cards.mjs            → gpt 줄이 빌 때까지(묶음마다 새 Codex 실행 · 차례로)
//   node scripts/gpt-cards.mjs 007 008    → 적은 묶음만
//   node scripts/gpt-cards.mjs --max 5    → 많아야 5묶음
//   node scripts/gpt-cards.mjs --watch    → gpt 줄이 비어도 끝내지 않고 10분마다 다시 본다(재료 판정이 새로 끝나면 이어 쓴다 · 72묶음이 다 차거나 16시간이 지나면 끝) — gpt-cards.bat 이 이 꼴로 돈다
// 이 스크립트는 파일을 쓰지 않는다(기록 tmp/gpt-cards.log 만). 카드 파일은 Codex 가 AGENTS.md · 지시서-카드.md 대로 쓴다.
// 묶음 하나가 끝나면 받은것/카드-NNN.json 의 done:true · results 장수를 확인한다. 실패하면 한 번 더 하고, 또 실패하면 건너뛴다.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const maxI = args.indexOf('--max');
const max = maxI >= 0 ? Number(args[maxI + 1]) : 999;
const only = args.filter((a, i) => /^\d{2,3}$/.test(a) && i !== maxI + 1);
const LOG = 'tmp/gpt-cards.log';
const log = (s) => { const line = `${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${s}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };

const board = () => JSON.parse(execFileSync('node', ['web-desk/tone/_status.mjs', '--json'], { encoding: 'utf8' }));
const gptLine = () => {
  const b = board();
  const rows = b.rows || b.chunks || [];
  return rows.filter((r) => r.material === 'done' && r.materialJudged && r.card !== 'done').map((r) => String(r.chunk));
};
const check = (nn) => {
  try {
    const j = JSON.parse(fs.readFileSync(`web-desk/tone/받은것/카드-${nn}.json`, 'utf8').replace(/^﻿/, ''));
    const n = Array.isArray(j.results) ? j.results.length : 0;
    const ready = n ? j.results.filter((k) => k.status === 'ready').length : 0;
    return { ok: j.done === true && n >= 90, n, ready };
  } catch { return { ok: false, n: 0, ready: 0 }; }
};
const prompt = (nn) => `AGENTS.md 를 따른다. 이번 실행은 러너(scripts/gpt-cards.mjs)가 부른 것이다 — 묶음 ${nn} **하나만** 쓴다.
1. node web-desk/tone/_status.mjs 를 돌려 ${nn} 이 gpt 줄에 있는지 본다. 없으면 아무것도 쓰지 않고 "건너뜀: 까닭" 한 줄로 끝낸다.
2. web-desk/tone/지시서-카드.md 대로(재료 흐름 — 검색하지 않는다 · 재료에 없는 사실을 더하지 않는다) 보낼것/카드-${nn}.txt · 재료-${nn}.json · 같은정답-${nn}.txt · 그 재료의 판정 파일(data/pipeline/audit/v0NN-material-${nn}.json)을 읽고 web-desk/tone/받은것/카드-${nn}.json 을 쓴다. 다 쓴 뒤 한 번에 저장하고 맨 위에 "done": true.
3. 앞 묶음에서 하던 자체 확인(id · 순서 · 중복 · 질문 길이 · 힌트 검사)을 똑같이 한다.
4. ai-talk 글은 쓰지 않는다(러너가 기록한다). 다른 묶음으로 넘어가지 않는다. 묻지 말고 끝까지 한다.
마지막 메시지는 한 줄: "${nn}: 장수 n · ready n · needs_review n · 걸린 분".`;

const runOne = (nn) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn('codex', ['exec', '-s', 'workspace-write', '--skip-git-repo-check', '-o', `tmp/gpt-cards-last-${nn}.txt`, '-'], { shell: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  p.stdin.end(prompt(nn));
  const kill = setTimeout(() => { try { p.kill(); } catch {} }, 45 * 60 * 1000);
  p.on('close', (code) => {
    clearTimeout(kill);
    let last = ''; try { last = fs.readFileSync(`tmp/gpt-cards-last-${nn}.txt`, 'utf8').trim().split('\n').pop(); } catch {}
    resolve({ code, min: ((Date.now() - t0) / 60000).toFixed(1), last, err });
  });
});

// 두 번 돌지 않게 잠근다(tmp/gpt-cards.lock = 도는 프로세스 번호). 죽은 프로세스의 잠금은 무시한다.
const LOCK = 'tmp/gpt-cards.lock';
try { const pid = Number(fs.readFileSync(LOCK, 'utf8')); if (pid && pid !== process.pid) { process.kill(pid, 0); console.log(`이미 도는 중(pid ${pid}) — 끝냄`); process.exit(0); } } catch {}
fs.writeFileSync(LOCK, String(process.pid));
const unlock = () => { try { if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.unlinkSync(LOCK); } catch {} };
process.on('exit', unlock); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));

const WATCH = args.includes("--watch");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const allDone = () => (board().rows || []).filter((r) => r.card === "done").length >= 73;
const T0 = Date.now();
let done = 0, failed = [], idle = 0;
log(`시작 — 대상 ${only.length ? only.join(' ') : '(gpt 줄 전부)'} · 최대 ${max}`);
while (done < max) {
  const todo = gptLine().filter((n) => (!only.length || only.includes(n)) && !failed.includes(n));
  if (!todo.length) {
    if (!WATCH || allDone() || Date.now() - T0 > 16 * 3600 * 1000) break;
    if (idle++ % 6 === 0) log(`기다림 — gpt 줄 비어 있음(실패 ${failed.join(" ") || "없음"}) · 10분마다 다시 봄`);
    if (idle % 6 === 0) failed = [];
    await sleep(10 * 60 * 1000); continue;
  }
  idle = 0;
  const nn = todo[0];
  let ok = false;
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    log(`${nn} 시작(${attempt}차) — 남은 ${todo.length}`);
    const r = await runOne(nn);
    const c = check(nn);
    ok = c.ok;
    log(`${nn} ${ok ? '끝' : '실패'} — ${r.min}분 · 장수 ${c.n} · ready ${c.ready} · exit ${r.code} · ${r.last || ''}${ok ? '' : ' · ' + r.err.replace(/\s+/g, ' ').slice(-300)}`);
    if (!ok && /usage limit|rate limit|quota|429/i.test(r.err + r.last)) { if (!WATCH) { log('한도에 걸린 것으로 보임 — 멈춤'); process.exit(2); } log('한도에 걸린 것으로 보임 — 30분 쉬고 다시'); await sleep(30 * 60 * 1000); attempt = 0; }
  }
  if (ok) done++; else failed.push(nn);
}
log(`끝 — 쓴 묶음 ${done} · 실패 ${failed.join(' ') || '없음'} · 남은 gpt 줄 ${gptLine().filter((n) => !failed.includes(n)).length}`);
process.exit(failed.length ? 1 : 0);

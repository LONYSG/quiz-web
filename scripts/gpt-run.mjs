// gpt 러너(모든 창) — 아무 창에서나 gpt(Codex)에게 일 하나를 맡긴다. gpt 는 매번 새로 불린다(기억 없음 — 할 일은 전부 brief 파일에).
//   node scripts/gpt-run.mjs --brief <지시 md 파일> --out <경로>[,<경로>…] [--read] [--model astra] [--label 짧은이름] [--wait]
//     --brief  gpt 가 할 일 전체를 적은 md(부르는 창이 쓴다 · ai-talk 글이어도 된다)
//     --out    gpt 가 쓸 수 있는 파일 전부(이것 말고는 쓰지 않는다 — 프롬프트에 박는다)
//     --read   의견 묻기: 샌드박스 read-only · 답(마지막 메시지 전체)을 --out 첫 경로에 받는다
//     --model  없으면 Codex 기본(~/.codex/config.toml) · astra = 상위 모델(아래 MODELS 표) · 그 밖의 값은 그대로 -m 으로
//     --search 웹 검색 켜기(codex --search exec — --search 는 exec 앞 · 2026-11-27 재료 조사 시범)
//     --label  기록 · 상태에 보일 짧은 이름(없으면 brief 파일 이름)
//     --wait   상태 파일이 끝날 때까지 기다렸다가(5초마다 · 최대 60분) 결과 한 줄을 찍는다. 없으면 id 만 찍고 끝
//   node scripts/gpt-run.mjs --status   줄 · 도는 것 · 최근 10개
//   node scripts/gpt-run.mjs --worker   일꾼(gpt-run.bat 이 이 꼴로 돈다 — 직접 칠 일 없음)
//
// 흐름: 부르면 tmp/gpt-run/queue/<id>.json 에 일을 적고, 일꾼이 안 돌고 있으면 떨어진 새 창(최소화)으로 gpt-run.bat 을 띄운다.
//   (Claude 창 안 배경 실행은 그 창이 한도로 끊기면 같이 죽었다 — gpt-cards 의 교훈) 일꾼은 줄을 한 번에 하나씩 차례로 돌고 줄이 비면 끝난다.
//   잠금 tmp/gpt-run.lock(죽은 pid 의 잠금은 무시) · 일마다 상태 tmp/gpt-run/<id>.json(queued | running | done | failed | limit) · 기록 tmp/gpt-run.log
// 끝 판정: --out 마다 — JSON 이면 파일이 있고 "done": true · 아니면 비어 있지 않음 · 쓰기 모드는 이번 실행 중에 새로 쓴 파일이어야 함.
//   안 되면 한 번 더 · 또 안 되면 failed 로 두고 다음 일. 사용량 한도가 보이면 그 일을 limit 로 두고 줄 전체를 멈춘다(남은 일 · 그 일은 줄에 남아 다시 부르면 이어서).
// AGENTS.md 3-3 이 gpt 쪽 규칙이다(이 러너가 부른 실행에서는 --out 경로만 쓴다).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

// Codex 모델 이름(2026-11-27 ~/.codex/models_cache.json 에서 확인 · 짧은 시험 호출로 확인 — ai-out/R122.txt)
const MODELS = { astra: 'gpt-6.2-astra', sol: 'gpt-6.2-sol' };
const DIR = 'tmp/gpt-run';
const QDIR = `${DIR}/queue`;
const LOCK = 'tmp/gpt-run.lock';
const LOG = 'tmp/gpt-run.log';
const JOB_TIMEOUT_MS = 60 * 60 * 1000;
const LIMIT_RE = /hit your usage limit|usage limit|rate limit|try again at|quota|\b429\b/i;

fs.mkdirSync(QDIR, { recursive: true });
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const local = (t = new Date()) => new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString(); // 이 PC 시각(KST)
const stamp = () => local().slice(0, 19).replace('T', ' ');
const rel = (p) => path.relative(ROOT, path.resolve(p)).split(path.sep).join('/');
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const writeJson = (p, j) => { const t = `${p}.tmp${process.pid}`; fs.writeFileSync(t, JSON.stringify(j, null, 2)); fs.renameSync(t, p); };
const statusPath = (id) => `${DIR}/${id}.json`;
const setStatus = (id, patch) => { const s = { ...(readJson(statusPath(id)) || {}), ...patch }; writeJson(statusPath(id), s); return s; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const lockPid = () => { try { const pid = Number(fs.readFileSync(LOCK, 'utf8')); return pid && alive(pid) ? pid : 0; } catch { return 0; } };
const queue = () => fs.readdirSync(QDIR).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(`${QDIR}/${f}`)).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 부르기 ──
function enqueue() {
  const brief = opt('--brief');
  const outRaw = opt('--out');
  if (!brief || !outRaw) { console.error('쓰는 법: node scripts/gpt-run.mjs --brief <md> --out <경로>[,<경로>…] [--read] [--model astra] [--label 이름] [--wait]'); process.exit(64); }
  if (!fs.existsSync(brief)) { console.error(`brief 파일이 없음: ${brief}`); process.exit(66); }
  const out = outRaw.split(',').map((s) => s.trim()).filter(Boolean).map(rel);
  const read = flag('--read');
  const model = opt('--model') || '';
  const search = flag('--search');
  const label = (opt('--label') || path.basename(brief, path.extname(brief))).replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40);
  const t = new Date();
  const id = `${local(t).replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}${String(t.getMilliseconds()).padStart(3, '0')}-${label}`;
  const job = { id, label, brief: rel(brief), out, read, model, search, queuedAt: stamp() };
  writeJson(statusPath(id), { ...job, state: 'queued' });
  writeJson(`${QDIR}/${id}.json`, job);
  log(job, 'queued');
  if (!lockPid()) {
    // 떨어진 새 창(최소화) — 이 창이 끊겨도 일꾼은 산다. Start-Process 가 끝날 때까지 기다린다
    // (detached 로 띄우고 바로 끝내면 부른 쪽이 끝나며 아직 창을 못 연 powershell 도 같이 정리됐다 — 2026-11-27 시험)
    spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${path.join(ROOT, 'gpt-run.bat')}' -WindowStyle Minimized`], { stdio: 'ignore', windowsHide: true });
  }
  return id;
}

async function wait(id) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60 * 60 * 1000) {
    const s = readJson(statusPath(id));
    if (s && ['done', 'failed', 'limit'].includes(s.state)) {
      console.log(`${id} ${s.state} — ${s.min ?? '?'}분 · tokens ${s.tokens ?? '?'} · ${s.last || ''}`);
      process.exit(s.state === 'done' ? 0 : s.state === 'limit' ? 2 : 1);
    }
    await sleep(5000);
  }
  console.log(`${id} 아직 안 끝남(60분) — node scripts/gpt-run.mjs --status`);
  process.exit(3);
}

// ── 일꾼 ──
const prompt = (job) => {
  const outs = job.out.join(' · ');
  const head = `AGENTS.md 를 따른다. 이번 실행은 러너(scripts/gpt-run.mjs)가 부른 것이다(AGENTS.md 3-3). ${job.brief} 를 읽고 그대로 한다.`;
  if (job.read) return `${head}\n이번은 읽기 모드다 — 파일을 쓰지 않는다(어떤 파일도). ai-talk 글은 쓰지 않는다. 묻지 말고 끝까지. 답 전체를 마지막 메시지로.`;
  return `${head}\n쓸 수 있는 파일 = ${outs} 뿐(그 밖의 파일은 쓰지 않는다). ai-talk 글은 쓰지 않는다. 묻지 말고 끝까지. JSON 결과는 다 쓴 뒤 한 번에 저장하고 맨 위에 "done": true. 마지막 메시지는 한 줄(무엇을 · 몇 장 · 걸린 것).`;
};

const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
function check(job, before) {
  for (const p of job.out.slice(0, job.read ? 1 : undefined)) {
    let txt; try { txt = fs.readFileSync(p, 'utf8'); } catch { return `없음 ${p}`; }
    if (!txt.trim()) return `빈 파일 ${p}`;
    if (!job.read && mtime(p) <= (before[p] || 0)) return `이번에 안 씀 ${p}`;
    if (/\.json$/i.test(p)) { const j = readJson(p); if (!j || j.done !== true) return `done:true 없음 ${p}`; }
  }
  return '';
}

const runCodex = (job) => new Promise((resolve) => {
  const lastFile = job.read ? job.out[0] : `${DIR}/${job.id}.last.txt`;
  if (job.read) fs.mkdirSync(path.dirname(lastFile), { recursive: true });
  const a = [...(job.search ? ['--search'] : []), 'exec', '-s', job.read ? 'read-only' : 'workspace-write', '--skip-git-repo-check', '-o', lastFile];
  if (job.model) a.push('-m', MODELS[job.model] || job.model);
  a.push('-');
  const p = spawn('codex', a, { shell: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  p.stdin.end(prompt(job));
  const kill = setTimeout(() => { try { p.kill(); } catch {} }, JOB_TIMEOUT_MS);
  p.on('close', (code) => {
    clearTimeout(kill);
    let last = ''; try { last = fs.readFileSync(lastFile, 'utf8').trim().split('\n').pop().trim(); } catch {}
    const tk = [...err.matchAll(/tokens used\s*([\d,]+)/gi)].pop();
    resolve({ code, err, last, tokens: tk ? tk[1].replace(/,/g, '') : '' });
  });
});

function log(job, state, extra = {}) {
  const f = [stamp(), job.id, job.label, job.brief, job.out.join(','), job.model || '(기본)', state, extra.min ?? '', extra.tokens ?? '', (extra.last || '').replace(/\s+/g, ' ').slice(0, 200)];
  fs.appendFileSync(LOG, f.join(' | ') + '\n');
}

async function worker() {
  // 잠금 — 한 번에 일꾼 하나(죽은 pid 의 잠금은 지운다)
  for (;;) {
    try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); break; } catch {
      const pid = lockPid();
      if (pid && pid !== process.pid) { console.log(`일꾼이 이미 도는 중(pid ${pid}) — 끝냄`); return 0; }
      try { fs.unlinkSync(LOCK); } catch {}
    }
  }
  const unlock = () => { try { if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.unlinkSync(LOCK); } catch {} };
  process.on('exit', unlock); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
  console.log(`${stamp()} 일꾼 시작(pid ${process.pid})`);
  for (;;) {
    const job = queue()[0];
    if (!job) { console.log(`${stamp()} 줄이 비었음 — 끝`); return 0; }
    const t0 = Date.now();
    setStatus(job.id, { state: 'running', startedAt: stamp(), pid: process.pid });
    let r, bad = 'x', attempt = 0;
    while (bad && attempt < 2) {
      attempt++;
      console.log(`${stamp()} ${job.id} 시작(${attempt}차)`);
      const before = Object.fromEntries(job.out.map((p) => [p, mtime(p)]));
      r = await runCodex(job);
      bad = check(job, before);
      if (bad && LIMIT_RE.test(r.err + '\n' + r.last)) {
        const min = ((Date.now() - t0) / 60000).toFixed(1);
        setStatus(job.id, { state: 'limit', endedAt: stamp(), min, tokens: r.tokens, last: (r.last || r.err.trim().split('\n').pop() || '').slice(0, 300) });
        log(job, 'limit', { min, tokens: r.tokens, last: r.last || r.err.slice(-200) });
        console.log(`${stamp()} 한도 — 줄 전체를 멈춤(남은 일은 줄에 그대로 · 다시 부르면 이어서)`);
        return 2;
      }
      if (bad) console.log(`${stamp()} ${job.id} 안 됨: ${bad}`);
    }
    const min = ((Date.now() - t0) / 60000).toFixed(1);
    const state = bad ? 'failed' : 'done';
    setStatus(job.id, { state, endedAt: stamp(), min, tokens: r.tokens, exit: r.code, last: (bad ? `${bad} · ${r.last}` : r.last).slice(0, 300) });
    log(job, state, { min, tokens: r.tokens, last: bad ? `${bad} · ${r.last}` : r.last });
    console.log(`${stamp()} ${job.id} ${state} — ${min}분 · ${r.last}`);
    try { fs.unlinkSync(`${QDIR}/${job.id}.json`); } catch {}
  }
}

// ── 상태 ──
function status() {
  const pid = lockPid();
  console.log(`일꾼: ${pid ? `도는 중(pid ${pid})` : '안 돎'}`);
  const q = queue();
  console.log(`줄: ${q.length ? q.map((j) => j.id).join(' · ') : '비어 있음'}`);
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => readJson(`${DIR}/${f}`)).filter((s) => s && s.id).sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 10);
  console.log('\n| id | 상태 | 모델 | 분 | tokens | 마지막 한 줄 |\n|---|---|---|---|---|---|');
  for (const s of all) console.log(`| ${s.id} | ${s.state} | ${s.model || '기본'} | ${s.min ?? ''} | ${s.tokens ?? ''} | ${(s.last || '').replace(/\|/g, '/').slice(0, 80)} |`);
}

if (flag('--status')) status();
else if (flag('--worker')) process.exit(await worker());
else { const id = enqueue(); if (flag('--wait')) await wait(id); else console.log(id); }

// V118 4절 — 대상 밖 수 세기(판정 안 함)
import fs from 'node:fs';
import pg from 'pg';
const T = 'web-desk/tone/', P = 'data/pipeline/tone/';
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const db = new pg.Client({ connectionString: 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
const rows = (await db.query("select id,question_text,is_active,status from questions")).rows;
const by = new Map(rows.map((r) => [String(r.id), r]));
const applied = new Set();
for (const f of fs.readdirSync(P).filter((f) => /^g0\d+-apply\.json$/.test(f))) { const j = read(P + f); for (const it of (j && j.items) || []) if (String(it.src || it.file || '').startsWith('카드-')) applied.add(String(it.id)); }
const nr = [];
for (const f of fs.readdirSync(T + '받은것').filter((f) => /^카드-.*\.json$/.test(f))) {
  const j = read(T + '받은것/' + f); if (!j || !j.results) continue;
  for (const r of j.results) if (r.status && r.status !== 'ready') nr.push({ id: String(r.id), status: r.status, why: r.note || r.reason || '', file: f });
}
const stat = {}; let active = 0, activeOld = 0;
for (const x of nr) {
  stat[x.status] = (stat[x.status] || 0) + 1;
  const d = by.get(x.id);
  if (d && d.status === 'approved' && d.is_active) { active++; if (!applied.has(x.id)) activeOld++; }
}
const reasons = {};
for (const x of nr) { const k = String(x.why).slice(0, 14); reasons[k] = (reasons[k] || 0) + 1; }
console.log('needs_review 류', nr.length, stat, '지금 활성', active, '옛 문장(적재 기록 없음)', activeOld);
console.log(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 12));
const tg = read('data/pipeline/audit/v118-raw/targets.json');
const EMO = /[\u{1F300}-\u{1FAFF}☀-➿]/u;
const all = rows.filter((r) => r.status === 'approved' && r.is_active);
const old = all.filter((r) => !applied.has(String(r.id)));
console.log('활성', all.length, '다시 쓴 기록 있음', all.length - old.length, '기록 없음(옛 문장)', old.length, '그중 이모지', old.filter((r) => EMO.test(r.question_text)).length, '이모지 뺀', old.filter((r) => !EMO.test(r.question_text)).length);
await db.end();

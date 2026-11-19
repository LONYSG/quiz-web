#!/usr/bin/env node
// G105 — 실은 것 고치기 전 / 고친 문장 → ai-out/G105-해설.md (표 · 20줄마다 제목)
//   add · move = data/pipeline/tone/g105-apply-shape.json(있으면) · rejoin = g105-apply-rejoin.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './g023-common.mjs';

const P = (f) => path.join(ROOT, 'data/pipeline/tone', f);
const load = (f) => (existsSync(P(f)) ? JSON.parse(readFileSync(P(f), 'utf8')).items : []);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const shape = load('g105-apply-shape.json'), rejoin = load('g105-apply-rejoin.json');
const out = ['# G105 — 실은 해설 · 질문 (고치기 전 / 고친 문장)', '', '> 2026-11-19 · GEN · 실 DB(quizweb) 기준 · 되돌리기 `node scripts/tone-apply.mjs --round g105 [--db quizweb_dev] --undo`', ''];
function table(title, list, cols) {
  if (!list.length) { out.push(`## ${title}`, '', '(아직 없음)', ''); return; }
  for (let i = 0; i < list.length; i += 20) {
    out.push(`## ${title} ${i + 1}~${Math.min(i + 20, list.length)}`, '', '| # | 정답 | 칸 | 고치기 전 | 고친 문장 |', '|---|---|---|---|---|');
    for (const it of list.slice(i, i + 20)) for (const [col, label] of cols) if (it[col]) out.push(`| ${it.id} | ${cell(it.answer)} | ${label} | ${cell(it[col].before)} | ${cell(it[col].after)} |`);
    out.push('');
  }
}
table('해설에 이야기 옮기기(add)', shape.filter((x) => x.job === 'add'), [['explanation', '해설']]);
table('토막 상식 내리기(move)', shape.filter((x) => x.job === 'move'), [['question_text', '질문'], ['general_hint', '힌트'], ['explanation', '해설']]);
table('잇기 다시 고치기(rejoin · 질문만)', rejoin, [['question_text', '질문']]);
writeFileSync(path.join(ROOT, 'ai-out/G105-해설.md'), out.join('\n') + '\n');
console.log('[G105 md] add', shape.filter((x) => x.job === 'add').length, '· move', shape.filter((x) => x.job === 'move').length, '· rejoin', rejoin.length);

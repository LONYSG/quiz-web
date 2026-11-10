#!/usr/bin/env node
// =============================================================================
// G058 — V050 fixes(151) · drop(22) 를 generated/g057 파일에 적용한다 (★ DB 를 쓰지 않는다 — 적재는 pipeline-load --round g057)
//   g054-liar2-apply 꼴: 다시 판정하지 않고 기계 적용 · 막히면(checkAnswerSet · checkHint) 보고
//   ★ 재블라인드(tmp/g058/reblind-scored.json — 바뀐 줄 132 를 sonnet 이 이모지 + 갈래만 보고 추측)에서
//     새 줄은 못 맞히고 옛 줄은 V050 블라인드에서 맞혔던 것 → 옛 줄로 되돌림(fix.reverted)
//   ★ 멱등: verify.appliedRound === 'G058' 인 항목은 건너뛴다(두 번 돌려도 그대로)
//   node scripts/g058-emoji-apply.mjs [--dry-run]
//   출력 audit/g058-apply.json(전후) · audit/g058-reblind.json
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const DIR = path.join(ROOT, 'data/pipeline/generated/g057');
const AUD = path.join(ROOT, 'data/pipeline/audit');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const WHY = J(path.join(AUD, 'g058-emoji-why.json'));
const RB_FILE = path.join(ROOT, 'tmp/g058/reblind-scored.json');
const RB = existsSync(RB_FILE) ? J(RB_FILE) : J(path.join(AUD, 'g058-reblind.json')).items;
const rbBy = Object.fromEntries(RB.map((r) => [r.ref, r]));
const HIT = new Set(['ok', 'edge']);
const revert = (ref) => { const r = rbBy[ref]; return r && r.newBlind === 'miss' && HIT.has(r.oldBlind); };
// GEN 이 다시 쓴 힌트(V050 hint 제안이 H2 막힘일 때) — 없으면 빈 표
const HINT_FIX = {
  '10-15': '1997년 TV 공 모양 도구로 친구를 모으는 모험 애니', // V050 안 '몬스터볼' — 정답 조각(몬스터)
  '14-18': '재난 속 상황 대처를 알려 주는 어린이 학습서 묶음', // V050 안 '과학 · 학습만화' — 변형 조각(과학상식 만화)
};
const isLatin = (v) => /[A-Za-z]/.test(v) && !/[가-힣]/.test(v);
const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const graphemes = (s) => [...seg.segment(s)].map((x) => x.segment);
const SEP = ' — 이모지가 나타내는 ';

const log = { round: 'G058', at: new Date().toISOString(), counts: {}, items: [], problems: [] };
const cnt = (k) => { log.counts[k] = (log.counts[k] ?? 0) + 1; };
let skipped = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
  const file = path.join(DIR, f); const doc = J(file); let changed = false;
  for (const it of doc.items) {
    const v = it.verify; const q = it.question; const ref = it.seed.ref;
    if (!v) { log.problems.push(`${ref}: verify 없음`); continue; }
    if (v.appliedRound === 'G058') { skipped++; continue; }
    const before = { question: q.question, explanation: q.explanation, generalHint: q.generalHint, acceptedAnswers: [...q.acceptedAnswers], originalTitleVariants: [...q.originalTitleVariants] };
    const rec = { ref, answer: q.answer, verdict: v.verdict, ops: [] };
    if (v.verdict === 'drop') {
      q.discarded = `V050 drop — ${(v.reasons ?? []).join(' · ')}`; cnt('drop'); rec.ops.push('drop');
    }
    for (const x of v.verdict === 'drop' ? [] : v.fixes ?? []) {
      if (x.op === 'emoji') {
        if (!q.question.startsWith(x.from + SEP)) { log.problems.push(`${ref}: 이모지 from 이 질문 머리와 다름`); continue; }
        if (revert(ref)) { x.reverted = 'G058 재블라인드 — 새 줄 못 맞힘 · 옛 줄은 V050 블라인드 맞힘'; cnt('emoji-reverted'); rec.ops.push('emoji-reverted'); continue; }
        const g = graphemes(x.to);
        if (g.length < 3 || g.length > 6) log.problems.push(`${ref}: 새 줄 이모지 ${g.length}개`);
        if (/[A-Za-z0-9가-힣]/.test(x.to.replace(/[0-9#*]️?⃣/g, ''))) log.problems.push(`${ref}: 새 줄에 글자`);
        if (!WHY[ref]) log.problems.push(`${ref}: 새 풀이 없음(g058-emoji-why.json)`);
        q.question = x.to + q.question.slice(x.from.length);
        q.emoji.lineG057 = q.emoji.line; q.emoji.line = x.to; q.emoji.whyG057 = q.emoji.why; q.emoji.why = WHY[ref];
        q.explanation = `이모지: ${WHY[ref]}`;
        cnt('emoji'); rec.ops.push('emoji');
      } else if (x.op === 'variant-add') {
        const nTo = normalizeAnswer(x.to);
        if ([q.answer, ...q.acceptedAnswers].some((a) => normalizeAnswer(a) === nTo)) { x.applied = 'G058 — 넣지 않음(정규화하면 이미 받는 표기 · R090)'; cnt('variant-add-redundant'); rec.ops.push(`+${x.to}(이미 받음)`); continue; }
        q.acceptedAnswers.push(x.to);
        if (isLatin(x.to) && /[가-힣]/.test(q.answer) && !q.originalTitleVariants.includes(x.to)) q.originalTitleVariants.push(x.to);
        cnt('variant-add'); rec.ops.push(`+${x.to}`);
      } else if (x.op === 'variant-remove') {
        for (const r of x.from.split('/').map((s) => s.trim()).filter(Boolean)) {
          const had = q.acceptedAnswers.includes(r);
          q.acceptedAnswers = q.acceptedAnswers.filter((a) => a !== r);
          q.originalTitleVariants = q.originalTitleVariants.filter((a) => a !== r);
          rec.ops.push(had ? `-${r}` : `-${r}(없음)`);
        }
        cnt('variant-remove');
      } else if (x.op === 'hint') {
        q.generalHint = HINT_FIX[ref] ?? x.to; cnt('hint'); rec.ops.push('hint');
      } else if (x.op === 'category') {
        // 모래시계 "한국 드라마 2000년대 → 1990년대" — V050 분야 이름 표기 · kr-screen 에 1990년대 드라마 리프가 없다(그대로 "한국 드라마")
        x.applied = 'G058 — 리프 그대로(kr-screen > 한국 드라마 · 1990년대 드라마 리프 없음)'; cnt('category-noop'); rec.ops.push('category-noop');
      } else log.problems.push(`${ref}: 모르는 op ${x.op}`);
    }
    // 게이트와 같은 검사
    if (!q.discarded) {
      const g = checkAnswerSet(q.question, q.answer, q.acceptedAnswers, normalizeAnswer, { originalTitles: q.originalTitleVariants });
      if (g.blocked.length) log.problems.push(`${ref}: 질문에 정답 — ${g.blocked.map((b) => b.answer)}`);
      if (g.dropped.length) log.problems.push(`${ref}: 변형 떨어짐 — ${g.dropped.map((d) => `${d.answer}(${d.kind})`)}`);
      const hc = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers, question: q.question, explanation: q.explanation });
      if (hc.block.length) log.problems.push(`${ref}: 힌트 H2 — ${hc.block.map((b) => b.frag)} | ${q.generalHint}`);
    }
    v.appliedRound = 'G058'; changed = true;
    if (rec.ops.length) { rec.before = before; rec.after = { question: q.question, explanation: q.explanation, generalHint: q.generalHint, acceptedAnswers: q.acceptedAnswers, originalTitleVariants: q.originalTitleVariants, discarded: q.discarded ?? null }; log.items.push(rec); }
  }
  if (changed && !DRY && !log.problems.length) writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
}
for (const p of log.problems) console.log('★', p);
if (skipped) console.log(`[g058] 이미 적용 ${skipped} — 건너뜀`);
console.log(`[g058] ${JSON.stringify(log.counts)} · 문제 ${log.problems.length}${DRY ? ' · 확인만' : ''}`);
if (log.problems.length) process.exit(1);
if (!DRY && log.items.length) {
  writeFileSync(path.join(AUD, 'g058-apply.json'), JSON.stringify(log, null, 1) + '\n');
  writeFileSync(path.join(AUD, 'g058-reblind.json'), JSON.stringify({ round: 'G058', judge: 'claude-sonnet-5-5 (하위 에이전트 1 · 이모지 줄 + 갈래만 · 답 최대 2)', rule: '새 줄 1·2순위 적중 → 확정 / 새 줄 못 맞힘 + 옛 줄 V050 블라인드 맞힘 → 옛 줄로 되돌림 / 둘 다 못 맞힘 → 새 줄(V050 존중)', counts: RB.reduce((a, r) => (a[r.newBlind] = (a[r.newBlind] ?? 0) + 1, a), {}), reverted: RB.filter((r) => revert(r.ref)).map((r) => r.ref), items: RB }, null, 1) + '\n');
}

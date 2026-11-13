#!/usr/bin/env node
// =============================================================================
// G069 — 이모지 2차 G-2: V057 판정(audit/v057-emoji2.json · 485 = ok 458 · fix 24 · drop 3)을 generated/g068e 파일에 적용한다
//   ★ DB 를 쓰지 않는다 — 적재는 pipeline-load --round g068e (g058-emoji-apply.mjs 꼴 · 다시 판정하지 않고 기계 적용)
//   fix = { line, hint } → 질문 머리 이모지 줄 · generalHint 교체 · 해설 "이모지: <풀이>" 는 새 줄에 맞게(아래 WHY · 남은 이모지는 옛 풀이)
//   drop → question.discarded(게이트가 건너뜀)
//   ★ 멱등: verify.appliedRound === 'G069' 인 항목은 건너뛴다
//   node scripts/g069-emoji2-apply.mjs [--dry-run]   출력 audit/g069-emoji2-apply.json(전후)
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const DIR = path.join(ROOT, 'data/pipeline/generated/g068e');
const AUD = path.join(ROOT, 'data/pipeline/audit');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const V = J(path.join(AUD, 'v057-emoji2.json'));
// 새 줄의 풀이(GEN — 남은 이모지는 옛 풀이 그대로 · 새 이모지만 V057 사유대로)
const WHY = {
  '23-19': '할아버지 · 할머니 · 강아지 · 강',
  '25-02': '얼음(겨울) · 용 · 칼 · 왕관',
  '25-09': '병원 · 비(시애틀) · 의사 · 수술 메스',
  '31-10': '고양이 · 리본 · 사과 · 입이 없음',
  '32-23': '푸른(청) · 산(청산리) · 전투 · 말',
  '38-02': '검색 돋보기 · 지도 · 동영상 · 인공지능',
  '38-04': '햄버거 · 감자튀김 · 노란 M 로고 · 광대 마스코트',
  '38-09': '택배 상자 · 장바구니 · 웃는 얼굴 · 화살표 로고',
  '38-13': '자동차 · 전기 · 배터리 · 로켓',
  '38-17': '라면 · 고추 · 빨간색 · 봉지',
  '38-19': '오토바이 · 치킨 · 포장 음식 · 민트색',
  '38-22': '피자 · 주사위 점 · 빨강 · 파랑 로고',
  '38-23': '도넛 · 커피 · 주황 · 분홍 로고',
  '39-07': '물보라 · 무지개 · 유람선 · 단풍잎(캐나다)',
  '39-09': '라마 · 산 · 구름 · 돌벽',
  '39-15': '섬 · 갈매기 · 독도새우 · 동해',
  '39-16': '롤러코스터 · 판다 · 튤립 · 사파리',
  '39-17': '회전목마 · 풍선 · 성 · 아이스링크',
  '39-20': '피자 · 트레비 분수 · 스쿠터 · 고대 유적',
  '39-22': '빌딩 · 트램 · 딤섬 · 영화',
  '39-34': '카지노 · 주사위 · 에그타르트 · 성당 유적',
  '40-08': '황금 사과 · 반짝임 · 세 여신 · 왕자',
  '40-46': '바위 · 문 · 주문의 마법 · 칼 · 보물',
};
// GEN 이 다시 쓴 힌트(V057 hint 가 힌트 막힘일 때)
const HINT_FIX = {
  '38-17': '1986년 출시 · 빨간 봉지의 매운 국물 봉지면', // V057 안 '… 매운 국물 라면' — 정답 조각(라면)
};
const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const graphemes = (s) => [...seg.segment(s)].map((x) => x.segment);
const SEP = ' — 이모지가 나타내는 ';

const log = { round: 'G069', src: 'audit/v057-emoji2.json', at: new Date().toISOString(), counts: {}, items: [], problems: [] };
const cnt = (k) => { log.counts[k] = (log.counts[k] ?? 0) + 1; };
let skipped = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
  const file = path.join(DIR, f); const doc = J(file); let changed = false;
  for (const it of doc.items) {
    const q = it.question; const ref = it.seed.ref; const v = V[ref];
    if (!v) { log.problems.push(`${ref}: 판정 없음`); continue; }
    if (it.verify?.appliedRound === 'G069') { skipped++; continue; }
    const before = { question: q.question, explanation: q.explanation, generalHint: q.generalHint };
    const rec = { ref, answer: q.answer, verdict: v.verdict, why: v.why, ops: [] };
    cnt(v.verdict);
    if (v.verdict === 'drop') { q.discarded = `V057 drop — ${v.why}`; rec.ops.push('drop'); }
    else if (v.verdict === 'fix') {
      const from = q.emoji.line;
      if (!q.question.startsWith(from + SEP)) { log.problems.push(`${ref}: 이모지 줄이 질문 머리와 다름`); continue; }
      if (v.line && v.line !== from) {
        const g = graphemes(v.line);
        if (g.length < 3 || g.length > 6) log.problems.push(`${ref}: 새 줄 이모지 ${g.length}개`);
        if (/[A-Za-z0-9가-힣]/.test(v.line)) log.problems.push(`${ref}: 새 줄에 글자`);
        if (!WHY[ref]) log.problems.push(`${ref}: 새 풀이 없음`);
        q.question = v.line + q.question.slice(from.length);
        q.emoji.lineG068e = from; q.emoji.line = v.line; q.emoji.whyG068e = q.emoji.why; q.emoji.why = WHY[ref];
        q.explanation = `이모지: ${WHY[ref]}`;
        cnt('line'); rec.ops.push('line');
      }
      if (v.hint && (HINT_FIX[ref] ?? v.hint) !== q.generalHint) { q.generalHint = HINT_FIX[ref] ?? v.hint; cnt('hint'); rec.ops.push('hint'); }
    }
    if (!q.discarded) {
      const g = checkAnswerSet(q.question, q.answer, q.acceptedAnswers, normalizeAnswer, { originalTitles: q.originalTitleVariants });
      if (g.blocked.length) log.problems.push(`${ref}: 질문에 정답 — ${g.blocked.map((b) => b.answer)}`);
      const hc = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers, question: q.question, explanation: q.explanation });
      if (hc.block.length) log.problems.push(`${ref}: 힌트 막힘 — ${hc.block.map((b) => b.frag)} | ${q.generalHint}`);
    }
    it.verify = { round: 'V057', verdict: v.verdict, why: v.why, blind: v.blind, blindHit: v.blindHit, appliedRound: 'G069' };
    changed = true;
    if (rec.ops.length) { rec.before = before; rec.after = { question: q.question, explanation: q.explanation, generalHint: q.generalHint, discarded: q.discarded ?? null }; log.items.push(rec); }
  }
  if (changed && !DRY && !log.problems.length) writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
}
for (const p of log.problems) console.log('★', p);
if (skipped) console.log(`[g069] 이미 적용 ${skipped} — 건너뜀`);
console.log(`[g069] ${JSON.stringify(log.counts)} · 문제 ${log.problems.length}${DRY ? ' · 확인만' : ''}`);
if (log.problems.length) process.exit(1);
if (!DRY && log.items.length) writeFileSync(path.join(AUD, 'g069-emoji2-apply.json'), JSON.stringify(log, null, 1) + '\n');

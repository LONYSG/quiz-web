#!/usr/bin/env node
// =============================================================================
// G030 ② 등급 1·2 힌트 — V033 fix 18 + 해설 fix 2(--part v033) · 안 본 380 의 H2 뜻풀이 후보 고침(--part scan)
//   사용  node scripts/g030-apply-hints12.mjs --part v033|scan [--dry-run | --apply | --undo [--dry-run]]
//   입력  data/pipeline/audit/g030-plan-text.json 의 'hints12-<part>'
//   쓰는 열: general_hint · explanation — 등급 1·2 만 · general_hint_version 은 그대로(hint-v7)
//   되돌리기 audit/g030-undo-hints12.json
// =============================================================================
import { runText } from './g030-text-lib.mjs';
const pi = process.argv.indexOf('--part');
const PART = pi > 0 ? process.argv[pi + 1] : null;
if (!['v033', 'scan'].includes(PART)) { console.error('--part v033|scan'); process.exit(1); }
await runText({ part: `hints12-${PART}`, undoFile: 'g030-undo-hints12.json', tag: `g030 hints12 ${PART}`, cols: ['general_hint', 'explanation'], grades: [1, 2] });

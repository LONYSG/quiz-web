#!/usr/bin/env node
// =============================================================================
// G024 C — 힌트 없는 v2 3+ 520 에 새 힌트(hint-v6 · audit/g024-raw/h-NN.out.json · blind 뒤 다시 쓴 것 h-NN.redo-out.json 이 이김)
//   general_hint · general_hint_version='hint-v6' · 되돌리기 audit/g024-undo-hints.json(id → 옛 {hint: null · version: null})
//   비운 것(H8)·아직 안 쓴 것 → audit/g024-hintless-left.json
//   사용  node scripts/g024-apply-hints.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { run } from './g024-hints-lib.mjs';
import { writeJson, MODE } from './g023-common.mjs';

const r = await run({ task: 'hint', pre: 'h', undoFile: 'g024-undo-hints.json', tag: 'g024 C' });
if (r && MODE !== 'undo') writeJson('g024-hintless-left.json', { round: 'G024', step: 'C', note: '힌트 없는 v2 3+ 가운데 이번에 비운 것(H8 — 사유) · 아직 안 쓴 것', n: r.left.length, items: r.left });

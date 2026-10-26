#!/usr/bin/env node
// =============================================================================
// G024 D — H9 "떠먹여 주기" 293 다시 쓰기(hint-v6 · audit/g024-raw/r-NN.out.json · r-NN.redo-out.json 이 이김)
//   general_hint 교체 · general_hint_version='hint-v6' · 되돌리기 audit/g024-undo-h9.json(옛 힌트 · 옛 version)
//   GEN 이 note 가 틀렸다고 본 것(keep) → audit/g024-h9-kept.json(이유 한 줄)
//   사용  node scripts/g024-apply-h9.mjs [--dry-run | --apply | --undo [--dry-run]]
// =============================================================================
import { run } from './g024-hints-lib.mjs';
import { writeJson, MODE } from './g023-common.mjs';

const r = await run({ task: 'h9', pre: 'r', undoFile: 'g024-undo-h9.json', tag: 'g024 D' });
if (r && MODE !== 'undo') writeJson('g024-h9-kept.json', { round: 'G024', step: 'D', note: 'H9 note 가 틀렸다고 보고 지금 힌트를 둔 것 · 비움/아직', n: r.kept.length, items: r.kept, left: r.left });

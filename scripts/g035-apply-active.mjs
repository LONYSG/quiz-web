#!/usr/bin/env node
// G035 — V037 재정비 1묶음 반영(활성 문항 고침 · 알가치·등급 안 바꿈)
//   step Q 질문 358(GEN 재독 뒤 fix_text) · H 힌트 다시 쓴 것 · V 변형 누락 · F 사실 의심(웹 재확인 뒤 고침)
//   입력 audit/g035-decisions.json · 되돌리기 audit/g035-undo-active.json
//   사용 node scripts/g035-apply-active.mjs [--step Q,H,V,F] [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs(G033 그대로)
import { cli } from './g033-apply-lib.mjs';
const a = process.argv;
if (!a.includes('--step')) a.push('--step', 'Q,H,V,F');
await cli('G035', 'g035-decisions.json', 'g035-undo-active.json', 'G035 Q·H·V·F — V037 질문 재정비 358 + 힌트 다시 + 변형 + 사실 — --undo');

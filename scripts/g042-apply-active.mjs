#!/usr/bin/env node
// G042 — V040 반영 작은 적용(힌트만 · 질문·알가치·등급 안 바꿈)
//   CV-166 fix 12(VERIFY 제안문을 GEN 이 checkHint · crossans 로 거른 뒤 그대로 · 다듬음 · 다시 씀) + CV-167 (a) 핵심 덧붙임 3 다시 씀
//   입력 audit/g042-decisions.json · 되돌리기 audit/g042-undo.json
//   사용 node scripts/g042-apply-active.mjs [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs(G033 그대로)
import { cli } from './g033-apply-lib.mjs';
const a = process.argv;
if (!a.includes('--step')) a.push('--step', 'H');
await cli('G042', 'g042-decisions.json', 'g042-undo.json', 'G042 H — V040 fix 12 + 핵심 덧붙임 3 — --undo');

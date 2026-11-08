#!/usr/bin/env node
// G038 — crossans 전수(CV-162 (a)+(b)) 힌트 다시 쓰기 반영(힌트만 · 질문·알가치·등급 안 바꿈)
//   step H 전수 판정 A(덧붙임)·L(누설) 다시 쓴 힌트 · R G037 ⓒ 54 중 안 받은 12 의 제안문만 다시(V038 분류 그대로)
//   입력 audit/g038-decisions.json · 되돌리기 audit/g038-undo.json
//   사용 node scripts/g038-apply-active.mjs [--step H,R] [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs(G033 그대로)
import { cli } from './g033-apply-lib.mjs';
const a = process.argv;
if (!a.includes('--step')) a.push('--step', 'H,R');
await cli('G038', 'g038-decisions.json', 'g038-undo.json', 'G038 H·R — crossans 전수 덧붙임·누설 힌트 다시 + G037 54 중 12 — --undo');

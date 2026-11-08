#!/usr/bin/env node
// G034 C · E — 활성 문항 고침(C 등급 4 경계 25 · E crossans 막힘) / F — 표기 지정 문항의 다른 표기 변형 삭제 + 1557 질문(--notation)
//   입력 audit/g034-decisions.json(step C · E) 또는 audit/g034-notation.json(step F) · 되돌리기 audit/g034-undo-active.json · g034-undo-notation.json
//   사용 node scripts/g034-apply-active.mjs [--step C|E[,..]] [--notation] [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs(G033 그대로)
import { cli } from './g033-apply-lib.mjs';
const a = process.argv; const nt = a.includes('--notation');
if (!a.includes('--step')) a.push('--step', nt ? 'F' : 'C,E');
await cli('G034', nt ? 'g034-notation.json' : 'g034-decisions.json', nt ? 'g034-undo-notation.json' : 'g034-undo-active.json',
  nt ? 'G034 F — 표기 지정 문항(DG-072)의 다른 표기 변형 삭제 + 1557 질문 되돌림 — --undo' : 'G034 C·E — 등급 4 경계 · crossans 막힘 — --undo');

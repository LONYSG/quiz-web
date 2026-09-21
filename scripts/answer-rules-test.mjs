#!/usr/bin/env node
// =============================================================================
// `pipeline/lib/answer-rules.mjs` 유닛 검사 (API 0회)
//
// ★★ 왜 파일로 남기는가 (R020)
//   D-094 로 이 모듈이 **적재 게이트**가 되었다. 여기가 틀리면 멀쩡한 문항이 잘려 나간다.
//   ★ 실제로 첫 판은 `모델 T ← 포드 모델 T` 와 `DDoS` 를 지울 뻔했다.
//     표본을 손으로 읽어 잡았는데, 그 판단을 **다음 사람이 다시 하게 두면 안 된다.**
//
// 사용법
//   node scripts/answer-rules-test.mjs
// =============================================================================

import { classifyVariant, findAnswerInQuestion, checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';

const variantCases = [
  // [대표 정답, 변형, 기대, 왜]
  ['빈센트 반 고흐', 'Vincent van Gogh', 'drop', '영문 원어 표기 — 프롬프트가 금지한다'],
  ['기린', 'giraffe', 'drop', '영문 원어 표기'],
  ['한라산', '漢拏山', 'drop', '한자 표기'],
  ['팩맨', 'パックマン', 'drop', '가나 표기'],

  ['비디오 판독', 'VAR', 'ok', '★ 약어다. R017~R019 가 억울함 방지로 넣었다'],
  ['디도스', 'DDoS', 'ok', '★ 혼합 약어. 사람이 실제로 치는 표기다'],
  ['리그 오브 레전드', 'LoL', 'ok', '★ 혼합 약어'],
  ['수소', 'H', 'ok', '★ 원소 기호'],

  ['모델 T', '포드 모델 T', 'ok', '★★ 한국어 변형인데 라틴 문자 T 가 섞여 있다 (R020 실측 오분류)'],
  ['하임리히법', '하임리히 manoeuvre', 'ok', '★★ 한글이 섞여 있으면 손대지 않는다'],
  ['에도 막부', '도쿠가와 막부', 'ok', '한국어 변형'],

  ['H2O', 'H₂O', 'ok', '★ 대표 정답에 한글이 없다 — 표기 방식이지 원어 표기가 아니다'],
  ['V2', 'V-2', 'ok', '같은 이유'],
];

const exposeCases = [
  // [질문, 정답, 기대]
  ['무궁화의 학명에 쓰이는 우리나라의 국화 이름은?', '무궁화', 'word'],
  ["원소 기호 'Au'로 표기되는 귀금속 원소는?", '금', 'substring'], // ★ '귀금속' 안이다. 오탐
  ['도, 개, 걸, 윷, 모의 다섯 가지 끗수로 말을 움직이는 놀이는?', '윷', 'word'],
  ['목이 가장 긴 동물은?', '기린', 'none'],
];

let pass = 0;
let fail = 0;
const say = (ok, line) => {
  if (ok) { pass += 1; console.log(`  ok   ${line}`); } else { fail += 1; console.error(`  ★ 실패 ${line}`); }
};

console.log('── classifyVariant');
for (const [display, variant, want, why] of variantCases) {
  const got = classifyVariant(display, variant);
  say(got.verdict === want, `${display} ← ${variant}  기대 ${want} / 실제 ${got.verdict} (${got.kind})  — ${why}`);
}

console.log('\n── findAnswerInQuestion');
for (const [q, a, want] of exposeCases) {
  const got = findAnswerInQuestion(q, a);
  say(got === want, `[${a}] 기대 ${want} / 실제 ${got}`);
}

console.log('\n── checkAnswerSet (적재 게이트가 실제로 쓰는 경로)');
{
  const r = checkAnswerSet('1603년 도쿠가와 이에야스가 에도를 본거지로 세운 무가 정권은?', '에도 막부', ['에도', '江戸幕府']);
  say(r.blocked.some((x) => x.answer === '에도'), `'에도' 가 blocked 에 든다 (실제 ${r.blocked.length}건)`);
  say(r.dropped.some((x) => x.answer === '江戸幕府'), `'江戸幕府' 가 dropped 에 든다 (실제 ${r.dropped.length}건)`);
}
{
  const r = checkAnswerSet('선수가 공을 잡고 세 발 이상 걸으면 선언되는 농구 반칙은?', '트래블링', ['워킹']);
  say(r.blocked.length === 0 && r.dropped.length === 0, '멀쩡한 문항은 아무것도 걸리지 않는다');
}

console.log(`\n[결과] ${pass}건 통과 / ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);

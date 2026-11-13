#!/usr/bin/env node
// =============================================================================
// G068 G-1 — 이모지 2차(조각 21~40 · 567) → 본게임 문항 파일 (★ DB 를 쓰지 않는다 — 읽기만)
//   방법은 1차(scripts/g057-emoji-build.mjs) 그대로: 정답 하나에 문항 하나 · 질문 글 · 정답 변형(B10) · 힌트 · 카테고리 · 점수(emoji-v1)
//   입력  web-desk/emoji/받은것/결과-21~33 · 35~37 · 살림-38 · 39 · 40 (결과-34 빔 · 결과-38~40 · _버림-* 은 안 씀)
//   출력  data/pipeline/generated/g068e/<midKey>-<n>.json · data/pipeline/audit/g068e-{dedupe,variants,hints}.json
//         data/pipeline/audit/g068e-verify-targets.json (VERIFY 전수 · 키 = ref)
//   적재(활성)는 VERIFY 판정(v0NN-emoji2.json) 뒤 G-2 — pipeline-load --round g068e
//
//   node scripts/g068e-emoji-build.mjs            파일 쓰기 (멱등 — generated/g068e 를 지우고 다시 씀)
//   node scripts/g068e-emoji-build.mjs --report   쓰지 않고 문제만 보여 줌
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer, flexCanon } from '../shared/dist/index.js';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { roundDupCheck, lengthCheck, blankCheck } from '../pipeline/lib/question-checks.mjs';
import { subIdOf } from '../pipeline/lib/subid.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const REPORT = process.argv.includes('--report');
const ROUND = 'g068e';
const IN = path.join(ROOT, 'web-desk/emoji/받은것');
const INPUTS = [...Array.from({ length: 13 }, (_, i) => `결과-${21 + i}.json`), '결과-35.json', '결과-36.json', '결과-37.json', '살림-38.json', '살림-39.json', '살림-40.json'];
const J = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const C = (s) => flexCanon(normalizeAnswer(String(s ?? '')));
// 분야 = 조각 파일 이름(보낼것/조각-NN-….txt)
const PIECE = Object.fromEntries(readdirSync(path.join(ROOT, 'web-desk/emoji/보낼것')).map((f) => f.match(/^조각-(\d\d)-(.+)\.txt$/)).filter(Boolean).map((m) => [m[1], m[2]]));

const SRC = [];
for (const f of INPUTS) {
  const j = J(path.join(IN, f));
  j.results.forEach((x, k) => SRC.push({ ...x, ref: `${j.chunk}-${String(k + 1).padStart(2, '0')}`, chunk: j.chunk, field: PIECE[j.chunk] ?? j.field, webField: j.field, file: f }));
}
const BY = Object.fromEntries(SRC.map((x) => [x.ref, x]));

// ── 1. 버리기
//  ① 활성 이모지 문항과 같은 정답(정답 · 변형) — 새것을 버린다 (아래 8 에서 DB 로 다시 확인 · 남으면 멈춤)
//  ② 새 묶음 안 같은 정답 — 이모지 줄이 그 작품 하나로 더 잘 모이는 쪽을 남김(기준 ① 그 작품만의 단서 ② 분야가 맞는 쪽 ③ 같으면 앞 조각)
const KEEP = [
  ['21-11', ['31-32'], '③ 같은 이모지 — 앞 조각(영화 쪽)'],
  ['21-13', ['22-04', '31-42'], '③ 같은 줄(☎️ 집에 전화) — 앞 조각'],
  ['21-21', ['22-05'], '③ 같은 이모지 — 앞 조각'],
  ['21-22', ['22-11', '25-13'], '③ 같은 줄 — 앞 조각 · 25(해외 드라마)의 것은 영화라 분야도 어긋남'],
  ['21-23', ['22-32'], '③ 비슷 — 앞 조각'],
  ['21-24', ['22-12'], '③ 같은 이모지 — 앞 조각'],
  ['22-13', ['21-28'], '같은 영화 — 한국 개봉 제목 "박물관이 살아있다" 쪽을 정답으로(나이트 뮤지엄은 변형)'],
  ['21-29', ['30-20'], '③ 영화 쪽이 앞 조각 · 게임 줄(🏚️🧪)은 영화와 구별이 약함'],
  ['28-28', ['26-21'], '② TV 시리즈라 TV 만화 분야가 맞음 · 줄은 같음'],
  ['26-22', ['28-04'], '① 파란색 · 마을까지 다섯 — 더 구체'],
  ['26-23', ['28-05'], '③ 같은 줄 — 앞 조각'],
  ['28-33', ['26-24'], '① 시금치(🥬) — 작품의 상징'],
  ['26-25', ['28-17'], '변형 겹침(벅스 바니 ↔ 루니 툰) — 토끼 하나로 모이는 캐릭터 쪽'],
  ['26-26', ['31-37'], '③ 같은 줄 — 앞 조각'],
  ['26-27', ['31-06'], '① 휘파람 증기선 — 첫 작품 장면 · 앞 조각'],
  ['26-28', ['28-18'], '① 노란 피부 · TV 까지 — 더 구체'],
  ['26-29', ['28-06', '31-09'], '① 불가사리 · 오징어 이웃까지 다섯 — 더 구체'],
  ['26-30', ['28-03'], '① 스승 쥐 — 더 구체'],
  ['26-31', ['28-16'], '③ 비슷 — 앞 조각'],
  ['28-21', ['27-07'], '① 히소카 카드 · 쿠라피카 사슬 — 작품만의 단서'],
  ['27-08', ['28-02'], '③ 비슷 — 앞 조각'],
  ['28-01', ['27-10'], '① 고글 · 디지털 세계 — 더 구체'],
  ['28-08', ['27-12'], '① 당근 머리 놀림 — 작품만의 장면'],
  ['27-13', ['28-10'], '③ 같은 줄 — 앞 조각'],
  ['27-14', ['28-09'], '① 우유 배달 · 성당 그림 — 앞 조각'],
  ['27-15', ['28-13'], '③ 같은 줄 — 앞 조각'],
  ['31-10', ['38-24'], '① 사과(키티 키 = 사과 다섯 개) — 38 쪽은 고양이 · 리본 · 분홍뿐'],
  ['33-14', ['38-16'], '변형 겹침(디즈니) · 줄이 거의 같음(🐭🏰) — 인물 쪽이 넷으로 더 구체'],
];
const DROP = new Map();
for (const [k, ds, why] of KEEP) for (const d of ds) DROP.set(d, { kind: 'same-new', keep: k, why });
//  ③ 활성 이모지 줄과 3개 이상 같은 순서이고 정답이 다른 것 — 활성 쪽 답을 대도 틀림 처리됨
const SIMILAR = {
  '31-01': '#7483 포켓몬스터 ⚡🐭🔴⚪🧢 와 같은 줄(⚡🐭🔴) — 피카츄 · 포켓몬스터 둘 다 떠오름',
  '31-18': '#7485 드래곤볼 🐉🔮7️⃣🐒 와 같은 줄(🐉🔮🐒) — 손오공 · 드래곤볼 둘 다 떠오름',
  '36-25': '#7709 마른하늘에 날벼락 ☀️🌤️⚡😱 와 같은 줄 · 같은 뜻',
  '39-27': '#8119 네덜란드 🌷🚲🧀🏘️ 와 같은 줄(🌷🚲🧀) — 나라 · 도시 둘 다 떠오름',
  '39-31': '#8127 스위스 🏔️🧀🍫⌚ 와 같은 줄(🏔️🧀🍫) — 나라 · 산맥 둘 다 떠오름',
};
for (const [r, why] of Object.entries(SIMILAR)) DROP.set(r, { kind: 'similar-active', why });
//  ④ 국기 · 글자 · 제목 숫자 이모지(지시서 §2) — 국기 1
DROP.set('25-11', { kind: 'flag', why: '국기 이모지(🇺🇸) — 지시서 §2 v2.4' });

// ── 2. 정답 변형 바로잡기 (다른 것을 가리키는 변형 · 다른 문항과 겹치는 변형)
const ALT_REMOVE = {
  '40-37': ['서유기 손오공', '손오공'], // 인물 이름 — 작품 정답 아님
  '33-14': ['디즈니'], // 회사 이름
  '35-06': ['신라면', '라면 끓이기'], // 상품 이름 · 정답 아님
  '39-05': ['아테네', '파르테논 신전'], // 도시 · 건물 — 나라 정답 아님
  '40-15': ['아테네'], // 도시 이름(여신은 아테나)
  '39-20': ['콜로세움'], // 건물 — 도시 정답 아님
  '26-26': ['찰리 브라운'], // 다른 캐릭터
  '30-12': ['화투'], // 패 이름 — 놀이 정답 아님
  '38-21': ['로켓배송'], // 서비스 이름
  '40-48': ['삼총사 달타냥', '달타냥'], // 인물 이름
  '40-30': ['5000명을 먹인 기적'],
  '40-33': ['유비 관우 장비'],
};
const ALT_ADD = { '22-13': ['나이트 뮤지엄'] };

// ── 3. 영문 변형 — B10(원제 · 상표가 영어)만 originalTitleVariants · 그 밖 영문은 뺀다(약어 꼴은 남김)
const B10_CHUNK = new Set(['21', '22', '25', '26', '38']);
const B10_MIXED = new Set(['28', '30', '31']); // 서양 작품만 — 아래 일본 · 한국 것 빼고
const NOT_B10 = new Set(['피구왕 통키', '미스터 초밥왕', '폭주형제 레츠&고', '고스트 바둑왕', '날아라 호빵맨', '요괴워치', '천사소녀 네티', '헌터x헌터', '디지몬 어드벤처', '카드캡터 체리', '부루마블', '철권', '별의 커비', '갤러그', '드래곤 플라이트', '라이언', '어피치', '루피', '와호장검', '러브레터']);
const isCJK = (v) => /[㐀-䶿一-鿿぀-ヿ]/.test(v);
const isLatin = (v) => /[A-Za-z]/.test(v) && !/[가-힣]/.test(v);
function looksLikeAbbrev(t) { if (/^[A-Z0-9.\- ]+$/.test(t)) return true; const letters = t.replace(/[^A-Za-z]/g, ''); const caps = (t.match(/[A-Z]/g) ?? []).length; if (letters.length <= 5 && caps >= 2) return true; return letters.length <= 3; }
const b10ok = (x) => !NOT_B10.has(x.answer) && (B10_CHUNK.has(x.chunk) || B10_MIXED.has(x.chunk));

// ── 4. 힌트 다시 쓰기 — checkHint 막힘(H2)만. 정답 · 변형 글자를 빼고 같은 정보
const HINT = {
  '21-29': '2002년 밀라 요보비치 주연 좀비 액션 · 엄브렐라 기업',
  '22-16': '2006년 디즈니 채널 · 잭 에프론 주연 학교 노래 영화',
  '22-25': '2009년 리처드 기어 주연, 역에서 주인을 기다린 개',
  '22-27': '2013년 벤 스틸러 감독 · 주연, 잡지사 직원의 모험',
  '24-04': '2021년 신민아 · 김선호 주연 바닷가 동네 로맨스',
  '26-05': '1961년 디즈니, 점박이 개들을 노리는 크루엘라',
  '26-16': '2012년 디즈니, 오락실 게임 속 악역의 모험',
  '28-07': '1990년대 방영, 불꽃슛 소년의 공 던지기 시합 만화',
  '28-19': '1996년 방영, 소년 요리사의 생선 요리 대결 만화',
  '28-22': '1996년 방영, 두 소년이 미니카 경주를 하는 만화',
  '28-23': '2001년 방영, 옛 기사의 혼이 깃든 소년 이야기',
  '28-24': '1975년 방영, 들판을 날아다니는 작은 곤충 소녀',
  '28-25': '2011년 시작, 레고 블록 전사들의 TV 만화',
  '28-30': '2014년 방영, 신비한 손목시계를 찬 소년과 지바냥',
  '29-01': '2024년 넷플릭스 · 안성재 · 백종원 심사 셰프 서바이벌',
  '30-02': '1997년 노키아 휴대폰 속, 먹이를 먹고 길어지는 놀이',
  '30-06': '구멍에서 튀어나오는 동물을 망치로 치는 오락실 기계',
  '30-11': '설날에 말판 위에서 막대 네 개를 던지는 민속 전통',
  '30-14': '낮엔 투표로 범인을 찾고 밤엔 한 명씩 사라지는 파티 놀이',
  '33-28': '20~21세기 · 영국 · 70년 넘게 재위한 군주',
  '37-01': '급한 쪽이 먼저 나서서 일한다는 뜻',
  '37-06': '위에 선 이가 바르게 행동해야 밑에서도 따른다는 뜻',
  '37-07': '무심코 한 이야기가 실제로 이루어진다는 뜻',
  '37-08': '조건이 비슷하면 보기 좋은 것을 고른다는 뜻',
  '37-10': '겉모양이 그럴듯하면 내용도 낫다는 뜻',
  '37-11': '오랜 세월이 흐르면 무엇이든 바뀐다는 뜻',
  '37-15': '꾸준히 애쓰면 무엇이든 이룰 수 있다는 뜻',
  '37-18': '능력 밖의 일은 처음부터 욕심내지 않는 게 낫다는 뜻',
  '37-19': '기대가 컸던 일이 막상 보면 실속이 적다는 뜻',
  '37-22': '가까이 두고도 모르고 엉뚱한 데를 뒤진다는 뜻',
  '37-24': '뻔한 사실을 감추려고 헛수고한다는 뜻',
  '38-17': '1986년 농심 · 매운맛 봉지면',
  '38-19': '한국 음식 주문 앱 · 우아한형제들',
  '38-22': '미국 체인 · 파랑 빨강 주사위 점 로고',
  '38-23': '미국 커피 · 링 모양 빵 체인 · 분홍 주황 로고',
  '39-07': '미국과 캐나다 국경의 거대한 물줄기',
  '39-13': '수도 한가운데 산 위의 전망 탑 · 사랑의 자물쇠',
  '39-18': '흰 곰이 사는 지구 꼭대기 얼음 바다',
  '40-05': '실타래 도움으로 미로 속 소머리 괴물을 무찌른 아테네 영웅',
  '40-08': '가장 아름다운 여신을 고르라던 열매가 트로이 전쟁의 불씨가 된 신화',
  '40-15': '지혜와 전쟁의 여신 · 파르테논 신전의 주인',
  '40-26': '맹수 우리에 던져졌지만 기도로 무사했던 성경 속 예언자',
  '40-29': '재산을 다 쓰고 아버지 품으로 되돌아간 아들 — 예수의 가르침',
  '40-30': '작은 도시락으로 수많은 사람을 먹였다는 예수의 일',
  '40-31': '두 여인이 한 아기의 엄마라고 다툰 이스라엘 왕의 판결',
  '40-32': '마구간 구유와 별빛 따라 찾아온 세 손님',
  '40-33': '삼국지에서 세 영웅이 형제가 되기로 한 장면',
  '40-39': '작은 동물이 그물에 걸린 맹수를 구해 준 이솝 우화',
  '40-40': '화려한 곳과 조용한 곳의 삶을 견주는 이솝 우화',
  '40-41': '아첨에 속아 입에 문 먹이를 떨어뜨린 이솝 우화',
};

// ── 5. 질문 갈래 · 카테고리 · 점수
const GENRE = { 21: '외국 영화', 22: '외국 영화', 23: '한국 영화', 24: '한국 드라마', 25: '해외 드라마', 26: '서양 애니메이션', 27: '일본 애니메이션', 28: 'TV 만화', 29: '예능·TV 프로그램', 30: '게임·놀이', 31: '캐릭터', 32: '한국사 인물', 33: '세계 인물', 35: '음식', 36: '사자성어', 37: '속담', 38: '브랜드', 39: '나라·도시·명소', 40: '신화·성경·고전 이야기' };
const GENRE_ONE = { '28-11': '어린이 TV 시리즈' }; // 말괄량이 삐삐 — 실사 드라마
const josa = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c % 28 ? '은' : '는'; };
const ACC5 = new Set(['21', '22', '23', '24', '25', '29', '32', '33', '35', '36', '37', '38', '39']);
const MEDIA = ['kr-screen', 'world-cinema', 'animation', 'comics', 'kr-tv', 'esports', 'kr-music']; // 1차와 같은 묶음(brands · board-game 은 2 면 선별 게이트에서 빠진다 → 3)
const NON_US = new Set(['러브레터', '와호장검', '레옹', '고질라']);
const DISNEY_FILM = new Set(['피터 팬', '덤보', '밤비', '101마리 달마시안', '포카혼타스', '노트르담의 꼽추', '뮬란', '헤라클레스', '타잔', '이상한 나라의 앨리스', '잠자는 숲속의 공주', '공주와 개구리', '벅스 라이프', '주먹왕 랄프', '씽', '폴라 익스프레스', '크리스마스의 악몽', '장화 신은 고양이', '레이디와 트램프']);
const JP_TV = new Set(['카드캡터 체리', '디지몬 어드벤처', '피구왕 통키', '미스터 초밥왕', '헌터x헌터', '폭주형제 레츠&고', '고스트 바둑왕', '꿀벌 마야의 모험', '날아라 호빵맨', '요괴워치', '천사소녀 네티', '빨간 머리 앤']);
const GAME30 = { 지뢰찾기: 0 };
const BOARD = { 부루마블: '보드게임', 젠가: '보드게임', 할리갈리: '보드게임', 윷놀이: null, 고스톱: '화투·카드', 체스: '체스', '마피아 게임': '보드게임', 방탈출: '퍼즐' };
const CHAR31 = {
  라이언: ['brands', '로고·상징'], 어피치: ['brands', '로고·상징'], 헬로키티: ['brands', '로고·상징'],
  엘사: ['animation', '디즈니·픽사 극장 애니메이션'], 올라프: ['animation', '디즈니·픽사 극장 애니메이션'], 팅커벨: ['animation', '디즈니·픽사 극장 애니메이션'], 스티치: ['animation', '디즈니·픽사 극장 애니메이션'],
  루피: ['comics', '일본 만화'], 배트맨: ['comics', '미국 코믹스·히어로'], 루돌프: ['calendar', '세계 명절·축제'],
};
const P32 = {
  을지문덕: '삼국·통일신라', 계백: '삼국·통일신라', 김유신: '삼국·통일신라', 장보고: '삼국·통일신라', 원효: '삼국·통일신라', 이사부: '삼국·통일신라', 의자왕: '삼국·통일신라',
  서희: '고려', 왕건: '고려', 정몽주: '고려', 최영: '고려', 문익점: '고려', 최무선: '고려',
  이성계: '조선 전기', 연산군: '조선 전기', 황진이: '조선 전기', 논개: '조선 전기', 권율: '조선 전기', 곽재우: '조선 전기',
  사도세자: '조선 후기', 김홍도: '조선 후기', 신윤복: '조선 후기', 김정희: '조선 후기', 박문수: '조선 후기', 흥선대원군: '조선 후기',
  고종: '개항기·일제강점기', 전봉준: '개항기·일제강점기', 서재필: '개항기·일제강점기', 윤봉길: '개항기·일제강점기', 김좌진: '개항기·일제강점기', 손기정: '개항기·일제강점기', 방정환: '개항기·일제강점기', 한용운: '개항기·일제강점기',
  박정희: '대한민국 현대', 김대중: '대한민국 현대', 전태일: '대한민국 현대',
};
const P33 = {
  '스티브 잡스': ['brands', '기업 창업·역사'], '월트 디즈니': ['animation', '제작사·스튜디오'], '코코 샤넬': ['fashion', '패션 브랜드·디자이너'],
  '마이클 잭슨': ['popular-music', '밴드·아티스트'], '존 레논': ['popular-music', '밴드·아티스트'], '프레디 머큐리': ['popular-music', '밴드·아티스트'],
  '찰리 채플린': ['world-cinema', '배우·영화인'], '마릴린 먼로': ['world-cinema', '배우·영화인'], '오드리 헵번': ['world-cinema', '배우·영화인'], 이소룡: ['world-cinema', '배우·영화인'],
  '무하마드 알리': ['combat-athletics', '격투기·복싱'], '우사인 볼트': ['combat-athletics', '육상'], '마이클 조던': ['ball-sports', '농구'], 마라도나: ['football', '월드컵'],
  석가모니: ['religion', '불교'], '마르틴 루터': ['religion', '기독교·성경'], 공자: ['philosophy', '동양 사상'], 프로이트: ['psychology', '심리학자·유명 실험'],
  '스티븐 호킹': ['physics', '현대 물리'], 파스퇴르: ['invention', '의학·생명 분야 발견'], '알렉산더 플레밍': ['invention', '의학·생명 분야 발견'], 구텐베르크: ['world-history-west', '르네상스·대항해'],
  '알프레드 노벨': ['invention', '산업혁명기 발명'], 안데르센: ['world-lit', '19세기 소설'], 이솝: ['world-lit', '고전(고대~18세기)'], 미켈란젤로: ['art', '조각'],
  '닐 암스트롱': ['world-history-west', '미국사'], '조지 워싱턴': ['world-history-west', '미국사'], '마틴 루서 킹': ['world-history-west', '미국사'],
  '윈스턴 처칠': ['world-history-west', '20세기 서양'], '넬슨 만델라': ['world-history-west', '20세기 서양'], '체 게바라': ['world-history-west', '20세기 서양'], 슈바이처: ['world-history-west', '20세기 서양'], '엘리자베스 2세': ['world-history-west', '20세기 서양'],
  '마리 앙투아네트': ['world-history-west', '근대 유럽·혁명'], '마르코 폴로': ['world-history-west', '중세 유럽'],
  '알렉산더 대왕': ['world-history-west', '고대 그리스·로마'], '율리우스 카이사르': ['world-history-west', '고대 그리스·로마'], 아르키메데스: ['world-history-west', '고대 그리스·로마'], 네로: ['world-history-west', '고대 그리스·로마'], 한니발: ['world-history-west', '고대 그리스·로마'],
  '도요토미 히데요시': ['world-history-east', '일본사'], 제갈량: ['world-history-east', '중국 왕조'],
};
const KR_FOOD = {
  김치찌개: '밥·국·찌개', 비빔밥: '밥·국·찌개', 삼계탕: '밥·국·찌개', 미역국: '밥·국·찌개', 떡국: '밥·국·찌개', 부대찌개: '밥·국·찌개', 짬뽕: '분식·길거리 음식', 짜장면: '분식·길거리 음식', 냉면: '향토 음식',
  삼겹살: '향토 음식', 족발: '향토 음식', 닭갈비: '향토 음식', 육회: '향토 음식', 회: '향토 음식', 치맥: '분식·길거리 음식', 파전: '향토 음식',
  떡볶이: '분식·길거리 음식', 라면: '분식·길거리 음식', 김밥: '분식·길거리 음식', 호떡: '분식·길거리 음식', 붕어빵: '분식·길거리 음식', 군고구마: '분식·길거리 음식',
  송편: '떡·한과·전통 음료', 팥죽: '떡·한과·전통 음료',
};
const WORLD_FOOD = { 초밥: '아시아 음식', 케밥: '아시아 음식', 쌀국수: '아시아 음식', 오므라이스: '아시아 음식', 돈가스: '아시아 음식', 똠얌꿍: '아시아 음식', 티라미수: '유럽 음식', 퐁듀: '유럽 음식', 피시앤칩스: '유럽 음식', 까르보나라: '유럽 음식' };
const GEO39 = {
  그리스: '국가·수도', 멕시코: '국가·수도', 뉴질랜드: '국가·수도', 베트남: '국가·수도', 러시아: '국가·수도', 튀르키예: '국가·수도',
  로마: '도시 별칭', 홍콩: '도시 별칭', 시드니: '도시 별칭', 마카오: '도시 별칭', 북극: '대륙·바다',
};
const KRGEO39 = { 독도: ['kr-geo', '섬·해안'] };
function category(x) {
  const y = x.year; const a = x.answer;
  switch (x.chunk) {
    case '21': case '22': return ['world-cinema', NON_US.has(a) ? '유럽·아시아 영화' : y != null && y < 2000 ? '할리우드 고전' : '현대 할리우드'];
    case '23': return ['kr-screen', a === '님아 그 강을 건너지 마오' ? '한국 독립·예술영화' : y != null && y < 2000 ? '1990년대 이전 한국 영화' : '2000년대 이후 한국 영화'];
    case '24': return ['kr-screen', '한국 드라마'];
    case '25': return ['world-cinema', '해외 드라마'];
    case '26': return ['animation', DISNEY_FILM.has(a) ? '디즈니·픽사 극장 애니메이션' : '서양 TV 애니메이션'];
    case '27': return ['animation', '일본 애니메이션'];
    case '28': return a === '말괄량이 삐삐' ? ['world-cinema', '해외 드라마'] : a === '미라큘러스 레이디버그' ? ['animation', '유럽 애니메이션'] : ['animation', JP_TV.has(a) ? '일본 애니메이션' : '서양 TV 애니메이션'];
    case '29': return ['kr-tv', '예능 프로그램'];
    case '30': if (a === '윷놀이') return ['kr-tradition', '민속놀이']; if (a in BOARD) return ['board-game', BOARD[a]];
      if (['두더지 잡기', '인형 뽑기', '갤러그', '철권', '별의 커비', '디아블로', '그랜드 테프트 오토', '펌프 잇 업', '스네이크'].includes(a)) return ['esports', '고전 게임(1980~90년대)'];
      return ['esports', 'PC·온라인 게임'];
    case '31': return CHAR31[a] ?? null;
    case '32': return P32[a] ? ['kr-history', P32[a]] : null;
    case '33': return P33[a] ?? null;
    case '35': return KR_FOOD[a] ? ['kr-food', KR_FOOD[a]] : WORLD_FOOD[a] ? ['world-food', WORLD_FOOD[a]] : null;
    case '36': return ['kr-language', '사자성어'];
    case '37': return ['kr-language', '속담·관용어'];
    case '38': return ['brands', '로고·상징'];
    case '39': return KRGEO39[a] ?? ['world-geo', GEO39[a] ?? '랜드마크·지형'];
    case '40': {
      const n = Number(x.ref.slice(3));
      if (n <= 16) return ['myth', '그리스·로마 신화'];
      if (n <= 32) return ['religion', '기독교·성경'];
      if (n <= 37) return ['world-lit', '동아시아 문학'];
      if (a === '햄릿') return ['world-lit', '시·희곡'];
      if (a === '삼총사') return ['world-lit', '19세기 소설'];
      return ['world-lit', '고전(고대~18세기)'];
    }
  }
  return null;
}
const genreOf = (x) => {
  if (GENRE_ONE[x.ref]) return GENRE_ONE[x.ref];
  if (x.chunk === '40') { const n = Number(x.ref.slice(3)); return n <= 16 ? '신화' : n <= 32 ? '성경 이야기' : '고전 이야기'; }
  return GENRE[Number(x.chunk)];
};

// ── 6. 만들기 — 먼저 활성 이모지 문항(정답 · 변형)을 읽는다: 같은 정답이면 새것을 버린다 (DB 읽기만)
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const act = (await c.query(`select q.id::int, q.question_text, q.display_answer, coalesce((select array_agg(answer_text) from question_answers x where x.question_id=q.id),'{}') ans
  from questions q where q.is_active and q.question_text like '%이모지가 나타내는%'`)).rows;
await c.end();
const actKey = new Map(); for (const r of act) for (const a of [r.display_answer, ...r.ans]) { const k = C(a); if (!actKey.has(k)) actKey.set(k, []); actKey.get(k).push(r); }
const sameActive = [];
const problems = []; const variantLog = []; const hintLog = []; const out = [];
for (const x of SRC) {
  if (DROP.has(x.ref)) continue;
  const rm = ALT_REMOVE[x.ref] ?? [];
  const alts = [...(x.alt ?? []).filter((v) => !rm.includes(v)), ...(ALT_ADD[x.ref] ?? [])];
  for (const v of rm) variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'remove-wrong', why: '다른 것을 가리키는 변형 · 다른 문항과 겹침' });
  const acc = []; const otv = []; const seenN = new Set([normalizeAnswer(x.answer)]);
  for (const v of alts) {
    const n = normalizeAnswer(v);
    if (seenN.has(n)) { variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'drop-redundant', why: '정규화하면 이미 있는 표기' }); continue; }
    if (isCJK(v)) { variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'drop-cjk', why: '한자 · 가나 원어 표기' }); continue; }
    if (isLatin(v) && /[가-힣]/.test(x.answer)) {
      if (b10ok(x)) { otv.push(v); acc.push(v); seenN.add(n); continue; }
      if (looksLikeAbbrev(v)) { acc.push(v); seenN.add(n); continue; }
      variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'drop-latin', why: '한국어 이름이 따로 있는 대상의 영문 표기(B4)' });
      continue;
    }
    acc.push(v); seenN.add(n);
  }
  const hit = [...new Set([x.answer, ...acc].flatMap((a) => actKey.get(C(a)) ?? []))];
  if (hit.length) {
    sameActive.push({ ref: x.ref, answer: x.answer, emoji: x.emoji, active: hit.map((r) => ({ id: r.id, answer: r.display_answer, q: r.question_text })) });
    DROP.set(x.ref, { kind: 'same-active', why: `활성 이모지 문항과 같은 정답 — ${hit.map((r) => `#${r.id} ${r.display_answer}`).join(' · ')}` }); continue;
  }
  const [midKey, sub] = category(x) ?? [];
  if (!midKey) { problems.push(`${x.ref} ${x.answer}: 카테고리 없음`); continue; }
  let subId; try { subId = subIdOf(midKey, sub); } catch (e) { problems.push(`${x.ref} ${x.answer}: ${e.message}`); continue; }
  const genre = genreOf(x);
  const question = `${x.emoji} — 이모지가 나타내는 ${genre}${josa(genre)}?`;
  const hint = HINT[x.ref] ?? x.hint;
  if (HINT[x.ref]) hintLog.push({ ref: x.ref, answer: x.answer, before: x.hint, after: hint });
  const explanation = `이모지: ${x.why}`;
  const wor = MEDIA.includes(midKey) ? 2 : 3;
  const accS = ACC5.has(x.chunk) ? 5 : 4;
  out.push({
    ref: x.ref, chunk: x.chunk, field: x.field, subId, midKey, sub,
    rec: {
      seedId: `${subId}#${ROUND}-${x.ref}`,
      seed: { subject: x.answer, aspect: null, ref: x.ref, chunk: x.chunk, field: x.field },
      question: {
        ok: true, mode: 'emoji', pairedWith: null,
        question, answer: x.answer, acceptedAnswers: acc, originalTitleVariants: otv,
        explanation,
        score: { version: 'emoji-v1', acc: accS, accWhy: `이모지 문항 — 분야 기준(${x.field} ${accS})`, dif: x.diff + 1, difWhy: `이모지 문항 — 웹 diff ${x.diff} → ${x.diff + 1}`, wor, worWhy: `이모지 문항 — 분야 기준(${wor === 2 ? '미디어 묶음' : '상식 · 문학 · 지리'} ${wor})` },
        generalHint: hint, generalHintVersion: 'emoji-v1',
        emoji: { line: x.emoji, why: x.why, year: x.year ?? null, webHint: x.hint, webAlt: x.alt },
      },
    },
  });
}

// ── 7. 기계 검사 (게이트와 같은 함수)
const byN = new Map();
for (const o of out) for (const a of [o.rec.question.answer, ...o.rec.question.acceptedAnswers]) { const k = C(a); if (byN.has(k) && byN.get(k) !== o.ref) problems.push(`같은 정답 · 변형 남음: ${o.ref} ↔ ${byN.get(k)} (${a})`); byN.set(k, o.ref); }
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
for (const o of out) {
  const q = o.rec.question;
  const hc = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers, question: q.question, explanation: q.explanation });
  if (hc.block.length) problems.push(`${o.ref} ${q.answer}: 힌트 H2 막힘 — ${hc.block.map((b) => b.frag).join(',')} | ${q.generalHint}`);
  const g = checkAnswerSet(q.question, q.answer, q.acceptedAnswers, normalizeAnswer, { originalTitles: q.originalTitleVariants });
  if (g.blocked.length) problems.push(`${o.ref} ${q.answer}: 질문에 정답 — ${g.blocked.map((b) => b.answer)}`);
  if (g.dropped.length) problems.push(`${o.ref} ${q.answer}: 변형 떨어짐 — ${g.dropped.map((d) => `${d.answer}(${d.kind})`)}`);
  if (!lengthCheck(q.question).ok) problems.push(`${o.ref}: 질문 길이`);
  if (!blankCheck(q.question, q.answer).ok) problems.push(`${o.ref}: 빈칸`);
  const gs = [...seg.segment(q.emoji.line)].map((s) => s.segment);
  if (gs.some((s) => /[0-9#*]️?⃣|\u{1F51F}/u.test(s))) problems.push(`${o.ref}: 숫자 이모지`);
  if (gs.some((s) => /[\u{1F1E6}-\u{1F1FF}]/u.test(s))) problems.push(`${o.ref}: 국기`);
  if (/[A-Za-z0-9가-힣]/.test(q.emoji.line.replace(/[0-9#*]️?⃣/g, '').replace(/️/g, '')) || gs.some((s) => /[\u{1F170}-\u{1F19A}\u{1F520}-\u{1F524}ℹⓂ]/u.test(s))) problems.push(`${o.ref}: 이모지 줄에 글자`);
}
const dups = roundDupCheck(out.map((o) => ({ ref: o.ref, question: o.rec.question.question, answer: o.rec.question.answer, explanation: o.rec.question.explanation })), normalizeAnswer);
for (const d of dups) problems.push(`roundDup ${d.kind}: ${d.a} ↔ ${d.b} (${d.detail})`);

if (REPORT || problems.length) {
  for (const p of problems) console.log('★', p);
  console.log(`[${ROUND}] 남음 ${out.length} / 버림 ${DROP.size}(활성과 같음 ${sameActive.length}) · 문제 ${problems.length}`);
  process.exit(problems.length ? 1 : 0);
}

// ── 9. 쓰기
const dir = path.join(ROOT, 'data/pipeline/generated', ROUND);
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
const bySub = new Map();
for (const o of out) { if (!bySub.has(o.subId)) bySub.set(o.subId, []); bySub.get(o.subId).push(o.rec); }
for (const [subId, items] of [...bySub].sort()) {
  const [midKey, n] = subId.split('/');
  writeFileSync(path.join(dir, `${midKey}-${n}.json`), JSON.stringify({
    _meta: { round: ROUND, subId, midKey, questionPrompt: 'emoji-v2.4(web-desk/emoji/지시서.md)', scorePrompt: 'emoji-v1(분야 기준)', hintPrompt: 'emoji-v1(웹 hint · H2 막힘만 GEN 다시 씀)', generator: 'claude(web-desk 웹 계정)', questionGenerator: 'claude(web-desk 웹 계정)', builder: 'scripts/g068e-emoji-build.mjs (claude-opus-5-5)', stage: 'emoji', generatedAt: new Date().toISOString(),
      note: 'G068 G-1 — 이모지 2차(조각 21~40). 적재하지 않았다. VERIFY(v0NN-emoji2.json) 판정 뒤 G-2 가 고쳐서 pipeline-load --round g068e 활성 적재' },
    items }, null, 1) + '\n');
}
const AUD = path.join(ROOT, 'data/pipeline/audit');
const dropList = [...DROP].map(([ref, d]) => ({ ref, field: BY[ref].field, answer: BY[ref].answer, emoji: BY[ref].emoji, ...d, ...(d.keep ? { keptEmoji: BY[d.keep].emoji } : {}) }));
writeFileSync(path.join(AUD, `${ROUND}-dedupe.json`), JSON.stringify({ received: SRC.length, kept: out.length, dropped: dropList.length, sameActive, items: dropList }, null, 1) + '\n');
writeFileSync(path.join(AUD, `${ROUND}-variants.json`), JSON.stringify(variantLog, null, 1) + '\n');
writeFileSync(path.join(AUD, `${ROUND}-hints.json`), JSON.stringify(hintLog, null, 1) + '\n');
const targets = out.map((o) => ({ key: o.ref, field: o.field, category: `${o.midKey} > ${o.sub}`, line: o.rec.question.emoji.line, question: o.rec.question.question, answer: o.rec.question.answer, accepted: o.rec.question.acceptedAnswers, hint: o.rec.question.generalHint, why: o.rec.question.emoji.why, year: o.rec.question.emoji.year,
  check: ['블라인드(줄 + 분야만)', '유일성(같은 분야 다른 유명 작품)', '숫자 · 국기 · 글자 이모지 · 색만 · 어디에나 맞는 풍경', '한국에서 누구나 아나(1990년대생)', '힌트가 정답을 새나'] }));
writeFileSync(path.join(AUD, `${ROUND}-verify-targets.json`), JSON.stringify({ round: 'G068', note: '이모지 2차 전수 — 키 = key(조각-순번) · 결과 v0NN-emoji2.json { key: { verdict: ok|fix|drop, line?, hint?, why } }', n: targets.length, targets }, null, 1) + '\n');
const cat = {}; for (const o of out) { const k = `${o.chunk} ${o.field} → ${o.midKey} > ${o.sub}`; cat[k] = (cat[k] ?? 0) + 1; }
console.log(JSON.stringify(cat, null, 1));
const kinds = {}; for (const d of dropList) kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
console.log(`[${ROUND}] ${SRC.length} → ${out.length} (버림 ${dropList.length} ${JSON.stringify(kinds)}) · 파일 ${bySub.size} · 영문 뺌 ${variantLog.filter((v) => v.action === 'drop-latin').length} · 힌트 다시 씀 ${hintLog.length}`);

#!/usr/bin/env node
// =============================================================================
// G057 — 이모지 제목 퀴즈(web-desk/emoji/_merged.json 837) → 본게임 문항 파일 (★ DB 를 쓰지 않는다 — 카테고리 읽기만)
//   정답 하나에 문항 하나로 합치고(찬종 결정) · 질문 글 · 정답 변형(B10) · 힌트 · 카테고리 · 점수(emoji-v1)를 붙여
//   data/pipeline/generated/g057/<midKey>-<n>.json 으로 쓴다 — pipeline-load --round g057 --gate-only 가 읽는다.
//   적재(활성)는 V050 판정 뒤 G058.
//
//   node scripts/g057-emoji-build.mjs            파일 쓰기 (멱등 — generated/g057 를 지우고 다시 씀)
//   node scripts/g057-emoji-build.mjs --report   쓰지 않고 힌트 막힘 · 변형 처리만 보여 줌
//   출력  data/pipeline/generated/g057/*.json · data/pipeline/audit/g057-{dedupe,sameanswer,variants,hints}.json · tmp/g057/items.json
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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
const ROUND = 'g057';
const SRC = J(path.join(ROOT, 'web-desk/emoji/_merged.json'));
function J(p) { return JSON.parse(readFileSync(p, 'utf8')); }

// ── 0. ref — 조각 + 조각 안 순번 (01 은 두 벌: 01-01~40 = 결과-01.json · 01-41~80 = 결과-01_sample.json)
const seen = {};
SRC.forEach((x, i) => { seen[x.chunk] = (seen[x.chunk] ?? 0) + 1; x.i = i; x.ref = `${x.chunk}-${String(seen[x.chunk]).padStart(2, '0')}`; });

// ── 1. 합치기 — 정답이 같은 묶음에서 남길 하나 (기준: ① 이모지 줄로 그 작품만 ② 분야가 더 맞는 쪽 ③ 앞 조각)
//   key = _merged 의 전역 번호(#). KEEP[keep] = [버린 것들, 이유]
const KEEP = [
  [55, [0], '① 열대어(키싱구라미) · 폭탄 · 경기장 — 장면이 더 구체'],
  [61, [1], '① 돌아오지 않는 다리가 들어가 더 구체'],
  [2, [60], '① 부산 바다 · 담배 — 더 구체(칼은 흔함)'],
  [54, [3], '① 구토 장면이 상징적'],
  [4, [47], '① 빨간 옷 — 사건의 상징'],
  [5, [46], '③ 같은 줄 — 앞 벌'],
  [6, [50], '① 혹독한 훈련 — 비슷하면 앞 벌'],
  [7, [49], '① 피난 열차 — 비슷하면 앞 벌'],
  [8, [67], '③ 같은 줄 — 앞 벌'],
  [9, [286], '① 07 쪽 👑🎭 는 광해와 겹침 · 두 남자 놀이판이 더 맞음'],
  [10, [68], '① 팝콘 장면이 상징적'],
  [11, [48], '① 한강 다리 · 양궁 — 더 구체'],
  [64, [12, 462, 567], '② 영화(찬종 예) · ① 화투 + 손 + 칼(손목) 장면'],
  [13, [281], '① 망치 — 사건의 상징'],
  [14, [62], '① 라디오 DJ · 과속(경주차) — 더 구체'],
  [15, [51], '③ 비슷 — 앞 벌'],
  [16, [79], '① 수염 아저씨 · 전당포 — 제목과 장면 둘 다'],
  [282, [17], '① 안개(무진) — 작품만의 단서'],
  [18, [307], '① 카지노 · 외벽 타기 — 더 구체'],
  [19, [57], '① 가면극 · 똑같은 두 사람 — 비슷하면 앞 벌'],
  [59, [20], '① 전람회 CD · 버스 — 작품만의 소품'],
  [21, [53], '③ 같은 줄 — 앞 벌'],
  [58, [22], '① 돼지국밥이 또렷'],
  [23, [279], '① 열세 척 — 07 쪽 줄은 한산과도 겹침'],
  [24, [44], '③ 같은 이모지 — 앞 벌'],
  [25, [45], '① 어이없다는 표정(유행어) · 대기업 — 45 는 흔한 이모지뿐'],
  [26, [72], '① 경성 거리까지 다섯 — 더 구체'],
  [27, [41], '③ 같은 줄 — 앞 벌'],
  [52, [28], '① 바리케이드 — 사건 단서'],
  [29, [43, 463, 578], '① 소방관(주인공) — 영화 · 웹툰 다 떠오르는 줄 중 가장 구체 · ② 영화가 더 널리'],
  [30, [56], '① 56 은 지시서가 피하라 한 흔한 줄(🚔👊🔪🌃)'],
  [31, [300], '③ 같은 줄 — 앞 조각'],
  [32, [40], '① 반지하 집 — 더 구체'],
  [33, [42], '① 잠복 형사 · 가게 — 42 는 셋뿐'],
  [69, [34], '① 구조 헬기 — 더 구체'],
  [35, [315], '① 남북 협력 — 작품 단서'],
  [37, [291], '③ 비슷 — 앞 조각'],
  [293, [38], '① 서울 + 봄 — 제목 단서가 또렷'],
  [292, [39], '① 일본 도깨비(오니) — 작품만의 단서'],
  [65, [470], '② 영화(웹툰은 미완) · ① 술자리 · 신문'],
  [94, [351], '① 계단 춤 — 비슷하면 앞 조각'],
  [131, [472], '② 드라마가 더 널리 · ① 비슷'],
  [473, [136, 592], '① 아파트 · 스위트 · 괴물 · 갇힘 — 가장 또렷'],
  [137, [476], '② 드라마가 더 널리 · ① 476 의 개는 낯섦'],
  [138, [475, 590], '② 드라마가 더 널리 · ① 국정원 요원'],
  [471, [142, 591], '① 단밤(🌰) — 작품만의 단서'],
  [464, [148, 583], '① ⚫⚪ 바둑돌(148 의 ♟️ 는 체스) — 비슷하면 앞 조각'],
  [161, [352, 494], '② 디즈니 애니가 가장 널리 · ① 셋 다 또렷'],
  [162, [487], '② 디즈니 애니 · ① 세바스찬(게)'],
  [163, [480], '① 일곱 난쟁이(7️⃣) · ② 디즈니'],
  [180, [482], '② 디즈니 애니(한국 제목 라푼젤) · ① 프라이팬 · 등불'],
  [247, [287], '같은 제목 다른 작품 — 예능이 지금 세대에 더 널리 · 정답 하나에 문항 하나'],
  [775, [384], '② 인물 쪽이 세대를 덜 탐(드라마 1999)'],
  [410, [559], '② 애니(찬종 예)'],
  [413, [524], '① 트레이너 모자 · ② 애니'],
  [415, [566], '① 일곱 개(7️⃣) — 구슬이 또렷'],
  [416, [560], '③ 비슷 — 앞 조각'],
  [417, [598], '③ 비슷 — 앞 조각'],
  [419, [570], '③ 같은 이모지 — 앞 조각'],
  [423, [569], '① 땅콩 · 개 · 집 다섯 — 비슷하면 앞 조각'],
  [439, [561], '③ 비슷 — 앞 조각'],
  [441, [564], '① 엄마 · 눈물 — 더 구체'],
  [454, [562], '③ 같은 줄 — 앞 조각'],
  [571, [455], '① 손오공 원숭이 · 학습서 — 작품 단서'],
  [460, [563], '③ 비슷 — 앞 조각'],
  [568, [461], '① 요리사 · 젓가락 — 더 또렷'],
  [465, [572], '① 마음(❤️) + 소리(🔊) — 제목이 또렷'],
  [579, [466], '① 치즈 + 덫(🪤) — 제목이 또렷'],
  [467, [594], '③ 비슷 — 앞 조각'],
  [468, [593], '③ 비슷 — 앞 조각'],
  [469, [573], '③ 비슷 — 앞 조각'],
  [474, [565], '③ 비슷 — 앞 조각'],
  [588, [477], '① 세포(🦠) — 제목 단서'],
  // ★ 정답은 다르지만 정답 변형이 겹치고 이모지 줄이 거의 같은 것 — 한 판에 둘이면 같은 답을 두 번 받는다
  [440, [256], '변형 겹침(뽀로로) — 같은 작품 · ① 에디(여우)까지 더 구체 · 06(예능) 보다 11 이 분야에 맞음'],
  [212, [762], '변형 겹침(단군) — 이모지 줄 같음(곰 · 마늘 · 쑥 · 산) · 이야기 쪽이 줄에 맞음'],
  [227, [778], '변형 겹침(한석봉) — 같은 떡 썰기 일화 · 이야기 쪽이 줄에 맞음'],
  [759, [373], '변형 겹침(이순신) — 이모지 줄 거의 같음(거북선 · 배 · 칼) · 인물이 세대를 덜 탐'],
];
const DROP = new Map();
for (const [k, ds, why] of KEEP) for (const d of ds) DROP.set(d, { keep: k, why });

// ── 2. 정답 변형 바로잡기 (사실 오류만)
const ALT_REMOVE = { 202: ['토끼와 거북이'] }; // 별주부전 ≠ 이솝 '토끼와 거북이'(따로 문항 #496)

// ── 3. 영문 변형 — B10(원제·상표가 영어)인 것만 originalTitleVariants. 그 밖 영문은 뺀다(약어 꼴은 남김)
const B10_CHUNK = new Set(['02', '04', '08']);
const NOT_B10 = new Set(['어느 가족', '크레이지 아케이드', '메이플스토리', '카트라이더', '던전앤파이터', '애니팡', '쿠키런', '로스트아크', '서든어택', '원신']);
const B10_ANS = new Set([
  // 13 게임(서양 · 일본 원제가 영문)은 아래 chunk 규칙 · 그 밖 개별
  '텔레토비', '원피스', '스파이 패밀리', '나루토',
  '로빈슨 크루소', '걸리버 여행기', '이상한 나라의 앨리스', '오즈의 마법사', '피터 팬', '로미오와 줄리엣', '드라큘라', '크리스마스 캐럴', '아낌없이 주는 나무', '잭과 콩나무',
  '붐바야', '피카부', '에너제틱', '뚜두뚜두', '돌핀', '안티프래자일', 'APT.', '판타스틱 베이비', '아브라카다브라', '링딩동', 'NoNoNo',
]);
const isCJK = (v) => /[㐀-䶿一-鿿぀-ヿ]/.test(v);
const isLatin = (v) => /[A-Za-z]/.test(v) && !/[가-힣]/.test(v);
function looksLikeAbbrev(t) { // answer-rules 와 같은 판정
  if (/^[A-Z0-9.\- ]+$/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, ''); const caps = (t.match(/[A-Z]/g) ?? []).length;
  if (letters.length <= 5 && caps >= 2) return true;
  return letters.length <= 3;
}
const b10ok = (x) => !NOT_B10.has(x.answer) && (B10_CHUNK.has(x.chunk) || x.chunk === '13' || B10_ANS.has(x.answer));

// ── 4. 힌트 다시 쓰기 — checkHint 막힘(H2)만. 정답 글자를 빼고 같은 정보(연도 · 장르 · 주연 · 뜻)
const HINT = {
  18: '2012년 최동훈 감독 보석 강탈 범죄 영화 · 김윤석 전지현',
  78: '2006년 김아중 주연 성형 변신 로맨틱 코미디',
  119: '2021년 넷플릭스 456억 상금 데스 서바이벌 드라마',
  140: '2021년 SBS, 복수를 대신해 주는 회사 이야기 · 이제훈',
  145: '2022년 JTBC, 송중기 회귀 복수극 · 순양 그룹',
  164: '1967년 디즈니, 늑대 손에 자란 소년 모글리',
  184: '2021년 디즈니 콜롬비아 배경 가족 뮤지컬 애니',
  201: '눈먼 아버지를 위해 인당수에 몸을 던진 딸',
  207: '노래가 나오는 혹을 떼러 간 두 노인의 옛이야기',
  212: '곰이 사람이 되어 고조선 시조를 낳은 옛 건국담',
  218: '주인이 잃은 보물을 두 동물이 되가져온 옛이야기',
  219: '울보 왕녀와 혼인해 이름난 무장이 된 고구려 사나이',
  224: '바다가 짠 까닭을 알려 주는 옛이야기',
  230: '동물들이 달리기 순서를 겨룬 옛날 설화',
  251: '2016년 Mnet 국민 투표 아이돌 선발 오디션',
  258: '2018년 SBS 요리 연구가의 상권 살리기 솔루션',
  261: '2021년 TVING 헤어진 커플들이 함께 나오는 예능',
  275: '2017년 MBC 연예인과 매니저 일상 관찰 예능',
  310: '2002년 시작한 조폭 집안 사위 코미디 시리즈',
  343: '1990년 크리스마스에 혼자 남은 소년의 도둑 소탕 코미디',
  355: '2018년 칸 황금종려상, 고레에다 히로카즈 감독',
  388: '2002년 SBS 안재모 · 김영철 주연 김두한 일대기',
  412: '1994년 TV 몸이 작아진 고교생 추리 애니',
  418: '2004년 TV 지구 침략 외계 양서류 코미디',
  426: '2023년 TV 연예계 환생 미스터리 애니 · 아쿠아와 루비',
  432: '2016년 TV 초능력 학원 영웅물 애니',
  481: '물레 바늘에 찔려 백 년간 잠든 왕녀 동화',
  485: '각자 집을 지은 셋과 입김이 센 늑대 이야기',
  488: '1843년 안데르센 동화, 따돌림 끝에 백조가 된 새',
  502: '그리스 신화 속 10년 싸움을 끝낸 나무 계략',
  530: '2006년 EA · 넥슨이 서비스한 PC 축구 게임',
  552: 'CD 프로젝트 레드 SF 오픈월드 RPG · 키아누 리브스',
  557: '2006년 리모컨을 휘둘러 하는 체감형 운동 게임',
  576: '재난 속 생존법을 알려 주는 어린이 학습서 묶음',
  615: '믿을 수 없는 사람에게 소중한 것을 맡겨 불안하다',
  617: '관심이 한쪽으로 쏠리면 그쪽만 알아챈다',
  618: '철없는 사람이 상대 실력도 가늠 못 하고 덤빈다',
  619: '분수에 맞지 않게 남을 흉내 내다가 해를 입는다',
  623: '살아서 보람 있는 일을 해 명예를 남겨야 한다',
  637: '한번 크게 겁먹으면 비슷한 것만 봐도 겁낸다',
  638: '겉으로 조용한 사람이 뒤로 실속을 앞서 챙긴다',
  642: '어릴 때 몸에 밴 습관은 평생 이어진다는 뜻',
  643: '고된 시간을 견디면 즐거운 날이 생긴다는 뜻',
  646: '직접 눈으로 확인하는 게 낫다는 한자 성어 속담',
  651: '아무리 큰 어려움에도 살 길은 생긴다는 뜻',
  652: '남의 마음은 헤아리기 어렵다는 뜻',
  660: '다른 이의 것이 더 좋아 보이는 마음',
  665: '방법이 어떻든 목적만 이루면 괜찮다는 뜻',
  668: '간섭하는 이가 여럿이면 일이 엉뚱하게 틀어진다',
  714: 'YG 4인조 걸그룹 2022년 컴백 타이틀곡 · 독을 품은 꽃',
  734: '브아걸 2009년 · 마법 주문 같은 시건방 춤곡',
  792: '전국 시대를 끝내고 대륙을 처음 통일한 임금',
  794: '인도 콜카타에서 가난한 이를 돌본 가톨릭 성인',
  796: '1903년 동력 비행에 처음 성공한 미국인 둘',
  834: '아프리카 북부 · 세계에서 가장 큰 뜨거운 모래 땅',
};

// ── 4-b. 같은 라운드 '정답이 다른 질문에 낱말로' — 갈래 낱말일 뿐인 것(사람 판정 · 게이트 통과 표시)
const ROUND_DUP_OK = { '20-03': '갈래 낱말 — 10 조각 질문의 "일본 애니메이션" 은 갈래 이름이지 정답 단서가 아니다(다른 지식)', '10-12': '갈래 낱말 — "일본 애니메이션" 의 일본은 20-03(나라 일본) 정답 단서가 아니다(다른 지식)' };

// ── 5. 질문 갈래 · 카테고리 · 점수
const GENRE = { '01': '한국 영화', '07': '한국 영화', '02': '외국 영화', '08': '외국 영화', '03': '한국 드라마', '09': '한국 드라마', '04': '서양 애니메이션', '10': '일본 애니메이션', '11': '한국 만화·애니메이션', '05': '전래동화·고전', '12': '세계 명작 동화·고전', '06': '예능·TV 프로그램', '13': '게임', '14': '웹툰·만화', '15': '속담', '16': '속담', '17': '노래 제목', '18': '노래 제목', '19': '인물', '20': '나라·도시·명소' };
const josa = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c % 28 ? '은' : '는'; };
const ACC5 = new Set(['01', '02', '03', '06', '07', '08', '09', '15', '16', '17', '18', '19', '20']);
const NON_US = new Set(['어느 가족', '러브 액츄얼리', '어바웃 타임', '슬럼독 밀리어네어', '오만과 편견']);
const MYTH = new Set(['트로이 목마', '메두사', '이카로스', '판도라의 상자', '미다스 왕', '헤라클레스']);
const CONSOLE = new Set(['동물의 숲', '링 피트 어드벤처', 'Wii 스포츠', '스플래툰', '엘든 링']);
const JP_COMIC = new Set(['슬램덩크', '원피스', '드래곤볼', '스파이 패밀리', '데스노트', '나루토']);
const IDOL = ['트와이스', '방탄소년단', '블랙핑크', '아이오아이', '레드벨벳', '워너원', '아이콘', '마마무', '에스파', '아이브', '뉴진스', '르세라핌', '로제', '빅뱅', '소녀시대', '2NE1', '원더걸스', '샤이니', '2PM', '엑소', '지드래곤', '에이핑크', '브라운아이드걸스', '슈퍼주니어', '미쓰에이', '선미', '청하', 'H.O.T.', 'god'];
const PERSON = {
  세종대왕: ['kr-history', '조선 전기'], 이순신: ['kr-history', '조선 전기'], 신사임당: ['kr-history', '조선 전기'], 장영실: ['kr-history', '조선 전기'],
  허준: ['kr-history', '조선 후기'], 정약용: ['kr-history', '조선 후기'], 김정호: ['kr-history', '조선 후기'], 광개토대왕: ['kr-history', '삼국·통일신라'],
  유관순: ['kr-history', '개항기·일제강점기'], 안중근: ['kr-history', '개항기·일제강점기'], 김구: ['kr-history', '개항기·일제강점기'], 윤동주: ['kr-history', '개항기·일제강점기'],
  아인슈타인: ['world-history-west', '20세기 서양'], '마리 퀴리': ['world-history-west', '20세기 서양'], '안네 프랑크': ['world-history-west', '20세기 서양'], 피카소: ['world-history-west', '20세기 서양'], '마더 테레사': ['world-history-west', '20세기 서양'],
  뉴턴: ['world-history-west', '근대 유럽·혁명'], 베토벤: ['world-history-west', '근대 유럽·혁명'], 나폴레옹: ['world-history-west', '근대 유럽·혁명'], '반 고흐': ['world-history-west', '근대 유럽·혁명'], 모차르트: ['world-history-west', '근대 유럽·혁명'], 나이팅게일: ['world-history-west', '근대 유럽·혁명'], 다윈: ['world-history-west', '근대 유럽·혁명'], 파브르: ['world-history-west', '근대 유럽·혁명'],
  콜럼버스: ['world-history-west', '르네상스·대항해'], '레오나르도 다빈치': ['world-history-west', '르네상스·대항해'], 갈릴레오: ['world-history-west', '르네상스·대항해'], 셰익스피어: ['world-history-west', '르네상스·대항해'],
  에디슨: ['world-history-west', '미국사'], '헬렌 켈러': ['world-history-west', '미국사'], 링컨: ['world-history-west', '미국사'], '라이트 형제': ['world-history-west', '미국사'],
  클레오파트라: ['world-history-west', '고대 문명'], '잔 다르크': ['world-history-west', '중세 유럽'],
  간디: ['world-history-east', '인도·동남아'], 칭기즈칸: ['world-history-east', '중국 왕조'], 진시황: ['world-history-east', '중국 왕조'],
};
const GEO = {
  제주도: ['kr-geo', '섬·해안'], 서울: ['kr-geo', '행정구역·도시'], 경주: ['kr-geo', '행정구역·도시'], 부산: ['kr-geo', '행정구역·도시'],
  아프리카: ['world-geo', '대륙·바다'], 남극: ['world-geo', '대륙·바다'],
  디즈니랜드: ['world-geo', '랜드마크·지형'], 이스터섬: ['world-geo', '랜드마크·지형'], '사하라 사막': ['world-geo', '랜드마크·지형'], 후지산: ['world-geo', '랜드마크·지형'], 하와이: ['world-geo', '랜드마크·지형'],
  뉴욕: ['world-geo', '도시 별칭'], 샌프란시스코: ['world-geo', '도시 별칭'], 베네치아: ['world-geo', '도시 별칭'], 이스탄불: ['world-geo', '도시 별칭'], 교토: ['world-geo', '도시 별칭'], 라스베이거스: ['world-geo', '도시 별칭'], 두바이: ['world-geo', '도시 별칭'], 필라델피아: ['world-geo', '도시 별칭'], 뉴올리언스: ['world-geo', '도시 별칭'],
};
function category(x) {
  const y = x.year;
  switch (x.chunk) {
    case '01': case '07': return ['kr-screen', y != null && y < 2000 ? '1990년대 이전 한국 영화' : '2000년대 이후 한국 영화'];
    case '02': case '08': return ['world-cinema', NON_US.has(x.answer) ? '유럽·아시아 영화' : y != null && y < 2000 ? '할리우드 고전' : '현대 할리우드'];
    case '03': case '09': return ['kr-screen', '한국 드라마'];
    case '04': return ['animation', '디즈니·픽사 극장 애니메이션'];
    case '10': return ['animation', '일본 애니메이션'];
    case '11': return ['comics', '한국 만화·웹툰'];
    case '05': return ['kr-lit', '고전 산문'];
    case '12': return MYTH.has(x.answer) ? ['myth', '그리스·로마 신화'] : ['world-lit', y == null || y < 1800 ? '고전(고대~18세기)' : y < 1900 ? '19세기 소설' : '20세기 문학'];
    case '06': return ['kr-tv', '예능 프로그램'];
    case '13': return ['esports', y != null && y < 2000 ? '고전 게임(1980~90년대)' : CONSOLE.has(x.answer) ? '콘솔 게임' : 'PC·온라인 게임'];
    case '14': return ['comics', JP_COMIC.has(x.answer) ? '일본 만화' : '한국 만화·웹툰'];
    case '15': case '16': return ['kr-language', '속담·관용어'];
    case '17': case '18': {
      if (y != null && y < 1990) return ['kr-music', '1980년대 이전 가요'];
      if (y != null && y < 2000) return ['kr-music', '1990년대 가요'];
      return ['kr-music', IDOL.some((g) => x.hint.startsWith(g + ' ')) ? '아이돌·K팝' : '2000년대 이후 가요'];
    }
    case '19': return PERSON[x.answer] ?? null;
    case '20': return GEO[x.answer] ?? ['world-geo', '국가·수도'];
  }
  return null;
}

// ── 6. 만들기
const C = (s) => flexCanon(normalizeAnswer(String(s ?? '')));
const problems = []; const variantLog = []; const hintLog = []; const out = [];
for (const x of SRC) {
  if (DROP.has(x.i)) continue;
  // 정답 변형
  const alts = (x.alt ?? []).filter((v) => !(ALT_REMOVE[x.i] ?? []).includes(v));
  for (const v of ALT_REMOVE[x.i] ?? []) variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'remove-wrong', why: '다른 작품의 제목 — 사실 오류' });
  const acc = []; const otv = []; const seenN = new Set([normalizeAnswer(x.answer)]);
  for (const v of alts) {
    const n = normalizeAnswer(v);
    if (seenN.has(n)) { variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'drop-redundant', why: '정규화하면 이미 있는 표기 — R090 정규화가 받음' }); continue; }
    if (isCJK(v)) { variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'drop-cjk', why: '한자 · 가나 원어 표기 — 기준서가 금지' }); continue; }
    if (isLatin(v) && /[가-힣]/.test(x.answer)) {
      if (b10ok(x)) { otv.push(v); acc.push(v); seenN.add(n); continue; }
      if (looksLikeAbbrev(v)) { acc.push(v); seenN.add(n); continue; }
      variantLog.push({ ref: x.ref, answer: x.answer, alt: v, action: 'drop-latin', why: '한국어 제목이 따로 있는 대상의 영문 표기(B4) — 원제가 영어 아님' });
      continue;
    }
    acc.push(v); seenN.add(n);
  }
  const [midKey, sub] = category(x) ?? [];
  if (!midKey) { problems.push(`${x.ref} ${x.answer}: 카테고리 없음`); continue; }
  let subId; try { subId = subIdOf(midKey, sub); } catch (e) { problems.push(`${x.ref} ${x.answer}: ${e.message}`); continue; }
  const genre = GENRE[x.chunk];
  const question = `${x.emoji} — 이모지가 나타내는 ${genre}${josa(genre)}?`;
  const hint = HINT[x.i] ?? x.hint;
  if (HINT[x.i]) hintLog.push({ ref: x.ref, answer: x.answer, before: x.hint, after: hint });
  const explanation = `이모지: ${x.why}`; // 힌트는 문제 중에 이미 보인다 — 공개 때는 풀이만(되풀이하면 hint-check explain 경고 806)
  const wor = ['kr-screen', 'world-cinema', 'animation', 'comics', 'kr-tv', 'esports', 'kr-music'].includes(midKey) ? 2 : 3;
  const accS = ACC5.has(x.chunk) ? 5 : 4;
  out.push({
    ref: x.ref, i: x.i, chunk: x.chunk, field: x.field, subId, midKey, sub,
    rec: {
      seedId: `${subId}#${ROUND}-${x.ref}`,
      seed: { subject: x.answer, aspect: null, ref: x.ref, chunk: x.chunk, field: x.field },
      question: {
        ok: true, mode: 'emoji', pairedWith: null,
        question, answer: x.answer, acceptedAnswers: acc, originalTitleVariants: otv,
        explanation,
        score: { version: 'emoji-v1', acc: accS, accWhy: `이모지 문항 — 분야 기준(${x.field} ${accS})`, dif: x.diff + 1, difWhy: `이모지 문항 — 웹 diff ${x.diff} → ${x.diff + 1}`, wor, worWhy: `이모지 문항 — 분야 기준(${wor === 2 ? '미디어 묶음' : '상식 · 문학 · 지리'} ${wor})` },
        generalHint: hint, generalHintVersion: 'emoji-v1',
        ...(ROUND_DUP_OK[x.ref] ? { roundDupOk: ROUND_DUP_OK[x.ref] } : {}),
        emoji: { line: x.emoji, why: x.why, year: x.year, webHint: x.hint, webAlt: x.alt },
      },
    },
  });
}

// ── 7. 기계 검사 (게이트와 같은 함수)
const byN = new Map();
for (const o of out) { const k = C(o.rec.question.answer); if (byN.has(k)) problems.push(`같은 정답 남음: ${o.ref} ↔ ${byN.get(k)}`); byN.set(k, o.ref); }
for (const o of out) {
  const q = o.rec.question;
  const hc = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers, question: q.question, explanation: q.explanation });
  if (hc.block.length) problems.push(`${o.ref} ${q.answer}: 힌트 H2 막힘 — ${hc.block.map((b) => b.frag).join(',')} | ${q.generalHint}`);
  const g = checkAnswerSet(q.question, q.answer, q.acceptedAnswers, normalizeAnswer, { originalTitles: q.originalTitleVariants });
  if (g.blocked.length) problems.push(`${o.ref} ${q.answer}: 질문에 정답 — ${g.blocked.map((b) => b.answer)}`);
  if (g.dropped.length) problems.push(`${o.ref} ${q.answer}: 변형 떨어짐 — ${g.dropped.map((d) => `${d.answer}(${d.kind})`)}`);
  if (!lengthCheck(q.question).ok) problems.push(`${o.ref}: 질문 길이`);
  if (!blankCheck(q.question, q.answer).ok) problems.push(`${o.ref}: 빈칸`);
  if (/[A-Za-z0-9가-힣]/.test(o.rec.question.emoji.line.replace(/[0-9#*]️?⃣/g, '').replace(/️/g, ''))) problems.push(`${o.ref}: 이모지 줄에 글자`);
}
const dups = roundDupCheck(out.map((o) => ({ ref: o.ref, question: o.rec.question.question, answer: o.rec.question.answer, explanation: o.rec.question.explanation })), normalizeAnswer);
for (const d of dups) if (!(ROUND_DUP_OK[d.a] && ROUND_DUP_OK[d.b])) problems.push(`roundDup ${d.kind}: ${d.a} ↔ ${d.b} (${d.detail})`);

if (REPORT || problems.length) {
  for (const p of problems) console.log('★', p);
  console.log(`[g057] 남음 ${out.length} / 버림 ${DROP.size} · 문제 ${problems.length}`);
  if (problems.length) process.exit(1);
  process.exit(0);
}

// ── 8. 기존 활성과 같은 정답 (DB 읽기만)
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const act = (await c.query(`select q.id, q.display_answer, c.key from questions q left join categories c on c.id = q.category_id where q.is_active`)).rows;
await c.end();
const actBy = new Map(); for (const r of act) { const k = C(r.display_answer); if (!actBy.has(k)) actBy.set(k, []); actBy.get(k).push(r); }
const same = out.filter((o) => actBy.has(C(o.rec.question.answer))).map((o) => ({ ref: o.ref, answer: o.rec.question.answer, active: actBy.get(C(o.rec.question.answer)).map((r) => ({ id: r.id, answer: r.display_answer, cat: r.key })) }));

// ── 9. 쓰기
const dir = path.join(ROOT, 'data/pipeline/generated', ROUND);
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
const bySub = new Map();
for (const o of out) { if (!bySub.has(o.subId)) bySub.set(o.subId, []); bySub.get(o.subId).push(o.rec); }
for (const [subId, items] of [...bySub].sort()) {
  const [midKey, n] = subId.split('/');
  writeFileSync(path.join(dir, `${midKey}-${n}.json`), JSON.stringify({
    _meta: { round: ROUND, subId, midKey, questionPrompt: 'emoji-v1(web-desk/emoji/지시서.md)', scorePrompt: 'emoji-v1(분야 기준)', hintPrompt: 'emoji-v1(웹 hint · H2 막힘만 GEN 다시 씀)', generator: 'claude-sonnet-5-5(web-desk 웹 계정)', questionGenerator: 'claude-sonnet-5-5(web-desk 웹 계정)', builder: 'scripts/g057-emoji-build.mjs (claude-opus-5-5)', stage: 'emoji', generatedAt: new Date().toISOString(),
      note: 'G057 — 이모지 제목 퀴즈. 적재하지 않았다. V050(유일성 전수 · 블라인드) 뒤 G058 이 고쳐서 pipeline-load --round g057 활성 적재' },
    items }, null, 1) + '\n');
}
const AUD = path.join(ROOT, 'data/pipeline/audit');
const refOf = (i) => SRC[i].ref;
writeFileSync(path.join(AUD, 'g057-dedupe.json'), JSON.stringify(KEEP.map(([k, ds, why]) => ({ answer: SRC[k].answer, kept: { ref: refOf(k), chunk: SRC[k].chunk, emoji: SRC[k].emoji }, dropped: ds.map((d) => ({ ref: refOf(d), chunk: SRC[d].chunk, answer: SRC[d].answer, emoji: SRC[d].emoji })), why })), null, 1) + '\n');
writeFileSync(path.join(AUD, 'g057-sameanswer.json'), JSON.stringify({ note: '기존 활성과 같은 정답 — 다른 지식(15 §3-3 2회차 꼴) · 넣는다(찬종 결정) · R050 이 한 판 안 같은 답을 미룸', n: same.length, items: same }, null, 1) + '\n');
writeFileSync(path.join(AUD, 'g057-variants.json'), JSON.stringify(variantLog, null, 1) + '\n');
writeFileSync(path.join(AUD, 'g057-hints.json'), JSON.stringify(hintLog, null, 1) + '\n');
mkdirSync(path.join(ROOT, 'tmp/g057'), { recursive: true });
writeFileSync(path.join(ROOT, 'tmp/g057/items.json'), JSON.stringify(out.map((o) => ({ ref: o.ref, i: o.i, chunk: o.chunk, subId: o.subId, sub: o.sub, answer: o.rec.question.answer, q: o.rec.question.question })), null, 1));
const cat = {}; for (const o of out) { const k = `${o.chunk} → ${o.midKey} > ${o.sub}`; cat[k] = (cat[k] ?? 0) + 1; }
console.log(JSON.stringify(cat, null, 1));
console.log(`[g057] 837 → ${out.length} (버림 ${DROP.size}) · 파일 ${bySub.size} · 활성과 같은 정답 ${same.length} · 영문 뺌 ${variantLog.filter((v) => v.action === 'drop-latin').length} · 힌트 다시 씀 ${hintLog.length}`);

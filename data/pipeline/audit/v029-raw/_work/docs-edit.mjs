import fs from 'node:fs';import {execSync} from 'node:child_process';
const sh=(c)=>execSync(c,{cwd:'C:/work/quiz-web',encoding:'utf8',maxBuffer:1<<28});
const CV=[
'| CV-109 | 알가치 눈금 흔들림 (V029 0-2 · 3-1 · 3-4) | 눈금자 650 판정 중 14 어긋남(2.2% · 1↔3 0) 인데 1811 깃털(신화 상징 · 찬종 3)만 판정자 2 가 11/18 · 자가 시험 40/40 은 지시서 2절이 눈금자 이름을 직접 예로 들어 **새는 시험**이라 눈금자 밖 신뢰도는 직접 재독 표본(1∧4·5 60 중 56 · 3 60 중 57 동의)으로만 가늠 · 종류가 알가치를 거의 정함(개념 · 취미세부 = 2 / 고유명사 · 숫자 · 일화 = 1 / 상식 · 유래 · 쓸모 = 3) · 작곡가 · 화가 이름 확인의 1/2 구분 흔들림(바흐 2 · 하이든 1). 선택: (a) 지금 값으로 G025 가 적용하고 찬종이 샘플 60 을 새로 매겨 보정 (b) 지시서 예와 눈금자를 안 겹치게 나눠 다시. 기본값 (a) · 직접 재독으로 9 고침(worth.json judged · reread) |',
'| CV-110 | 분야별 알가치 치우침 (V029 2-3) | 알가치 3 비율 낮음: 한국 문학 3%(156 중 5 · 1 이 74%) · 클래식 10% · 철학·사상 13% · 세계 문학 14% · 한국 영화·드라마 15% · 한국 방송·예능 16% · 야구 16% — 높음: 브랜드·기업 81% · 한국어·한글 80% · 생활 규칙·안전 77% · 의복·패션 75%. 찬종 눈금자("예술·문학 작품 이름 = 1")를 그대로 따른 결과 — 분야 필터로 한국 문학만 고르면 예비 문항 위주. 찬종 확인: 교과서 수록 작품(운수 좋은 날 · 서시 · 광야 · 별 헤는 밤 — 판정자는 2)을 어디까지 2 로 볼지 |',
'| CV-111 | 유래가 해설에만 있는 문항 (V029 6 ②) | 판정자 `why` 에 "유래는 해설에만" 표시 10(알가치 2 8 · 1 2): 2946 몸국 · 4730 야경 · 4803 박싱 데이 · 4858 베스파 · 5264 포클레인 · 5505 박카스 · 6135 엔터프라이즈 · 6364 아틀라스 · 6473 점보 · 6702 스판덱스. 질문에 유래 한 조각을 옮기면 알가치가 오를 후보(표시 안 된 것은 더 있을 수 있음). G025/생성 규칙 후보 · 찬종 결정 없음 |',
'| CV-112 | 👍👎 와 알가치가 어긋난 둘 (V029 2-4) | 봇 · 검사 계정 제외 44표 · 35문항(브리핑 47 · 37 과 다름). 기대(👍 → 2·3 · 👎 → 1)와 32/35 = 91% — 눈금자 밖 8 문항은 6/8. 어긋난 530 입동(👎 · 알가치 3 · 사유 없음) · 1941 특허를 공개했다(👎2 · 3 · 사유 other · answer → 알가치가 아니라 정답/사실 문제 의심). 지시서는 안 고침 · 530 은 지켜보고 1941 은 GEN 사실 확인 후보 |',
'| CV-113 | 가장 어려운 칸의 알가치 3 공급 부족 (V029 2-2) | 알가치 3 문항: 3등급 611(초급 칸 152판) · 4등급 183(중급 칸 45판) · **5등급 15(고급 칸 3판)**. 19 §5 폴백(알가치 3 → 2 → 1 → 한 등급 아래)이 고급에서 사실상 항상 작동 — 5등급 알가치 2 129(32판) · 1 154(38판). 알가치 1 ∧ 4·5등급 671 · 1 ∧ 1·2등급 59. 설계가 R069 폴백 비율을 정할 것 · 생성 우선순위 5등급×3 > 4등급×3 (19 §9-2 에 반영 후보) |',
'| CV-114 | V029 마감 사실 (V029 0-1) | 활성 6,507 → 6,506(6686 한공주 — G024 B 가 민감으로 비활성) · worth.json 은 시작 6,507 전부 포함(G025 는 6686 건너뛰면 됨) · question_feedback 봇 제외 44표/35문항(브리핑 47/37) · `questions.worth` 열 시작 때 없음(R068 0026 대기) · 눈금자 "종류=이름확인" 은 지시서 8종에 없어 상식/취미세부/고유명사로 옮김 |',
];
const C84='| C84 | ★ **끝(V029 — 2026-10-26 · 알가치 전수 판정 6,507 · 판정자 sonnet 65 조각 + 자가 시험 · 눈금자 650 판정 14 어긋남 · 1:1,038 · 2:3,101 · 3:2,368 · low 1,312 전부 + 표본 재독 · 9 고침 · 등급×알가치: 5등급 3 은 15 뿐(고급 칸 3판) · `ai-out/V029.txt` · `audit/v029-worth.json` · `audit/v029-raw/` · CV-109~114)** — **적용 G025 대기**(questions.worth 열은 R068 0026) · DB 쓰기 없음 |';
const RM='| V029.txt | 알가치(worth) 전수 판정 6,507 VERIFY — 알가치 1:1,038 · 2:3,101 · 3:2,368 · 섞은 눈금자 650 판정 14 어긋남(2.2%) · 자가 시험 40/40(새는 시험) · low 1,312 전부 + 표본 재독 → 9 고침 · ★ 등급 × 알가치 3: 1등급 85% · 3등급 24% · 4등급 13% · 5등급 5%(**5등급 3 은 15 뿐**) · 1∧4·5 671(예비) · 👍👎 32/35 일치 · 분야 3 비율 한국 문학 3% ↔ 브랜드 81% → `audit/v029-worth.json` · `v029-raw/` · C84 · CV-109~114 |';
const S05='> ★ Track D 추가: **V029**(알가치 전수 판정 6,507 — 1:1,038 · 2:3,101 · 3:2,368 · 5등급의 알가치 3 은 15 뿐 · `audit/v029-worth.json` · DB 미적용 · 적용은 G025 · `ai-out/V029.txt`) — 위 Track D 줄은 G023 기준.';
const S06=['## 2026-10-26 — 알가치(worth) 전수 판정 6,507 (V029, VERIFY)','','- **무엇을**: 활성 6,507 전수에 알가치 1·2·3 — 판정자 Sonnet 5.5 하위 에이전트 65 조각(조각 100 + 눈금자 10 섞음) + 자가 시험 · 눈금자는 찬종이 확인한 anchors60.md(60 · 설계와 다른 값 25) · 결과 1:1,038 · 2:3,101 · 3:2,368 · 파일 `data/pipeline/audit/v029-worth.json`.','- **어떻게**: scripts/v029-targets.mjs(읽기 전용) → targets.json 고정 → INSTRUCTIONS.md 의 `{{예 20}}` 을 찬종 값으로 채워 prompt.md → 자가 시험 40/40(단 지시서가 눈금자 이름을 예로 들어 새는 시험) → 조각 65(개수 · 순서 · 키 · 값 범위 기계 검사 65/65) → 직접 재독(low 1,312 전부 · 신화 79 · 1∧4·5 60 · 3 60 · 👍👎 35)으로 9 고침 → 집계.','- **결과**: 눈금자 650 판정 중 14 어긋남(2.2%) · 등급×알가치 3: 1등급 85% · 2등급 63% · 3등급 24% · 4등급 13% · 5등급 5%(15) · 알가치 1 ∧ 4·5등급 671 · 분야 3 비율 한국 문학 3% ↔ 브랜드·기업 81%.','- **남은 것**: G025(questions.worth 적용 — 열은 R068 0026 · 6686 건너뜀) · R069(가장 어려운 칸 폴백 비율) · CV-109~114 · C84.','','---','']; 
const edit={
 'docs/13-PENDING-CHECKS.md':(t)=>{if(t.includes('| CV-109 |'))return t;
   let L=t.split('\n');let i=L.findIndex(l=>l.startsWith('| CV-108 |'));if(i<0)throw 'cv108';L.splice(i+1,0,...CV);
   let j=L.findIndex(l=>l.startsWith('| C83 |'));if(j<0)throw 'c83';L.splice(j+1,0,C84);return L.join('\n');},
 'ai-out/README.md':(t)=>{if(t.includes('| V029.txt |'))return t;let L=t.split('\n');let i=L.findIndex(l=>l.startsWith('| V028.txt |'));if(i<0)throw 'v028';L.splice(i+1,0,RM);return L.join('\n');},
 'docs/05-STATUS.md':(t)=>{if(t.includes('Track D 추가: **V029**'))return t;let L=t.split('\n');let i=L.findIndex(l=>l.startsWith('> ★ Track D 는 **G023**'));if(i<0)throw 'trackd';L.splice(i+1,0,S05);return L.join('\n');},
 'docs/06-WORKLOG.md':(t)=>{if(t.includes('(V029, VERIFY)'))return t;let L=t.split('\n');let i=L.findIndex(l=>l.startsWith('## 2026-10-26 — 난이도 v2 적용'));if(i<0)throw 'g023sec';L.splice(i,0,...S06);return L.join('\n');},
};
for(const [f,fn] of Object.entries(edit)){
 const head=sh(`git show HEAD:${f}`);const nh=fn(head);
 const cur=fs.readFileSync('C:/work/quiz-web/'+f,'utf8');const nc=fn(cur);fs.writeFileSync('C:/work/quiz-web/'+f,nc);
 const tmp='C:/work/quiz-web/data/pipeline/audit/v029-raw/_work/blob.tmp';fs.writeFileSync(tmp,nh);
 const h=sh(`git hash-object -w "${tmp}"`).trim();sh(`git update-index --cacheinfo 100644,${h},${f}`);
 console.log(f,'ok',h.slice(0,8));
}

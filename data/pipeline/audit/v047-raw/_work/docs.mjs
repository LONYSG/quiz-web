import fs from 'node:fs';
const ins=(f,re,text)=>{const L=fs.readFileSync(f,'utf8').split('\n');const i=L.findIndex(l=>re.test(l));if(i<0)throw new Error(f+' 앵커');L.splice(i+1,0,...text);fs.writeFileSync(f,L.join('\n'));};
ins('docs/13-PENDING-CHECKS.md',/^\| CV-179 \|/,[
'| CV-180 | ★ V047 fixes · 소견 → 다음 G | ① 표본 300 문제 1(토르소 낯섦) → `draw-object-2` remove ② 남은 연예인 106 읽기: 논란 인물 4 remove 제안(김병만 · 박세리 · 기성용 · 하정우 — 판정자 기억 기준 · 웹 0 · **설계 확인 뒤**) · 주의 6(홍명보 · 박민영 · 차태현 · 이선희 · 브래드피트 · 싸이)은 두어도 됨 ③ 소견: 표본 문제율 0.33% 는 "낯섦" 기준이 느슨해 보일 수 있음(와인드업 · 너클볼 · 장발족 은 ok 로 둠) — 기준을 엄하게 하면 5% 안팎 | V047 | 설계 확인 뒤 G |']);
ins('docs/13-PENDING-CHECKS.md',/^\| C121 \|/,[
'| C122 | ★ **끝(V047 — 2026-11-10 · 캐치 2차 표본 300 직접 판정 · 웹 0 · 하위 에이전트 0)** — 문제 1(0.33%) < 5% → G051 새 14 파일 전부 verified · 연예인 106 읽기 · 메뉴 1 캐치 단어 6,130(fix 5 적용 시 6,125) | `ai-out/V047.txt` · `audit/v047-raw/` · CV-180 | 세트 파일 verify 칸 + status 만 · items 불변 · topics-check 막힘 0 |']);
ins('ai-out/README.md',/^\| V046\.txt \|/,['| V047.txt | ★ **캐치 2차 표본 300 판정** VERIFY — 문제율 0.33% → 새 14 파일 verified · 연예인 106 읽기(논란 4 제안) · 메뉴 1 캐치 단어 6,130 · C122 · CV-180 |']);
const sec=['## 2026-11-10 — V047 캐치마인드 2차 표본 300 판정 (VERIFY · 판정만 · DB 없음)','- 표본 300(씨앗 20261110) 문제 1 → 0.33% < 5% → 새 14 파일 verified · 남은 연예인 106 읽기 — 논란 4 remove 제안.','- 쓴 것: draw 14 파일 verify 칸 + status · items 불변 · `ai-out/V047.txt` · `audit/v047-raw/` · 13 C122 · CV-180.','- 남은 것: CV-180(설계 확인 뒤 G) · 메뉴 1.',''];
let L=fs.readFileSync('docs/06-WORKLOG.md','utf8').split('\n');const i=L.findIndex(l=>l.startsWith('## 2026-11-10'));L.splice(i,0,...sec);fs.writeFileSync('docs/06-WORKLOG.md',L.join('\n'));
let s=fs.readFileSync('docs/05-STATUS.md','utf8');const k=s.indexOf('> ★ Track D 추가: **V046**');
s=s.slice(0,k)+'> ★ Track D 추가: **V047**(2026-11-10 · 캐치 2차 표본 300 — 문제 0.33% → 새 14 파일 verified · 메뉴 1 캐치 단어 6,130 · `ai-out/V047.txt` · CV-180)\n'+s.slice(k);fs.writeFileSync('docs/05-STATUS.md',s);

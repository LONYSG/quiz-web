import fs from 'fs';
const K=t=>`https://ko.wikipedia.org/wiki/${t}`, E=t=>`https://en.wikipedia.org/wiki/${t}`;
const F={};
const ko=(t)=>{const u=K(t);F[u]=`p-ko-${t}.txt`;return u;};
const en=(t)=>{const u=E(t);F[u]=`p-en-${t}.txt`;return u;};
const L=(text,url,quote)=>({text,url,quote});
const items=[];
const add=o=>items.push(Object.assign({also:[],spelling:'?',gradeGuess:1,legend:false,care:'',hintRisk:false,spellNote:''},o));
F[K('동전')]='p-ko-동전.txt';
add({answer:'신용카드',also:['크레디트 카드','credit card'],major:'인문·사회',mid:'경제·금융 상식',
 core:L('현금 없이 가맹점에서 물건을 살 수 있게 해 주는 카드',ko('신용카드'),'카드 발행사와 계약을 체결한 회원은 가맹 소매점 등에서 상품을 현금 없이 구매할 수 있다.'),
 story:[L('1949년 뉴욕 식당에서 프랭크 맥나마라가 지갑을 다른 양복에 두고 온 것을 알았다',en('Diners_Club_International'),'Diners Club cofounder Frank McNamara was dining with clients and realized he had left his wallet in another suit.'),
 L('아내가 대신 계산했고, 이 민망함을 피하려 만능 카드를 떠올렸다',en('Diners_Club_International'),'His wife paid the bill, and McNamara thought of a multipurpose charge card as a way to avoid similar embarrassments in the future.'),
 L('오늘날과 같은 신용카드의 시초는 다이너스 클럽이다',ko('신용카드'),'오늘날과 같은 신용카드가 등장한 건 1951년 미국 뉴욕에서 프랭크 맥나마라 등이 설립한')],
 hintIdea:L('국내 최초의 신용카드는 신세계백화점 직원 전용 카드였다',ko('신용카드'),'국내 최초의 신용카드는 1969년 신세계백화점카드이다.'),
 why:'지갑을 깜빡한 민망함이 카드의 시작',hintRisk:true});
add({answer:'저금통',also:['돼지 저금통'],major:'인문·사회',mid:'경제·금융 상식',legend:true,care:'piggy 어원은 설(說)이라 "~라고 전해집니다"로. 돼지 모양 최초는 12세기 자바(영어판)',
 core:L('돈(주로 동전)을 모아 저축하는 통',ko('저금통'),'저금통(貯金筒, 영어: piggy bank, money box 또는 penny bank)은 돈(주로 동전)을 모아서 저축(보관)하는 통이다.'),
 story:[L('영어 piggy bank 에는 처음부터 돼지라는 뜻이 없었다',ko('저금통'),"영어로 돼지 저금통을 'piggy bank'라 부르는데, 여기에는 처음부터 돼지(piggy)라는 의미가 있지 않았다."),
 L('중세 영어 pygg 는 찰흙의 한 종류였다',ko('저금통'),"중세 영어로 '피그(pygg)'는 그릇 같은 각종 가사 용품을 만드는 데 사용하는 찰흙의 한 종류를 가리키는 단어이다."),
 L('돼지 모양 돈통은 12세기 자바 섬에서 가장 먼저 발견됐다',en('Piggy_bank'),'The earliest known pig-shaped money containers date to the 12th century on the island of Java.')],
 hintIdea:L('돈을 다시 빼려면 대개 깨거나 갈라서 열어야 한다',ko('저금통'),'저금통에 돈을 넣기는 쉬워도 돈을 다시 빼려면 대개는 저금통을 깨거나 갈라서 열어야 하기 때문에'),
 why:'돼지 모양이라서가 아니라 찰흙 이름 때문에 piggy bank'});
add({answer:'게토레이',also:['Gatorade','게이터레이드'],major:'생활·상식',mid:'술·음료',
 core:L('원래 운동 선수들을 위해 고안된 탄산 없는 스포츠 드링크',ko('게토레이'),'원래 운동 선수들을 위해 고안되었으나, 지금은 간편히 사 먹을 수 있는 음료로 자리잡았다.'),
 story:[L('1965년 플로리다 대학교 미식축구 팀을 위해 만들어졌다',ko('게토레이'),'게토레이는 플로리다 대학교 의료진인 로버트 케이드, 해리 제임스 프리, 다나 셔스가 1965년 학교 미식축구 팀을 위해 만들었다.'),
 L('이름은 학교 마스코트 악어(앨버트 게이터)에서 왔다',ko('게토레이'),'게토레이라는 이름은 학교의 마스코트로 악어(alligator)에서 유래한 "앨버트 게이터"를 따서 만든 것이다.'),
 L('미식축구 감독 레이 그레이브스의 요청으로 만들어졌다',en('Gatorade'),'Following a request from Florida Gators football head coach Ray Graves, Gatorade was created to help athletes by acting as a replacement for body fluids lost during physical exertion.')],
 hintIdea:L('한국에는 1987년 제일제당이 들여왔다',ko('게토레이'),'대한민국에는 1987년 제일제당에서 도입하여 생산, 판매하기 시작했으며'),
 why:'이름이 대학 팀 마스코트 악어에서 왔다',spellNote:'한국어 위키백과 표제어 게토레이(1987년 상표등록)를 따름 · 현지 발음은 게이터레이드라 also 에 넣음'});
add({answer:'티백',also:['티 백','tea bag','teabag'],major:'생활·상식',mid:'술·음료',legend:true,care:'우연이라는 이야기는 전설(영어판 popular legend)',
 core:L('찻잎을 담아 물에 우려 마시는 작은 주머니',en('Tea_bag'),'A tea bag (also spelled teabag) is a small, porous, sealed bag or packet typically containing tea leaves (Camellia sinensis) or the leaves of other herbs, which is immersed in water to steep and make an infusion.'),
 story:[L('1908년경 뉴욕 차 수입업자 토머스 설리번이 비단 주머니로 성공적으로 팔았다',en('Tea_bag'),'Appearing commercially around 1904, tea bags were successfully marketed in about 1908 by Thomas Sullivan, a tea and coffee importer from New York, who shipped his silk tea bags around the world.'),
 L('손님이 주머니째 우려 마신 것이 시작이라는 이야기가 전해진다',en('Tea_bag'),'A popular legend states that this was accidental; the loose tea was intended to be removed from the bags by customers, but they found it easier to brew the tea with the tea leaves still enclosed in the porous bags.')],
 hintIdea:L('1997년 PG 팁스가 피라미드 모양을 내놓았다',en('Tea_bag'),'Tetrahedral tea bags were introduced by the PG Tips brand in 1997.'),
 why:'샘플이었던 비단 주머니를 손님이 그대로 담갔다',hintRisk:true});
add({answer:'쿠폰',also:['coupon'],major:'인문·사회',mid:'경제·금융 상식',
 core:L('서비스나 상품을 무료 또는 할인가로 받을 수 있는 우대권',ko('쿠폰'),'쿠폰(coupon)은 마케팅의 한 종류로, 어떠한 서비스나 상품을 무료로 또는 할인된 가격으로 제공받을 수 있는 우대권 또는 할인권이다.'),
 story:[L('가장 오래 기록된 쿠폰은 코카콜라의 1888년 공짜 한 잔 쿠폰',en('Coupon'),`Coca-Cola's 1888-issued "free glass of" is the earliest documented coupon.`),
 L('1894~1913년 미국인 아홉 명 중 한 명이 공짜 콜라를 받았다',en('Coupon'),'It is estimated that between 1894 and 1913 one in nine Americans had received a free Coca-Cola, for a total of 8,500,000 free drinks.')],
 hintIdea:L('낱말은 프랑스어에서 왔다',ko('쿠폰'),'이 단어는 프랑스어에서 유래되었으며'),
 why:'쿠폰의 시작이 콜라 공짜 한 잔'});
add({answer:'빼빼로 데이',also:['빼빼로데이','Pepero Day'],major:'생활·상식',mid:'절기·기념일·축제',legend:true,hintRisk:true,care:'학생 일화는 정확한 기원 불명(영어판) · 제과사 마케팅 · 힌트에 빼빼로 글자 금지',
 core:L('11월 11일, 막대 과자를 주고받는 날',en('Pepero_Day'),'It is held on this day for the resemblance of Pepero sticks to the shortened date.'),
 story:[L('1983년 영남 지역 여중생 둘이 키 크고 날씬해지라며 과자를 나눈 일이 시작이라 알려졌지만 의심도 있다',en('Pepero_Day'),'In the story, two female middle school students in the Yeongnam region exchanged Pepero, wishing they would both become tall and thin. However, there is some doubt about this story.'),
 L('1997년부터 제과사가 이 이야기를 홍보에 썼다',en('Pepero_Day'),'From 1997, Lotte started to use the aforementioned school story to successfully promote Pepero Day.'),
 L('2012년 그 회사는 연 매출의 절반을 이날 올렸다',en('Pepero_Day'),'As of 2012, Lotte was making 50% of its annual sales on Pepero Day.')],
 hintIdea:L('같은 날은 농업인의 날이기도 하다',en('Pepero_Day'),`In addition, some say the day is an insult to hardworking farmers, as Farmers' Day, enacted in Korea in 1996 to promote farming, also falls on November 11.`),
 why:'기념일의 시작이 학생 일화이자 마케팅'});
add({answer:'어린이날',major:'생활·상식',mid:'절기·기념일·축제',hintRisk:false,
 core:L('5월 5일, 어린이의 존엄과 지위 향상을 위해 정한 날',ko('어린이날'),'대한민국은 5월 5일 어린이날을 기념일과 공휴일로 지정하고 있다.'),
 story:[L('1923년 5월 1일에 열린 제1회 어린이날이 시작',ko('어린이날'),'1923년 5월 1일은 조선소년운동협회가 주최하여 전국적인 규모로 개최하기 시작한 제1회 어린이날이다.'),
 L('5월 1일은 노동절과 겹쳐 일본 당국의 감시와 탄압을 많이 받았다',ko('어린이날'),'5월 1일은 노동절하고 겹쳐서 일본 당국으로부터 감시와 탄압을 많이 받았다.'),
 L('1946년 5월 5일에 다시 부활했다',ko('어린이날'),`1938년부터 중단되었다가, 1945년 광복 이후 '어린이'를 존중하는 마음을 살리기 위해 1946년 5월 5일에 다시 부활되었다.`)],
 hintIdea:L('1975년부터 공휴일이 되었다',ko('어린이날'),'이후 1973년에는 기념일로 지정하였다가 1975년부터 공휴일로 지정되었다.'),
 why:'처음엔 5월 1일이었다'});
add({answer:'식목일',also:['아버데이'],major:'생활·상식',mid:'절기·기념일·축제',hintRisk:false,
 core:L('나무를 아끼고 잘 가꾸도록 권장하기 위해 제정한 날',ko('식목일_(대한민국)'),'식목일(植木日, Arbor Day, 라틴어 arbor는 tree를 의미)은 나무를 아끼고 잘 가꾸도록 권장하기 위하여 제정한 날이다.'),
 story:[L('4월 5일은 신라 문무왕 때 당 세력을 몰아낸 날을 양력으로 환산한 것이다',ko('식목일_(대한민국)'),'4월 5일이라는 날짜는 신라 문무왕 때인 677년, 당의 세력을 몰아낸 날인 음력 2월 25일을 양력(그레고리력)으로 환산한 것이다.'),
 L('조선 성종이 선농단에서 제사를 지낸 날이기도 하다',ko('식목일_(대한민국)'),'또, 조선 성종이 선농단에서 제사를 지낸 날이기도 하다.')],
 hintIdea:L('1872년 미국 네브래스카주에서 첫 행사가 열렸다',ko('식목일_(대한민국)'),'1872년 4월 10일 미국 네브래스카주에서 제1회 식목 행사가 열렸으며'),
 why:'날짜가 신라 때 사건에서 왔다',care:'날짜 유래는 위키 서술 — 해설에 "~라고 합니다" 권장'});
add({answer:'광복절',major:'생활·상식',mid:'절기·기념일·축제',care:'정치 아닌 기념일 사실만',
 core:L('1945년 8월 15일 일제 통치에서 해방된 것을 기념하는 국경일',ko('광복절'),'광복절(光復節)은 1945년 8월 15일 일본이 항복하였음으로 8월 16일 한반도(우리나라)가 35년간의 일본 식민통치로부터 해방되어 일본 제국주의자들에게 빼앗겼던 나라의 주권을 되찾은 것을 기념하기 위해 제정한 국경일이다.'),
 story:[L('이름에 독립 대신 복(復)을 쓴 까닭은 이전에도 오랫동안 독립을 유지했음을 강조하기 위해서다',ko('광복절'),'이름에 "독립(獨立)"대신 "복(復)"이라는 단어를 사용한 이유는 한국이 일본의 통치 이전에 수천 년 동안 독립을 유지했음을 강조하기 위해서다.'),
 L('1948년 대한민국 정부 수립일과도 겹친다',ko('광복절'),'또한 이 날은 1948년 대한민국의 정부 수립일과도 겹친다.'),
 L('남한과 북한이 모두 기념한다',ko('광복절'),'매년 8월 15일이며, 광복절은 남한과 북한에서 모두 기념하는 유일한 정치적 공휴일이다.')],
 hintIdea:L('이름의 뜻은 빛이 돌아온 날이다',ko('광복절'),'대한민국에서는 광복절(光復節)이라고 하며, 빛이 돌아온 날이라는 의미다.'),
 why:'이름에 독립이 아닌 되찾음(復)을 쓴 까닭'});
add({answer:'주식',also:['stock','share'],major:'인문·사회',mid:'경제·금융 상식',
 core:L('주식회사의 자본을 구성하는 단위',ko('주식'),'주식(株式, 영어: share, stock)이란 기본적으로 주식회사의 자본을 구성하는 단위이며, 사원인 주주가 주식회사에 출자한 일정한 지분 또는 이를 나타내는 증권을 말한다.'),
 story:[L('세계 최초급 주식회사 중 하나가 네덜란드 동인도회사(VOC)',en('Dutch_East_India_Company'),'commonly known as the Dutch East India Company, was a chartered trading company and one of the first joint-stock companies in the world.'),
 L('시민 누구나 살 수 있었고 야외 시장에서 사고팔았으며 그 하나가 암스테르담 증권거래소가 됐다',en('Dutch_East_India_Company'),'Shares in the company could be purchased by any citizen of the Dutch Republic and bought and sold in open-air secondary markets, one of which became the Amsterdam Stock Exchange.')],
 hintIdea:null,why:'주식시장의 시작은 야외 시장'});
add({answer:'동전',also:['주화','coin'],major:'인문·사회',mid:'경제·금융 상식',care:'표준국어대사전 동전(同前)은 다른 낱말 — 금속 화폐 뜻(銅錢)으로 사용',
 core:L('금속을 주물로 떠서 만든 화폐',ko('동전'),'주화(鑄貨)는 금속을 주물로 떠서 만든 화폐이다.'),
 story:[L('가장 오래된 동전은 기원전 7세기 후반 아나톨리아 리디아 왕국과 연관된다',en('Coin'),'The earliest coins are mostly associated with Iron Age Anatolia of the late 7th century BC, and especially with the kingdom of Lydia perhaps during the reign of Gyges, more certainly as electrum coins minted for king Alyattes of Lydia (died c. 560 BC).'),
 L('초기 리디아 동전 대부분은 글자 없이 상징 동물 그림만 있었다',en('Coin'),'Most of the early Lydian coins include no writing ("legend" or "inscription"), only an image of a symbolic animal.')],
 hintIdea:L('앞면과 뒷면을 영어로 Obverse 와 Reverse 라 한다',ko('동전'),'동전이나 메달의 면은 앞면과 뒷면을 각각 지칭하여 앞면(Obverse)과 뒷면(Reverse)이라고도 한다.'),
 why:'최초의 동전엔 글자가 없었다'});
add({answer:'투표',also:['비밀투표'],major:'인문·사회',mid:'정치·법 상식',care:'제도 설명만',
 core:L('투표용지를 던지거나 구두로 대표자를 선택하는 과정',ko('투표'),'투표(投票, 영어: voting)는 구두 투표 또는 투표용지를 던져 한 명 이상의 벼슬아치 또는 대표자를 선택하는 과정이다.'),
 story:[L('고대 그리스에서 비밀투표가 도편추방 등에 쓰였다',en('Secret_ballot'),'In ancient Greece, secret ballots were used in several situations like ostracism and also to remain hidden from people seeking favors.'),
 L('호주에서는 1856년 태즈메이니아에서 처음 시행된 것으로 보인다',en('Secret_ballot'),'In Australia, secret balloting appears to have been first implemented in Tasmania on 7 February 1856.'),
 L('미국에서 이 방식을 처음 채택한 도시는 켄터키 루이빌이다',en('Secret_ballot'),'Louisville, Kentucky, was the first city in the United States to adopt the Australian ballot.')],
 hintIdea:null,why:'비밀투표가 호주식이라 불린 까닭'});
add({answer:'홍차',also:['black tea'],major:'생활·상식',mid:'술·음료',legend:true,care:'푸젠성 이야기는 전설로',
 core:L('찻잎을 많이 산화시킨 차의 일종',ko('홍차'),'홍차(紅茶)는 백차, 녹차, 우롱차보다 더 많이 산화된 차(Camellia Sinensis)의 일종이다.'),
 story:[L('동양에서는 찻물이 붉어 홍차, 서양에서는 찻잎이 검어 black tea 라 부른다',ko('홍차'),`동양에서는 찻물의 빛이 붉기 때문에 홍차(紅茶)라고 부르지만, 서양에서는 찻잎의 검은 색깔 때문에 'black tea (검은색 차)'라고 부른다.`),
 L('청나라 군대가 머문 마을에서 찻잎이 상해 소나무 가지로 말려 만든 것이 시작이라 전해진다',ko('홍차'),'병사들은 찻잎이 쌓여있는 광에 들어가 머물면서 먹고 자고 하면서 시간을 보내다가 사라졌는데, 찻잎은 병사들이 머무는 동안 차로 만들 시기를 놓쳐 상해버리고 말았다.')],
 hintIdea:L('서양에서 red tea 는 남아프리카공화국의 루이보스를 뜻한다',ko('홍차'),`서양에서 'red tea'는 보통 남아프리카공화국의 루이보스 차를 의미한다.`),
 why:'동양은 붉다 서양은 검다'});
const norm=s=>s.replace(/\s+/g,' ');
const bad=[];
items.forEach((it,i)=>{it.key='n'+(2101+i);
 for(const f of [it.core,...it.story,it.hintIdea].filter(Boolean)){
  const file=F[f.url]; if(!file){bad.push([it.answer,'nofile',f.url]);continue;}
  if(!norm(fs.readFileSync(file,'utf8')).includes(norm(f.quote))) bad.push([it.answer,f.quote.slice(0,60)]);
 }});
console.log(items.length,JSON.stringify(bad,null,1));
const urls=new Set();items.forEach(it=>[it.core,...it.story,it.hintIdea].filter(Boolean).forEach(f=>urls.add(f.url)));
const out={done:true,chunk:'새재료-21',lane:'easy',items,dropped:{dupActive:11,weakStory:3,noSource:2,other:1},opened:urls.size+8};
fs.writeFileSync('../chunk-21.json',JSON.stringify(out,null,1));

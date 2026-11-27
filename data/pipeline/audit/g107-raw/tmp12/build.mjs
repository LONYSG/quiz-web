import fs from 'fs';
const W=t=>`https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g,'_'))}`;
const K=t=>`https://ko.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g,'_'))}`;
const F=(l,t)=>`w-${l}-${t.replace(/[\/ ?]/g,'_')}.txt`;
const S=(l,t,q,text)=>({text,url:(l=='en'?W:K)(t),quote:q,_f:F(l,t)});
const it=[];
const add=(o)=>it.push(o);
const R="Rollin' (Brave Girls song)", T="Tell Me (Wonder Girls song)", Q="쿨 (음악 그룹)", B="불타는 청춘 (텔레비전 프로그램)", SK="스타킹 (텔레비전 프로그램)", G="Girls' Generation", KA="Kara (South Korean group)", PG="Pokémon Go", W6="2006 World Baseball Classic", W9="2009년 월드 베이스볼 클래식";
add({answer:"롤린",also:["Rollin'","Rollin","브레이브걸스 롤린"],major:"한국",mid:"한국 대중음악",g:3,
core:S('en',R,"Rollin' (Korean: 롤린) is a song by South Korean girl group Brave Girls.","브레이브걸스의 노래 '롤린'(2017)"),
story:[S('en',R,"A sleeper hit, \"Rollin initially failed to chart in South Korea following its release.","2017년 발표 당시에는 차트에 오르지 못했다"),
S('en',R,"Four years later, the song experienced a sudden surge in popularity when a compilation video of Brave Girls performing it for the South Korean military went viral in the country in February 2021.","4년 뒤 2021년 2월 군 장병 앞 공연 모음 영상이 퍼지며 역주행"),
S('en',R,"It soon became a nationwide hit, and achieved number one on both the Gaon Digital Chart and the K-pop Hot 100","가온 디지털 차트와 K-pop Hot 100 1위")],
hint:S('en',R,"On August 11, 2018, the group released \"Rollin' (New Version)\", a rearranged version of the song, as a gift to fans for their passionate support of the song over the course of the previous year and a half.","2018년 팬 선물로 편곡판을 따로 냈다"),
why:"발표 4년 뒤 군 장병 영상 하나로 1위까지 간 역주행의 대표 사례"});
add({answer:"텔미",also:["Tell Me","Tell Me (원더걸스)"],major:"한국",mid:"한국 대중음악",g:3,
core:S('en',T,"\"Tell Me\" is a song by South Korean girl group Wonder Girls, from their debut album The Wonder Years (2007).","원더걸스 데뷔 앨범의 타이틀곡 '텔미'(2007)"),
story:[S('en',T,"When producer Park Jin-young first introduced the song to the group, the Wonder Girls felt that the song was too different and would not be successful.","처음 곡을 받은 멤버들은 너무 낯설어 성공하지 못할 것 같다고 느꼈다"),
S('en',T,"The song gained significant attention throughout South Korea for its choreography, which was widely imitated and featured on various online video sites.","따라 추기 쉬운 안무가 온라인 영상 사이트에서 널리 퍼졌다"),
S('en',T,"It spent six non-consecutive weeks in the number one position on the domestic music program Music Bank","뮤직뱅크 1위 6주(비연속)")],
hint:S('en',T,"A highlight of the song is an exclamation of surprise, \"어머나!\"","'어머나!' 감탄사가 핵심 대목"),
why:"처음엔 멤버들이 걱정했던 곡이 국민 유행 춤이 된 이야기"});
add({answer:"쿨",also:["Cool","쿨 (그룹)"],major:"한국",mid:"한국 대중음악",g:3,
core:S('ko',Q,"쿨(Cool)은 대한민국의 3인조 혼성 그룹이다","남자 둘 여자 하나의 3인조 혼성 그룹 쿨"),
story:[S('ko',Q,"그룹명 '쿨(Cool)'의 이름과 맞물려 대한민국에서 대표적인 여름 가요 그룹으로 꼽힌다","시원한 댄스곡으로 이름 그대로 여름 가요 대표"),
S('ko',Q,"2002년 발매한 정규 7집이 그 해 가장 많이 팔린 음반으로 기록되면서, 혼성 그룹 최초로 연간 음반 판매량 1위라는 대기록을 세웠다.","2002년 7집이 혼성 그룹 최초 연간 음반 판매 1위"),
S('ko',Q,"노래방에서는 쿨의 노래가 가장 많이 수록된 것으로 조사되기도 했다.","노래방에 가장 많이 실린 가수로 조사")],
hint:S('ko',Q,"또한 그해 열린 제17회 골든 디스크 시상식에서는 대상을 수상하면서 혼성 그룹 최초 골든 디스크 대상 수상이라는 기록을 남겼다.","혼성 그룹 최초 골든디스크 대상"),
why:"이름처럼 여름을 대표하고 혼성 그룹 최초 기록을 세운 팀"});
add({answer:"젝스키스",also:["Sechs Kies"],major:"한국",mid:"한국 대중음악",g:3,
core:S('en',"Sechs Kies","is a first generation South Korean boy band.","1세대 한국 보이그룹 젝스키스"),
story:[S('en',"Sechs Kies","The agency originally planned to debut Eun Ji-won and Kang Sung-hoon in South Korea as a duo, but with the success of SM Entertainment's male idol group H.O.T., the agency shifted gears to debut a six-member male idol group instead.","원래 2인조로 데뷔시키려다 H.O.T. 성공을 보고 6인조로 바꿨다"),
S('en',"Sechs Kies","Sechs Kies formally disbanded on May 20, 2000, after three years of activity. On April 14, 2016, the group reunited for a performance as part of the show Infinite Challenge.","2000년 해체 후 2016년 무한도전 무대로 재결합")],
hint:null,why:"2인조가 될 뻔했던 그룹이 6인조로 바뀐 사연과 16년 만의 무한도전 재회"});
add({answer:"버스커 버스커",also:["버스커버스커","Busker Busker"],major:"한국",mid:"한국 대중음악",g:3,
core:S('en',"Busker Busker","is a South Korean indie band who rose to fame through their runner-up performance in the South Korean music audition television program Superstar K3 on Mnet.","슈퍼스타K3 준우승으로 알려진 3인조 밴드"),
story:[S('en',"Busker Busker","Prior to Brad Moore joining the band, the band's name was Pinky Pinky and was only a subset of the total Busker Busker group.","원래 '버스커 버스커'는 여러 사람이 모인 공연 모임이고 그 일부가 핑키핑키라는 이름이었다"),
S('en',"Busker Busker","At the same time, Jang, Kim, and Moore were participating in the Superstar K3 auditions as a trio, because they were the only members of the band that were able to participate in the process.","오디션에 나갈 수 있는 사람이 셋뿐이라 3인조로 참가했다"),
S('en',"Busker Busker","Busker Busker 1st Album and its single \"Cherry Blossom Ending\" were released in March 2012.","2012년 3월 1집과 '벚꽃 엔딩'")],
hint:null,why:"거리 공연 모임에서 나온 팀이 오디션에 셋만 나가 3인조가 된 사연"});
add({answer:"소녀시대",also:["Girls' Generation","SNSD"],major:"한국",mid:"한국 대중음악",g:2,
core:S('en',G,"is a South Korean girl group formed by SM Entertainment.","SM엔터테인먼트의 걸그룹 소녀시대"),
story:[S('en',G,"Girls' Generation debuted on August 5, 2007, with the single \"Into the New World\" from their eponymous Korean album.","2007년 8월 5일 '다시 만난 세계'로 데뷔"),
S('en',G,"the single \"Gee\", which claimed the top spot on KBS's Music Bank for a record-breaking nine consecutive weeks","'Gee'로 뮤직뱅크 9주 연속 1위"),
S('en',G,"Their second Korean studio album, Oh! (2010), won the Golden Disc award for Album of the Year (Disk Daesang), making the group the first and only female act to win the Album Daesang.","2집 'Oh!'로 골든디스크 음반 대상, 여성 가수 첫 수상")],
hint:S('en',G,"Girls' Generation has earned numerous accolades and the honorific nickname \"The Nation's Girl Group\" in their home country.","'국민 걸그룹'이라는 별칭"),
why:"뮤직뱅크 9주 연속 1위, 여성 가수 첫 음반 대상"});
add({answer:"카라",also:["Kara","KARA"],major:"한국",mid:"한국 대중음악",g:3,
core:S('en',KA,"is a South Korean girl group formed by DSP Media in 2007.","2007년 DSP미디어가 만든 걸그룹 카라"),
story:[S('en',KA,"However, their debut was a commercial failure.","2007년 데뷔는 상업적으로 실패"),
S('en',KA,"They saw an increase in recognition in 2009, where they received significant attention for the \"butt dance\" choreography in \"Mister\".","2009년 '미스터'의 엉덩이 춤으로 주목"),
S('en',KA,"Their Japanese debut was a commercial success, where they became the first foreign female group to top the Oricon Singles Chart in 30 years.","일본에서 외국 여성 그룹으로 30년 만에 오리콘 싱글 1위")],
hint:null,why:"데뷔 실패에서 미스터 춤으로 일어나 일본 오리콘까지 간 이야기"});
add({answer:"무한걸스",also:[],major:"한국",mid:"한국 방송·예능",g:3,
core:S('ko',"무한걸스","《무한걸스》는 MBC에서 방송 중인 《무한도전》의 재창조 형식의 프로그램으로, 여섯 명의 여자로 구성된 멤버가 도전하는 것을 표방하고 있다.","무한도전을 여성 멤버로 재창조한 프로그램"),
story:[S('ko',"무한걸스","방송 당시 시즌 1의 멤버들은 가수에 도전해 실제로 음반을 내고 차력쇼를 선보이는 등 매회 새로운 도전을 선보였다.","시즌1 멤버들이 가수에 도전해 실제 음반을 내고 차력쇼도 했다"),
S('ko',"무한걸스","《무한걸스》는 2007년 9월 23일부터 MBC 드라마넷에서 파일럿 프로그램으로 방영한 이후","2007년 MBC 드라마넷 파일럿으로 시작")],
hint:null,why:"무한도전의 여성판으로 진짜 음반까지 낸 도전 예능"});
add({answer:"불타는 청춘",also:["불청"],major:"한국",mid:"한국 방송·예능",g:3,
core:S('ko',B,"예전 최고의 인기를 구가하던 하이틴 스타들이 1박 2일의 여행을 떠나 서로 자연스럽게 알아가며 진정한 친구가 되어가는 과정을 그리는 프로그램이다.","옛 하이틴 스타들이 1박 2일 여행으로 친구가 되어 가는 SBS 예능"),
story:[S('ko',B,"2015년 2월 18일 : 설 특집 파일럿 편성","2015년 설 특집 파일럿으로 시작"),
S('ko',B,"2015년 3월 27일 : 매주 금요일 밤 11시 20분에 정규 편성되어 첫 방송되었다.","2015년 3월 금요일 밤 정규 편성"),
S('ko',B,"짧게는 2회에서 길게는 4회까지 방송을 한다.","한 여행지를 2~4회에 나눠 방송")],
hint:S('ko',B,"약칭으로 불청이라고도 부른다.","줄여서 '불청'"),why:"설 특집에서 정규가 된 중년 스타 여행 예능"});
add({answer:"놀라운 대회 스타킹",also:["스타킹"],major:"한국",mid:"한국 방송·예능",g:3,
core:S('ko',SK,"대한민국 사상 최초의 서바이벌 콘테스트 프로그램","일반인이 장기를 겨루는 SBS 서바이벌 콘테스트"),
story:[S('ko',SK,"처음에는 2006년 10월 4일 추석특집 때 시범 제작 프로그램으로 한 번 방송을 한 적이 있었다.","2006년 추석특집 시범 방송으로 시작"),
S('ko',SK,"2006년 12월 16일에 다시 파일럿으로 방송되었다.","같은 해 12월 두 번째 파일럿"),
S('ko',SK,"마침내 2007년 1월 13일부터 고정편성이 확정되어","2007년 1월 고정 편성")],
hint:null,why:"시범 방송을 두 번 거치고서야 정규가 됐다"});
add({answer:"맛있는 녀석들",also:["맛녀석","마녀"],major:"한국",mid:"한국 방송·예능",g:3,
core:S('ko',"맛있는 녀석들","전국 곳곳의 식당들을 방문하여 먹방을 하고, 더 맛있게 먹는 법을 공유하는 프로그램이다.","식당을 찾아 먹방하는 예능"),
story:[S('ko',"맛있는 녀석들","'쪼는 맛' 이라는 이름으로 여러 가지 복불복 게임을 통해 못 먹게 될 사람 한 명을 정하거나","먹기 전 '쪼는 맛' 복불복으로 못 먹을 사람을 정한다"),
S('ko',"맛있는 녀석들","초기에는 쪼는 맛에 걸린 사람은 아예 먹지 못했지만 9 회부터 '한 입만' 이라는 규칙 이 생겼다.","처음엔 아예 못 먹었는데 9회부터 '한 입만' 규칙"),
S('ko',"맛있는 녀석들","짧게 맛녀석, 마녀라고 한다.","줄임말 맛녀석·마녀")],
hint:null,why:"못 먹는 벌칙이 '한 입만'으로 바뀐 사연"});
add({answer:"뮤직뱅크",also:["Music Bank","뮤뱅"],major:"한국",mid:"한국 방송·예능",g:3,
core:S('ko',"뮤직뱅크","KBS 2TV에서 금요일 오후 5시 15분 방송 중인 대중 음악 프로그램이다.","KBS 2TV 대중음악 순위 프로그램"),
story:[S('ko',"뮤직뱅크","1998년 6월 16일 《뮤직뱅크》가 첫 방송되었으며","1998년 6월 첫 방송"),
S('ko',"뮤직뱅크","2001년 8월 9일 순위제에 대한 논란이 제기되면서 리퀘스트 형식으로 전환되었고, 순위제는 전면적으로 중지되었다.","2001년 순위제 논란으로 순위 발표를 중지"),
S('ko',"뮤직뱅크","2008년 2월 15일, K-Chart를 통해 순위제가 완전 부활하였다.","2008년 2월 K-Chart로 순위제 부활")],
hint:S('ko',"뮤직뱅크","KBS 신관 공개홀에서 촬영된다.","여의도 KBS 신관 공개홀에서 촬영"),why:"순위를 없앴다가 7년 만에 되살린 음악 방송"});
add({answer:"불후의 명곡",also:["불후의 명곡 - 전설을 노래하다","불명"],major:"한국",mid:"한국 방송·예능",g:3,
core:S('ko',"불후의 명곡","《불후의 명곡》은 매주 토요일 저녁 6시 5분에 방송되는 음악 프로그램이다.","토요일 저녁 방송 KBS 음악 경연 프로그램"),
story:[S('ko',"불후의 명곡","초창기에는 출연자들을 아이돌로 한정하여 경합 하다가 《불후의 명곡 2》로 독립한 후에는 실력파 가수 위주로 경연하고 있다.","처음엔 아이돌만 경합했고 '불후의 명곡 2' 독립 뒤 실력파 가수 중심"),
S('ko',"불후의 명곡","처음에는 《나는 가수다》와 달리 경연 후 음원을 공개하지 않았지만 2012년 2월 4일부터 멜론 등 각종 음악 사이트를 통해 공개하기 시작하였다.","처음엔 음원 비공개, 2012년 2월부터 공개"),
S('ko',"불후의 명곡","2012년 4월 7일부터 2020년 8월 15일까지 부분 개편으로 《불후의 명곡 - 전설을 노래하다》로 제목이 변경되었으며","2012~2020년 '전설을 노래하다'를 붙인 제목")],
hint:null,why:"아이돌 한정이던 경연이 지금의 전설 노래 무대로 바뀐 과정"});
add({answer:"포켓몬 GO",also:["포켓몬고","Pokémon Go","포켓몬 고"],major:"스포츠·게임",mid:"e스포츠·비디오게임",g:2,
core:S('en',PG,"is a 2016 augmented reality (AR) mobile game","2016년 증강현실 모바일 게임"),
story:[S('en',PG,"In South Korea, Pokémon Go was not officially released due to restrictions imposed on online mapping data. However, a glitch allowed the game to function in a small area around Sokcho, in the northeastern part of the country, which was mistakenly considered part of Niantic's North Korea mapping region.","한국에서는 정식 출시 전 오류로 속초 일대에서만 작동"),
S('en',PG,"Bus tickets from Seoul to Sokcho sold out, and locals shared information about free Wi-Fi spots with tourists.","서울발 속초행 버스표가 매진, 주민들은 무료 와이파이 정보를 공유"),
S('en',PG,"Players even discovered a Gym in Panmunjom, near the Korean Demilitarized Zone, but Niantic later removed it.","판문점 근처에서 체육관이 발견되었다가 삭제")],
hint:null,why:"지도 오류 덕분에 속초만 포켓몬이 나온 2016년 여름",care:"속초 지역 이름이 정답 힌트가 되지 않게"});
add({answer:"월드 베이스볼 클래식",also:["WBC","World Baseball Classic"],major:"스포츠·게임",mid:"야구",g:3,
core:S('ko',W9,"전 세계의 프로 야구 리그 선수들의 참여하는 국가 대표팀 대회이다.","프로 선수가 참여하는 야구 국가대표 대회"),
story:[S('en',W6,"was the inaugural tournament between national baseball teams that included players from Major League Baseball.","2006년 첫 대회"),
S('en',W6,"Although South Korea defeated Japan twice in the earlier rounds, they were matched against each other again in the semifinals","한국은 일본을 두 번 이겼지만 준결승에서 다시 만나 졌다"),
S('ko',W9,"이번 대회에서는 일본이 첫 대회에 이어서 2연속 우승을 거머쥐었고, 이어 대한민국이 2위","2009년 한국 준우승")],
hint:null,why:"2006 4강 - 2009 준우승, 일본과 거듭 맞붙은 대회"});
const out=[];let bad=0,n=1101;
for(const o of it){
 const chk=s=>{if(!s)return s;const t=fs.readFileSync(s._f,'utf8');if(!t.replace(/\s+/g,' ').includes(s.quote.replace(/\s+/g,' '))){console.log('BAD',o.answer,s.quote.slice(0,50));bad++}const {_f,...r}=s;return r};
 out.push({key:'n'+String(n++).padStart(4,'0'),answer:o.answer,also:o.also,spelling:"?",major:o.major,mid:o.mid,gradeGuess:o.g,core:chk(o.core),story:o.story.map(chk),hintIdea:o.hint?chk(o.hint):null,legend:false,care:o.care||"",why:o.why,dupOff:null});
}
console.log(out.length,bad);
fs.writeFileSync('out.json',JSON.stringify({done:true,chunk:"새재료-12",lane:"pop",items:out,dropped:{dupActive:5,weakStory:4,noSource:0,other:3},opened:45},null,1));

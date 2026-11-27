import fs from 'fs';
const W=t=>`https://en.wikipedia.org/wiki/${t}`;
const S='스포츠·게임',T='기술·의학',H='인문·사회';
const I=[];
const add=(answer,also,major,mid,g,core,story,hint,legend,care,why)=>I.push({answer,also,spelling:'?',major,mid,gradeGuess:g,core,story,hintIdea:hint,legend,care,why,dupOff:null});
const f=(text,url,quote)=>({text,url,quote});
const bw='Ten-pin_bowling';
add('볼링',['bowling','텐핀 볼링'],S,'농구·배구·기타 구기',1,
 f('볼링은 레인 위로 공을 굴려 열 개의 핀을 쓰러뜨리는 경기',W(bw),'Tenpin bowling is a type of bowling in which a bowler rolls a bowling ball down a wood or synthetic lane toward ten pins'),
 [f('1841년 미국 코네티컷주가 도박·범죄와 엮인다며 아홉 개 핀 볼링(나인핀)을 금지했다',W(bw),'An 1841 Connecticut law banned ninepin bowling because of its perceived association with gambling and crime'),
  f('금지를 피하려고 핀을 하나 더 세웠다고 전해진다',W(bw),'people were said to circumvent the prohibition by adding a tenth pin'),
  f('현대 텐핀 볼링은 독일의 케겔슈필에서 주로 유래했다',W(bw),'Modern tenpin bowling derives mainly from the German Kegelspiel, or kegeling')],null,true,'열 번째 핀 이야기는 "~라고 전해진다" 꼴','금지법을 피하려다 열 개가 된 핀');
const bg='Bingo_(American_version)';
add('빙고',['bingo'],S,'보드게임·카드게임',1,
 f('빙고는 이탈리아 로또에서 이어진 숫자 맞추기 게임이다',W(bg),'A game of chance named lotto was being played in Italy by about 1530.'),
 [f('이름의 유래는 알려지지 않았다',W(bg),'The origin of the name Bingo is unknown but may date to the mid-1920s.'),
  f('원래 이름은 "비노"였는데 이긴 친구가 흥분해 "빙고"라고 외쳤다는 이야기가 있다',W(bg),'There are claims that one of Lowe\'s friends was so excited to have won that she yelled out "Bingo" instead of "Beano,"')],null,true,'이름 유래는 주장일 뿐 확정 아님','이름이 실수로 외친 한마디에서 왔다는 설');
const hh='Hula_hoop';
add('훌라후프',['hula hoop','훌라 후프'],S,'격투기·육상·수영',1,
 f('플라스틱 고리를 허리로 돌리는 놀이 기구. 하와이 훌라 춤에서 이름을 땄다',W(hh),'naming it "hula hoop" after the Hawaiian hula dance'),
 [f('현대 훌라후프는 호주의 대나무 고리에서 영감을 얻었다',W(hh),'The modern hula hoop was inspired by Australian bamboo hoops.'),
  f('4개월이 안 되어 2500만 개가 팔렸다',W(hh),'twenty-five million plastic hoops were sold in less than four months'),
  f('고리는 기원전 500년부터 쓰였다',W(hh),'They have been used by children and adults since at least 500 BC.')],null,false,'','춤 이름이 붙은 호주식 대나무 고리');
const bj='Bungee_jumping';
add('번지점프',['번지 점프','bungee jumping'],S,'격투기·육상·수영',1,
 f('번지점프의 뿌리는 젊은 남자들이 발목에 덩굴을 묶고 나무 탑에서 뛰어내리는 의례',W(bj),'young men jump from tall wooden platforms with vines tied to their ankles.'),
 [f('근대 첫 번지점프는 옥스퍼드대 위험 스포츠 클럽 회원들이 뛰었다',W(bj),'members of the Oxford University Dangerous Sports Club'),
  f('장소는 영국 클리프턴 현수교(76m)',W(bj),'the 76-metre (250 ft) Clifton Suspension Bridge'),
  f('번지라는 낱말의 기원은 불분명하다',W(bj),'unknown origin')],null,false,'정답이 "번지점프"인 대표 사실은 의례 설명이라 질문은 "현대 놀이의 뿌리" 꼴로','발상은 덩굴을 발목에 묶고 뛰는 섬 의례에서');
const dt='Darts';
add('다트',['darts','다트 게임'],S,'농구·배구·기타 구기',1,
 f('다트는 작고 뾰족한 화살을 과녁에 던지는 경기',W(dt),'Darts is a competitive sport in which two or more players bare-handedly throw small sharp-pointed projectiles'),
 [f('원래 과녁은 나무 줄기 단면이었을 것이다',W(dt),'The original target in the game was likely a cross-section of a tree trunk,'),
  f('숫자 배열은 랭커셔의 목수 브라이언 게믈린이 1896년에 만들었다고 하나 논란이 있다',W(dt),'The standard numbered point system is attributed to Lancashire carpenter Brian Gamlin')],null,true,'게믈린 설은 논란 있음','과녁 숫자는 못 맞히면 벌점이 되게 짠 배치');
const sb='Skateboarding';
add('스케이트보드',['skateboard','스케이트 보드'],S,'격투기·육상·수영',1,
 f('스케이트보드는 보드를 타고 기술을 부리는 액션 스포츠',W(sb),'Skateboarding is an action sport that involves riding and performing tricks using a skateboard,'),
 [f('1940년대 말~50년대 초 캘리포니아에서 파도가 없을 때 서퍼들이 즐기며 시작했다',W(sb),'when surfers in California wanted something to do when the waves were flat.'),
  f('처음엔 "길 위의 서핑"이라 불렀다',W(sb),'This was called "sidewalk surfing"'),
  f('첫 스케이트보드는 나무 상자에 롤러스케이트 바퀴를 붙인 것',W(sb),'The first skateboards started with wooden boxes, or boards, with roller skate wheels attached to the bottom.')],null,false,'','파도 없는 날 서퍼의 심심풀이');
const tt='Table_tennis';
add('탁구',['table tennis','핑퐁','ping-pong'],S,'농구·배구·기타 구기',1,
 f('탁구는 빅토리아 시대 영국 상류층의 식후 실내 놀이에서 시작했다',W(tt),'The sport originated in Victorian England, where it was played among the upper-class as an after-dinner parlour game.'),
 [f('책을 세워 네트로 썼다',W(tt),'A row of books stood upright along the centre of the table as a net'),
  f('"핑퐁"은 1901년 제이크스 사가 상표로 등록했다',W(tt),'The name was in wide use before British manufacturer J. Jaques & Son Ltd trademarked it in 1901.'),
  f('1901년 미국 여행에서 셀룰로이드 공을 발견해 경기에 맞춤이었다',W(tt),'discovered novelty celluloid balls on a trip to the US in 1901 and found them ideal for the game.')],null,false,'','책 더미 네트에서 시작된 식후 놀이');
const cs='Cue_sports';
add('당구',['billiards','당구장'],S,'농구·배구·기타 구기',1,
 f('당구는 큐 막대로 공을 치는 경기',W(cs),'Cue sports are a wide variety of games of skill played with a cue stick, which is used to strike billiard balls'),
 [f('당구는 야외 잔디 막대·공 놀이가 실내 게임으로 발전했다',W(cs),'All cue sports are generally regarded to have evolved into indoor games from outdoor stick-and-ball lawn games'),
  f('프랑스 루이 11세가 최초로 알려진 실내 당구대를 가졌다',W(cs),'King Louis XI of France (1461–1483) had the first known indoor billiard table.'),
  f('"큐"는 프랑스어로 꼬리를 뜻하는 queue 에서 왔다',W(cs),"Cue itself came from queue, the French word for 'tail'.")],null,false,'','큐의 뜻이 "꼬리"');
const em='Ray_Tomlinson';
add('이메일',['전자우편','e-mail','email','전자 메일'],T,'컴퓨터·인터넷',1,
 f('이메일은 컴퓨터 네트워크로 주고받는 전자 우편이다',W('Email'),'Electronic mail (usually shortened to email; alternatively hyphenated e-mail) is a method of transmitting and receiving digital messages using electronic devices over a computer network.'),
 [f('주소의 @ 는 사용자 이름과 컴퓨터 주소를 가르려고 쓰였다',W(em),'The symbol was chosen because it was not used in usernames or in TENEX programming.'),
  f('1971년 첫 네트워크 이메일이 보내졌다',W('Email'),"In 1971 the first ARPANET network mail was sent, introducing the now-familiar address syntax with the '@' symbol designating the user's system address."),
  f('첫 메일 내용은 남아 있지 않다',W(em),'The content of the message was not preserved.')],null,false,'"첫 메일은 QWERTYUIOP" 는 흔한 오해라 쓰지 않는다','@ 는 아무도 안 쓰던 기호라 뽑혔다');
const sg='Safety_glass';
add('안전유리',['safety glass','접합유리','강화유리'],T,'재료·건설 기술',2,
 f('안전유리는 깨져도 위험이 적도록 만든 유리(강화·접합·망입 유리)',W(sg),'Safety glass is glass with additional safety features that make it less likely to break, or less likely to become a hazard when broken.'),
 [f('접합유리는 1903년 프랑스 화학자 에두아르 베네딕투스가 발명했다',W(sg),'Laminated glass was invented in 1903 by the French chemist Édouard Bénédictus (1878–1930).'),
  f('실험실 사고에서 영감: 플라스틱(질산셀룰로오스)이 입혀진 플라스크가 떨어져 부서졌지만 조각이 흩어지지 않았다',W('Laminated_glass'),'inspired by a laboratory accident: a glass flask had become coated with the plastic cellulose nitrate,'),
  f('접합유리는 깨지면 거미줄 모양 금이 간다',W(sg),'This produces a characteristic "spider web" cracking pattern')],null,false,'정답이 "접합유리"만 되지 않게 안전유리 전반을 묻는다','실험실에서 떨어뜨린 플라스크가 힌트');
const pu='Pop-up_ad';
add('팝업 광고',['팝업','팝업창','pop-up ad'],T,'컴퓨터·인터넷',1,
 f('웹 페이지를 열면 별도 창으로 뜨는 광고',W(pu),'Pop-up ads originated on the Tripod.com webpage hosting site in the late 1990s.'),
 [f('만든 사람이 광고주 불만 때문에 이 방식을 썼다고 주장한다',W(pu),'Ethan Zuckerman claims he used that capability to launch advertisements in separate windows as a response to complaints from advertisers about their ads appearing on pages with sexual content.'),
  f('그는 나중에 그 성가심에 대해 사과했다',W(pu),'Zuckerman later apologized for the unforeseen nuisance pop-up ads had evolved into.')],null,false,'성적 소재가 원문에 나옴 — 문항에선 "광고주 불만"으로만','발명자가 훗날 공개 사과');
const hc='Helicopter';
add('헬리콥터',['helicopter','헬기'],T,'항공·우주 기술',1,
 f('헬리콥터는 수평으로 도는 회전 날개로 양력과 추력을 얻는 항공기',W(hc),'A helicopter is a type of rotorcraft in which lift and thrust are supplied by one or more horizontally-spinning rotors.'),
 [f('이름은 1861년 프랑스인 퐁통 다메쿠르가 지은 hélicoptère 에서 왔다',W(hc),"The English word helicopter is adapted from the French word hélicoptère, coined by Gustave Ponton d'Amécourt in 1861"),
  f('그리스어 helix(나선)와 pteron(날개)의 합성',W(hc),'pteron (πτερόν, "wing")'),
  f('기원전 400년경부터 중국 아이들이 대나무 비행 장난감을 가지고 놀았다',W(hc),'Since around 400 BC, Chinese children have played with bamboo flying toys (or Chinese top).')],null,false,'','이름 뜻이 "나선 날개"');
const as='Astronaut';
add('우주비행사',['astronaut','우주인','우주 비행사'],T,'항공·우주 기술',1,
 f('우주비행사는 우주 비행 프로그램에서 훈련받아 우주선의 지휘관·승무원이 되는 사람',W(as),'a person trained, equipped, and deployed by a human spaceflight program to serve as a commander or crew member'),
 [f('astronaut 는 그리스어 별(astron)과 뱃사람(nautes)에서 왔다',W(as),"ἄστρον (astron), meaning 'star', and ναύτης (nautes), meaning 'sailor'"),
  f('러시아는 cosmonaut, 중국은 taikonaut 이라는 말을 쓴다',W(as),'the informal term taikonaut (from the Mandarin "tàikōng" (太空), meaning "space")'),
  f('astronaut 는 국적과 상관없이 모든 우주 여행자에게 쓸 수 있다',W(as),"'Astronaut' technically applies to all human space travelers regardless of nationality.")],null,false,'질문에서 "별 뱃사람"만 힌트로','영어 뜻이 "별 뱃사람"');
const ds='Drinking_straw';
add('빨대',['스트로','drinking straw'],T,'재료·건설 기술',1,
 f('음료를 빨아 마시는 가느다란 관. 가장 오래된 빨대는 수메르인이 맥주를 마시던 것',W(ds),'The first known straws were made by the Sumerians and were used for drinking beer'),
 [f('1800년대엔 값싸고 부드러운 호밀 줄기가 유행했다',W(ds),'In the 1800s, the rye straw came into fashion because it was cheap and soft.'),
  f('1888년 마빈 스톤이 연필에 종이를 감아 종이 빨대를 만들었다',W(ds),'He wound paper around a pencil to make a thin tube, slid out the pencil from one end, and applied glue between the strips.'),
  f('구부러지는 빨대는 1937년 조지프 프리드먼이 딸을 보고 만들었다',W(ds),'The articulated straw was invented by Joseph Friedman in 1937.')],null,false,'','가장 오래된 빨대는 맥주용');
const ev='History_of_the_electric_vehicle';
add('전기 자동차',['전기차','전기자동차','electric vehicle','EV'],T,'자동차·교통',1,
 f('전기 자동차는 1830년대부터 만들어졌다',W(ev),'Between 1832 and 1839, Scottish inventor Robert Anderson developed a crude electric carriage.'),
 [f('1900년 미국 자동차의 38%가 전기, 22%가 휘발유였다',W(ev),'40 per cent of automobiles were powered by steam, 38 per cent by electricity, and 22 per cent by petrol'),
  f('1912년 전기 시동기 발명으로 손으로 돌리는 크랭크가 필요 없어졌다',W(ev),'the invention of the electric starter by Charles Kettering in 1912 eliminated the need of a hand starting crank.'),
  f('헨리 포드의 대량생산이 휘발유차 값을 낮췄다',W(ev),'the initiation of mass production of gas-powered vehicles by Henry Ford brought their price down')],null,false,'같은 문서에 28% 라는 다른 수치도 있어 숫자는 쓰지 않거나 대략으로','전기차가 휘발유차보다 먼저');
const fx='Fax';
add('팩스',['fax','팩시밀리','facsimile'],T,'컴퓨터·인터넷',1,
 f('팩스는 인쇄물(글·그림)을 전화로 보내는 전송 방식',W(fx),'is the telephonic transmission of scanned printed material (both text and images),'),
 [f('1843년 알렉산더 베인이 "전기 인쇄 전신기" 영국 특허를 받았다',W(fx),'He received British patent 9745 on May 27, 1843, for his "Electric Printing Telegraph".'),
  f('1865년 카셀리의 서비스는 전화 발명보다 약 11년 앞섰다',W(fx),'some 11 years before the invention of the telephone'),
  f('fax 는 facsimile 의 줄임말',W(fx),'Fax (short for facsimile), sometimes called telecopying or telefax (short for telefacsimile)')],null,false,'','전화보다 먼저 있었던 팩스');
const id='Indulgence';
add('면죄부',['면벌부','indulgence'],H,'종교·경전 상식',2,
 f('면죄부(면벌부)는 용서받은 죄의 벌을 줄여 주는 방법',W(id),'a way to reduce the amount of punishment one has to undergo for (forgiven) sins'),
 [f('1517년 교황 레오 10세가 성 베드로 대성당 재건을 위해 헌금 대가로 면벌을 베풀었다',W(id),"In 1517, Pope Leo X offered indulgences for those who gave alms to rebuild St. Peter's Basilica in Rome."),
  f('요한 테첼의 공격적인 홍보가 루터를 자극해 95개조 반박문이 나왔다',W(id),'The aggressive marketing practices of Johann Tetzel in promoting this cause provoked Martin Luther'),
  f('테첼의 말로 전해지는 "헌금 함에 동전이 울리면 연옥의 영혼이 튀어 오른다"',W(id),'As soon as a coin in the coffer rings, a soul from purgatory springs.')],null,false,'가톨릭 공식 교리를 대표하지 않는다는 점 주의(원문: oft-quoted saying was by no means representative)','종교개혁의 불씨');
const bk='Bankruptcy';
add('파산',['bankruptcy','파산 절차'],H,'경제·금융 상식',1,
 f('파산은 빚을 갚지 못하는 사람·단체가 법적으로 채무 면제를 구하는 절차',W(bk),'Bankruptcy is a legal process through which people or other entities who cannot repay debts to creditors may seek relief from some or all of their debts.'),
 [f('bankruptcy 는 이탈리아어 banca rotta, 곧 "부서진 은행(탁자)"에서 왔다',W(bk),"The word bankruptcy is derived from Italian banca rotta, literally meaning 'broken bank'."),
  f('르네상스 이탈리아에서 시작된 말로 흔히 설명되나 의례 자체는 의심받는다',W(bk),'the existence of such a ritual is doubted.')],null,true,'탁자를 부쉈다는 이야기는 "전해진다" 꼴','"부서진 탁자"가 파산의 어원이라는 설');
const ch='Cheque';
add('수표',['cheque','check'],H,'경제·금융 상식',1,
 f('수표는 은행에 돈을 내주라고 지시하는 문서',W(ch),'A cheque (or check in American English) is a document that orders a bank, building society, or credit union,'),
 [f('영어 check 는 프랑스어·라틴어·아랍어를 거쳐 페르시아어 shah(왕)에서 왔다고 설명된다',W(ch),'a term which came into English through French, Latin, Arabic, and ultimately from the Persian word shah'),
  f('아바스 왕조 상인들이 쓴 sakk 가 수표의 먼 조상',W(ch),'The čak became the sakk later used by traders in the Abbasid Caliphate and other islamic-ruled lands.'),
  f('금융의 check 는 위조를 막는다는 뜻에서 왔다는 설명도 있다',W(ch),'Etymological dictionaries attribute the financial meaning of check to come from "a check against forgery"')],null,false,'체스 용어 쪽 어원과 엮일 수 있어 하나만 고른다','수표와 체스 "체크"가 같은 뿌리');
const pp='Passport';
add('여권',['passport','패스포트'],H,'사회 제도',1,
 f('여권은 정부가 발급하는 신분·국적 증명 여행 문서',W(pp),"a formal travel document issued by a government that certifies a person's identity and nationality"),
 [f('성경 느헤미야서에 통행을 청하는 편지 이야기가 있다',W(pp),'gave him a letter "to the governors beyond the river" requesting safe passage'),
  f('영국 헨리 5세가 근대적 의미의 첫 영국 여권을 만들었다고 여겨진다',W(pp),'King Henry V of England is credited with having invented what some consider the first British passport in the modern sense'),
  f('제1차 세계대전 때 유럽 각국이 안보상 국경 여권 제도를 도입했다',W(pp),'During World War I, European governments introduced border passport requirements for security reasons')],null,false,'','전쟁 때문에 일반화된 여권');
const sl='Salary';
add('월급',['salary','급여','봉급'],H,'경제·금융 상식',1,
 f('월급(salary)은 고용주가 일정 기간마다 직원에게 주는 보수',W(sl),'A salary is a form of periodic payment from an employer to an employee, which may be specified in an employment contract.'),
 [f('salary 는 소금과 관련된 라틴어 salarium 에서 왔지만 연관은 정확히 모른다',W(sl),"The word \"salary\" comes from Latin salarium 'pertaining to salt' (sal 'salt'), but the exact connection is not known;"),
  f('로마 군단이 소금으로 급여를 받았다는 주장은 근거가 없다',W(sl),'a persistent modern claim that the Roman Legions were sometimes paid in salt is baseless.')],null,false,'통념 바로잡기: 소금으로 월급을 줬다는 이야기는 근거 없음','"소금 월급"은 널리 퍼진 오해');
const bf='Black_Friday_(shopping)';
add('블랙프라이데이',['블랙 프라이데이','Black Friday'],H,'경제·금융 상식',1,
 f('블랙프라이데이는 미국에서 추수감사절 다음 날인 금요일',W(bf),'Black Friday is the Friday after Thanksgiving in the United States.'),
 [f('이름은 필라델피아 경찰이 쇼핑 시즌 시작의 인파와 교통 혼잡을 가리켜 쓴 말에서 나왔다',W(bf),'to describe the crowds and traffic congestion accompanying the start of the Christmas shopping season.'),
  f('"장부가 적자(red)에서 흑자(black)로 바뀐다"는 풀이는 상인들이 1980년대 초에 내놓은 이론이다',W(bf),'When this was recorded in the financial records, once-common accounting practices would use red ink'),
  f('그 설명이 처음 실린 곳은 1981년 필라델피아 인콰이어러',W(bf),'The earliest known published reference to this explanation occurs in The Philadelphia Inquirer for November 28, 1981.')],null,false,'통념 바로잡기: 흑자 설명은 나중에 붙은 것','흑자 유래는 사실 상인들이 만든 해명');
const wl='Battle_of_Waterloo';
add('워털루 전투',['워털루','Battle of Waterloo'],H,'전쟁·군사사',1,
 f('1815년 6월 18일 나폴레옹이 연합군에 패한 마지막 전투',W(wl),"Waterloo was the decisive engagement of the Waterloo campaign and Napoleon's last."),
 [f('프랑스에서는 몽생장 전투로 불렸다',W(wl),'The battle was known contemporaneously as the Battle of Mont Saint-Jean in France'),
  f('프로이센에서는 여관 이름을 딴 "라 벨 알리앙스"로 불렀다',W(wl),'after the inn of La Belle Alliance'),
  f('나폴레옹의 프랑스군은 제7차 대불동맹의 두 군대에 패했다',W(wl),'was defeated by two armies of the Seventh Coalition')],null,false,'웰링턴 사령부가 마을에 있었다는 말은 원문에 없음 — 쓰지 않는다','이름이 나라마다 달랐던 전투');
const pt='Protestantism';
add('개신교',['프로테스탄트','Protestantism','프로테스탄티즘'],H,'종교·경전 상식',1,
 f('개신교는 종교개혁 때 로마 교회에서 갈라져 나온 기독교 교파',W(pt),'A Protestant is an adherent of any of those Christian bodies that separated from the Church of Rome during the Reformation'),
 [f('1529년 슈파이어 제국의회 칙령에 항의한 제후들이 처음 프로테스탄트라 불렸다',W(pt),'who issued a protest (or dissent) against the edict of the Diet of Speyer (1529)'),
  f('그 이름은 처음엔 정치적 뜻이었다',W(pt),'The term protestant, though initially purely political in nature, later acquired a broader sense')],null,false,'','이름이 "항의하는 사람들"');
const out=I.map((x,i)=>({key:'n'+(1201+i),...x}));
fs.writeFileSync('data/pipeline/audit/g107-raw/chunk-13.json',JSON.stringify({done:true,chunk:'새재료-13',lane:'easy',items:out,dropped:{dupActive:0,weakStory:0,noSource:0,other:9},opened:34},null,1));
console.log(out.length);

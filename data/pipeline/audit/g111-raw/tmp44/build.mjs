import fs from 'fs';
const ko=t=>'https://ko.wikipedia.org/wiki/'+t, en=t=>'https://en.wikipedia.org/wiki/'+t;
const S=(file,url,quote,text)=>({text,url,quote,_f:file});
const items=[
{answer:"살아있는 화석",also:["살아 있는 화석","living fossil"],major:"자연과학",mid:"동물",hr:true,
 spellNote:"한국어 위키백과 표제어(살아있는 화석)를 따름 · 표준국어대사전에는 없음 · also 에 띄어 쓴 꼴",
 core:S('살아있는_화석.txt',ko('살아있는_화석'),"살아있는 화석은 살아있는 생물 종 가운데 화석으로만 발견되는 종과 닮았으면서, 연관된 친척 종이 없는 것을 부르는 말이다.","화석으로만 알려졌던 종과 닮았으면서 가까운 친척 종이 없는 생물을 부르는 말"),
 story:[S('en_Coelacanth.txt',en('Coelacanth'),"they were thought to have become extinct in the Late Cretaceous, around 66 million years ago.","실러캔스류는 약 6600만 년 전 백악기 말에 멸종한 것으로 여겨졌다"),
  S('en_Coelacanth.txt',en('Coelacanth'),"On 22 December 1938, the first Latimeria specimen was found off the east coast of South Africa, off the Chalumna River (now Tyolomnqa).","1938년 12월 22일 남아프리카 동쪽 바다에서 살아 있는 개체가 처음 발견됐다"),
  S('en_Coelacanth.txt',en('Coelacanth'),"Museum curator Marjorie Courtenay-Latimer discovered the fish among the catch of a local fisherman.","박물관 큐레이터 마저리 코트니라티머가 어부가 잡아 온 물고기 더미에서 그것을 알아봤다")],
 hint:S('살아있는_화석.txt',ko('살아있는_화석'),"대량 멸종 속에서 살아남은 생물로, 종의 다양성이 비교적 적다.","대량 멸종을 넘겨 살아남았고 종의 다양성은 비교적 적다"),
 legend:false,care:"실러캔스는 '라자루스 분류군'의 대표 예 — 정답은 개념, 실러캔스는 이야기 소재. 실러캔스 카드가 따로 있으면 겹침 재확인",why:"6600만 년 전에 사라졌다던 물고기가 1938년 어부의 그물에서 나왔다"},

{answer:"전류 전쟁",also:["전류전쟁","War of the Currents"],major:"기술·의학",mid:"에너지·환경 기술",hr:true,
 core:S('전류_전쟁.txt',ko('전류_전쟁'),"전류 전쟁(War of the Currents)은 1880년대 후반에 미국의 니콜라 테슬라와 토머스 에디슨이 전력의 송전 방식을 두고 벌인 경쟁을 이르는 말이다.","1880년대 후반 에디슨(직류)과 테슬라 · 웨스팅하우스(교류)가 송전 방식을 두고 벌인 경쟁"),
 story:[S('en_War_of_the_currents.txt',en('War_of_the_currents'),"Both also colluded with Westinghouse's chief AC rival, the Thomson-Houston Electric Company, to make sure the first electric chair was powered by a Westinghouse AC generator.","교류는 위험하다는 인상을 주려고 첫 전기의자에 웨스팅하우스 교류 발전기가 쓰이도록 손을 썼다"),
  S('en_War_of_the_currents.txt',en('War_of_the_currents'),"In May 1892, Westinghouse Electric managed to underbid General Electric on the contract to electrify the World's Columbian Exposition in Chicago and, although they made no profit, their demonstration of a safe, effective and highly flexible universal alternating current system powering all of the disparate electrical systems at the Exposition led to them winning the bid at the end of that year to build an AC power station at Niagara Falls.","1893 시카고 박람회를 이익 없이 교류로 밝혀 보이고 나이아가라 폭포 교류 발전소 사업을 따냈다")],
 hint:S('en_War_of_the_currents.txt',en('War_of_the_currents'),"He also thought the idea of using AC lighting in residential homes was too dangerous and had the company hold back on that type of installation until a safer transformer could be developed.","에디슨은 높은 전압의 교류를 집 안 조명에 쓰는 것은 너무 위험하다고 보았다"),
 legend:false,care:"에디슨 쪽의 동물 감전 시연은 소재에서 뺀다(잔혹). 전기의자 일화는 '교류가 위험해 보이게 하려 했다'까지만. hint 의 He 가 에디슨인지 문서에서 다시 확인",why:"전기의자가 교류 발전기로 돌아가게 만든 이유가 경쟁사 흠집 내기였다"},

{answer:"음속 장벽",also:["음속장벽","소리의 벽","sound barrier"],major:"기술·의학",mid:"항공·우주 기술",hr:true,
 spellNote:"한국어 위키백과 표제어는 '음속 장벽'(본문은 음속장벽) · 표준국어대사전에는 없음 · also 에 붙인 꼴",
 core:S('음속_장벽.txt',ko('음속_장벽'),"음속장벽(sound barrier)은 항공기에 있어서, 음속 부근의 속도로는 비행이 곤란한 상황을 나타낸다.","항공기가 음속 가까이 가면 공기 저항이 급증해 비행이 어려워지는 현상"),
 story:[S('en_Sound_barrier.txt',en('Sound_barrier'),"The sound barrier or sonic barrier is the large increase in aerodynamic drag and other undesirable effects experienced by an aircraft or other object when it approaches the speed of sound.","음속에 다가가면 항력이 크게 늘고 기체에 나쁜 영향이 생긴다 — 벽처럼 느껴졌다"),
  S('en_Sound_barrier.txt',en('Sound_barrier'),"In 1947, American test pilot Chuck Yeager demonstrated that safe flight at the speed of sound was achievable in purpose-designed aircraft, thereby breaking the barrier.","1947년 시험비행 조종사 척 예거가 음속을 넘어도 안전하게 날 수 있음을 보였다"),
  S('en_Sound_barrier.txt',en('Sound_barrier'),"The term sound barrier is still sometimes used today to refer to aircraft approaching supersonic flight in this high drag regime.","'벽'이라는 말은 오늘날에도 쓰이지만 실제로는 넘지 못할 벽이 아니라 저항이 커지는 구간이었다")],
 hint:S('en_Sound_barrier.txt',en('Sound_barrier'),"On 14 October 1947, just under a month after the United States Air Force had been created as a separate service, the tests culminated in the first crewed supersonic flight, piloted by Air Force Captain Charles \"Chuck\" Yeager in aircraft #46-062, which he had christened Glamorous Glennis.","예거가 첫 초음속 유인 비행에서 몬 비행기에 붙인 이름은 '글래머러스 글레니스'"),
 legend:false,care:"월치(Welch)가 30분 먼저 넘었다는 주장이 있음 — 공식 기록은 예거. 해설은 '공식 기록'으로",why:"'벽'이라 불렸지만 실제로는 벽이 아니라 저항이 급증하는 구간이었다"},

{answer:"화산 겨울",also:["화산겨울","volcanic winter"],major:"자연과학",mid:"지구과학·기상",hr:true,
 core:S('화산_겨울.txt',ko('화산_겨울'),"화산 겨울(Volcanic winter)은 유황이 풍부하고 특히 폭발적인 화산 폭발 이후 황산 방울이 태양을 가리고 지구의 알베도(태양 복사 반사 증가)를 높여 지구 온도가 감소하는 현상이다.","큰 화산 폭발 뒤 황산 방울이 햇빛을 가려 지구 온도가 내려가는 현상"),
 story:[S('en_Year_Without_a_Summer.txt',en('Year_Without_a_Summer'),"The main cause of the Year Without a Summer is generally held to be a volcanic winter created by the April 1815 eruption of Mount Tambora on Sumbawa.","1816년 '여름 없는 해'의 주된 원인은 1815년 4월 인도네시아 탐보라 화산 폭발이 만든 화산 겨울로 여겨진다"),
  S('en_Year_Without_a_Summer.txt',en('Year_Without_a_Summer'),"Inspired by a collection of German ghost stories that they had read, Lord Byron proposed a contest to see who could write the scariest story, leading Shelley to write Frankenstein and Lord Byron to write \"A Fragment\", which Polidori later used as inspiration for The Vampyre – a precursor to Dracula.","비 오는 그 여름 바이런이 괴담 짓기 내기를 제안했고 『프랑켄슈타인』이 나왔다"),
  S('en_Year_Without_a_Summer.txt',en('Year_Without_a_Summer'),"According to a 2012 analysis by Berkeley Earth, the 1815 Tambora eruption caused a temporary drop in the Earth's average land temperature of about one degree Celsius; smaller temperature drops were recorded from the 1812–1814 eruptions.","탐보라 폭발로 지구 평균 지표 기온이 일시적으로 약 1도 내려갔다")],
 hint:S('en_Year_Without_a_Summer.txt',en('Year_Without_a_Summer'),"The eruption of Tambora occurred near the end of the Little Ice Age, exacerbating the background global cooling of the period.","탐보라 폭발은 소빙기 끝자락에서 일어나 당시의 냉각을 더 키웠다"),
 legend:false,care:"『프랑켄슈타인』 일화는 문서(Year Without a Summer)에 있는 대로만 · 재난 희생자 소재는 쓰지 않는다",why:"화산 하나 때문에 여름이 사라졌고, 그 우중충한 여름에 프랑켄슈타인이 태어났다"},

{answer:"균근",also:["균근 네트워크","우드 와이드 웹","Wood Wide Web","mycorrhiza"],major:"자연과학",mid:"식물",hr:false,
 spellNote:"한국어 위키백과 표제어 · 표준국어대사전 표제어 균근(菌根). '우드 와이드 웹'은 별명이라 also 에만",
 core:S('균근.txt',ko('균근'),"균근(Mycorrhizae 단수로 micorriza: '균류'와 '뿌리'를 뜻하는 그리스어에서 유래)은 숙주 식물에게 영양 물질과 물을 제공하고 숙주 식물로부터 탄수화물을 공급받는 균류 공생 생물체이다.","식물 뿌리에 붙어 물과 영양을 주고 탄수화물을 받는 곰팡이(균류) 공생체"),
 story:[S('en_Mycorrhizal_network.txt',en('Mycorrhizal_network'),"Referencing an analogous function served by the World Wide Web in human communities, the many roles that mycorrhizal networks appear to play in woodland have earned them a colloquial nickname: the \"Wood Wide Web\".","숲속 균근 연결망에 붙은 별명은 '우드 와이드 웹'"),
  S('en_Mycorrhizal_network.txt',en('Mycorrhizal_network'),"Mycorrhizal networks were discovered in 1997 by Suzanne Simard, professor of forest ecology at the University of British Columbia in Canada.","1997년 캐나다 삼림생태학자 수잰 시마드가 발견했다"),
  S('en_Mycorrhizal_network.txt',en('Mycorrhizal_network'),"In one study, Simard watched as a Douglas fir that had been injured by insects appeared to send chemical warning signals to a ponderosa pine growing nearby.","벌레에 상한 더글러스전나무가 옆의 폰데로사소나무에 화학 경고 신호를 보내는 듯 보였다")],
 hint:S('en_Mycorrhizal_network.txt',en('Mycorrhizal_network'),"Mycorrhizal networks were discovered in 1997 by Suzanne Simard, professor of forest ecology at the University of British Columbia in Canada.","숲 땅속 연결망은 1997년 캐나다의 삼림생태학 교수가 발견했다"),
 legend:false,care:"식물끼리 신호를 주고받는다는 해석은 학계에서 아직 논쟁 중(en 문서: validity still controversial) — 해설은 '그렇게 보였다 · 논쟁 중'으로",why:"숲 땅속에 곰팡이가 만든 '인터넷'이 있다는 이야기"},

{answer:"광섬유",also:["광파이버","optical fiber","광학 섬유"],major:"기술·의학",mid:"발명·발견",hr:false,
 core:S('광섬유.txt',ko('광섬유'),"광섬유(光纖維, optical fiber)는 빛 신호를 전달하는 가느다란 유리 또는 플라스틱 섬유의 일종이다.","빛 신호를 전달하는 가느다란 유리 · 플라스틱 섬유"),
 story:[S('en_Charles_K._Kao.txt',en('Charles_K._Kao'),"However, at the time of this determination, optical fibres commonly exhibited light loss as high as 1,000 dB/km and even more.","1960년대 초 광섬유는 빛이 1km 가는 동안 1,000dB 넘게 줄어 통신에 쓸 수 없었다"),
  S('en_Charles_K._Kao.txt',en('Charles_K._Kao'),"Kao also stated that the impurity of glass material is the main cause for the dramatic decay of light transmission inside glass fibre, rather than fundamental physical effects such as scattering as many physicists thought at that time, and such impurity could be removed.","찰스 까오는 손실의 원인이 유리의 불순물이지 근본적 한계가 아니라며 불순물은 없앨 수 있다고 봤다"),
  S('en_Charles_K._Kao.txt',en('Charles_K._Kao'),"In 2009, Kao was awarded the Nobel Prize in Physics \"for groundbreaking achievements concerning the transmission of light in fibres for optical communication.","까오는 2009년 노벨 물리학상을 받았다")],
 hint:S('en_Charles_K._Kao.txt',en('Charles_K._Kao'),"In 1965, Kao with Hockham concluded that the fundamental limitation for glass light attenuation is below 20 dB/km (decibels per kilometer, is a measure of the attenuation of a signal over a distance), which is a key threshold value for optical communications.","1965년 유리 손실의 근본 한계는 20dB/km 아래라는 결론이 통신의 기준선이 됐다"),
 legend:false,care:"인물(까오) 표기는 정답이 아니므로 해설에서 한국어 위키 표제어 확인 필요(고금 / 까오 갈림)",why:"다들 한계라 하던 유리 손실을 '그냥 불순물 탓'이라고 본 한 사람이 인터넷 선로를 열었다"},

{answer:"치올콥스키 로켓 방정식",also:["로켓 방정식","치올콥스키 방정식","치올콥스키 공식","Tsiolkovsky rocket equation"],major:"기술·의학",mid:"항공·우주 기술",hr:true,
 core:S('치올콥스키_로켓_방정식.txt',ko('치올콥스키_로켓_방정식'),"치올콥스키 로켓 방정식(Tsiolkovsky's rocket equation)은 러시아의 로켓 과학자인 콘스탄틴 치올콥스키가 처음으로 유도해낸 방정식으로, 중력이나 저항 같은 외력이 작용하지 않는 계에서의 로켓의 운동을 기술한다.","로켓의 속도 변화와 연료 분사 속도 · 질량비의 관계를 나타내는 식"),
 story:[S('en_Tsiolkovsky_rocket_equation.txt',en('Tsiolkovsky_rocket_equation'),"In what has been called \"the tyranny of the rocket equation\", there is a limit to the amount of payload that the rocket can carry, as higher amounts of propellant increment the overall weight, and thus also increase the fuel consumption.","연료를 더 실으면 그 무게 때문에 연료가 더 필요해져 실을 수 있는 짐에 한계가 생긴다 — '식의 횡포'"),
  S('en_Tsiolkovsky_rocket_equation.txt',en('Tsiolkovsky_rocket_equation'),"The equation is named after—and usually credited to—Konstantin Tsiolkovsky, who derived and published the formula in 1903, though William Moore had outlined it as early as 1810 and elaborated further in a book published in 1813.","1903년 치올콥스키가 발표했지만 영국의 윌리엄 무어가 이미 1810년에 윤곽을 그렸다")],
 hint:null,
 legend:false,care:"수식 자체는 묻지 않고 '연료의 악순환' 개념으로. 표기는 한국어 위키 표제어. 윌리엄 무어 국적은 이번에 확인 안 함",why:"로켓이 왜 그렇게 크고 대부분이 연료인지를 한 줄 식이 설명한다"},

{answer:"광우병",also:["소해면상뇌증","소해면상뇌병증","BSE","mad cow disease"],major:"기술·의학",mid:"의학·건강 상식",hr:false,
 core:S('소해면상뇌증.txt',ko('소해면상뇌증'),"소해면상뇌병증( - 海綿狀腦病症, 영어: bovine spongiform encephalopathy, BSE) 또는 광우병(狂牛病, 영어: mad cow disease)은 소에게서 생기는 치명적인 신경 퇴행성 질환이다.","소의 뇌가 스펀지처럼 변하는 치명적 신경 퇴행성 질환"),
 story:[S('en_Bovine_spongiform_encephalopathy.txt',en('Bovine_spongiform_encephalopathy'),"BSE is thought to occur due to an infection by a misfolded protein, known as a prion.","원인은 잘못 접힌 단백질 '프리온'으로 추정된다"),
  S('en_Bovine_spongiform_encephalopathy.txt',en('Bovine_spongiform_encephalopathy'),"Cattle are believed to have been infected by being fed meat-and-bone meal that contained either the remains of cattle who spontaneously developed the disease or scrapie-infected sheep products.","소에게 먹인 '육골분' 사료에 병든 소나 양의 잔해가 섞여 퍼졌다고 여겨진다")],
 hint:S('en_Bovine_spongiform_encephalopathy.txt',en('Bovine_spongiform_encephalopathy'),"The outbreak increased throughout the UK due to the practice of feeding meat-and-bone meal to young calves of dairy cows.","영국에서 송아지에게 육골분을 먹이는 관행 때문에 번졌다"),
 legend:false,care:"국내 정치 쟁점(쇠고기 수입 · 시위)은 건드리지 않는다 — 병의 원리와 사료 이야기만",why:"초식동물인 소에게 소의 잔해를 섞어 먹여서 퍼진 병"},

{answer:"튜링 검사",also:["튜링 테스트","튜링테스트","Turing test","모방 게임"],major:"기술·의학",mid:"컴퓨터·인터넷",hr:true,
 spellNote:"한국어 위키백과 표제어는 '튜링 검사' · 국내에서는 '튜링 테스트'가 더 흔함 → also 에 넣음(둘 다 정답으로 받는다)",
 core:S('튜링_테스트.txt',ko('튜링_테스트'),"기계가 인간과 동등한 지능적 행동을 보일 수 있는 능력이 있는지를 검사하는 것이다.","대화 상대가 사람인지 기계인지 가리지 못하면 기계가 지능이 있다고 보는 검사"),
 story:[S('en_Turing_test.txt',en('Turing_test'),"Turing describes the new form of the problem in terms of a three-person party game called the \"imitation game\", in which an interrogator asks questions of a man and a woman in another room in order to determine the correct sex of the two players.","원래 튜링의 '모방 게임'은 파티 게임에서 따온 것으로, 질문자가 다른 방의 남녀를 가려내는 놀이였다"),
  S('en_Turing_test.txt',en('Turing_test'),"In 1966, Joseph Weizenbaum created a program called ELIZA, which mimicked a Rogerian psychotherapist.","1966년 바이첸바움의 프로그램 일라이자는 심리 상담사 흉내를 냈다"),
  S('en_Turing_test.txt',en('Turing_test'),"In 2001, three programmers developed Eugene Goostman, a chatbot portraying itself as a 13-year-old boy from Odesa who spoke English as a second language.","2001년 개발된 챗봇 유진 구스트만은 영어가 서툰 13살 소년 행세를 했다")],
 hint:S('en_Turing_test.txt',en('Turing_test'),"The Loebner Prize, now reported as defunct, provided an annual platform for practical Turing tests with the first competition held in November 1991.","1991년부터 해마다 이 방식으로 챗봇 대회(뢰브너상)가 열렸다"),
 legend:false,care:"연도: 한국어 문서는 1949, 영어 문서는 1950(논문) — 해설에서 연도는 쓰지 않는다. 구스트만 '통과' 주장은 논쟁이라 쓰지 않음",why:"컴퓨터 지능을 재는 시험이 원래는 남녀 맞히기 파티 게임이었다"},

{answer:"대륙 이동설",also:["대륙이동설","continental drift"],major:"자연과학",mid:"지구과학·기상",hr:true,
 core:S('대륙이동설.txt',ko('대륙이동설'),"대륙 이동설(大陸移動說, 영어: continental drift theory)은 지구의 대륙들이 지질학적 시간 규모에 걸쳐 서로 상대적으로 움직이거나 이동한다는 20세기 초에 시작된 높은 지지도를 얻는 과학 이론이다.","대륙들이 오랜 시간에 걸쳐 서로 움직인다는 20세기 초의 이론"),
 story:[S('en_Continental_drift.txt',en('Continental_drift'),"The concept was independently and more fully developed by Alfred Wegener in 1912, and expanded into book form with his 1915 publication, Die Entstehung der Kontinente und Ozeane (The Origin of Continents and Oceans).","1912년 알프레트 베게너가 더 완전하게 발전시켜 1915년 책으로 냈다"),
  S('en_Continental_drift.txt',en('Continental_drift'),"However, at that time his hypothesis was rejected by many, largely because there was no known geological mechanism which could propel such massive movements.","당시에는 대륙을 움직일 힘이 설명되지 않아 많은 사람이 받아들이지 않았다"),
  S('en_Continental_drift.txt',en('Continental_drift'),"In 1931, English geologist Arthur Holmes proposed mantle convection for that mechanism, which is now known to be powered by radioactive decay and primordial heat and a much smaller amount of heat from tidal heating.","1931년 아서 홈스가 맨틀 대류를 제안했다")],
 hint:S('en_Continental_drift.txt',en('Continental_drift'),"French geographer Elisée Reclus (1830 – 1905) presented evidence for a supercontinent and theorized continental drift fifty years prior to Wegener in his 1872 work The Earth.","프랑스 지리학자 엘리제 르클뤼가 베게너보다 50년 앞서 초대륙 증거를 내놓았다"),
 legend:false,care:"베게너의 직업 등은 이번에 연 문서에 없어 쓰지 않음. '힘을 설명하지 못해 거부됐다'까지만",why:"맞는 생각이었는데 '무엇이 움직이나'를 못 대서 수십 년 외면당했다"},

{answer:"터치스크린",also:["터치 스크린","touchscreen","터치패널"],major:"기술·의학",mid:"컴퓨터·인터넷",hr:false,
 core:S('터치스크린.txt',ko('터치스크린'),"터치스크린(touchscreen, 문화어: 손접촉)은 사용자의 터치 입력을 감지할 수 있는 디스플레이의 한 종류이다.","화면을 손으로 눌러 입력하는 디스플레이"),
 story:[S('en_Touchscreen.txt',en('Touchscreen'),"The first finger-driven touchscreen was developed by Eric Johnson of the Royal Radar Establishment located in Malvern, England.","손가락으로 누르는 첫 터치스크린은 영국 몰번의 왕립 레이더 연구소 에릭 존슨이 만들었다"),
  S('en_Touchscreen.txt',en('Touchscreen'),"He described his work on capacitive touchscreens in a short article published in 1965 and then more fully—with photographs and diagrams—in 1967.","1965년 짧은 글로, 1967년 사진과 도면과 함께 자세히 발표했다")],
 hint:S('en_Touchscreen.txt',en('Touchscreen'),"In 1977, American company Elographics—in partnership with Siemens—began work on developing a transparent implementation of an existing opaque touchpad technology developed by Elographics' founder George Samuel Hurst.","1977년 엘로그래픽스가 불투명 터치패드를 투명하게 만드는 작업을 시작했다"),
 legend:false,care:"hint 에 touchpad 가 있어 '터치' 조각이 새는지 중앙에서 확인. 스마트폰 이야기는 쓰지 않음",why:"스마트폰의 핵심이 아이폰보다 40여 년 앞선 레이더 연구소에서 나왔다"},

{answer:"양자 얽힘",also:["얽힘","quantum entanglement"],major:"자연과학",mid:"물리",hr:true,
 core:S('양자_얽힘.txt',ko('양자_얽힘'),"양자 얽힘(量子 - , 영어: quantum entanglement) 또는 간단히 얽힘은 양자역학에서 두 부분계 사이에 존재할 수 있는 일련의 비고전적인 상관관계이다.","멀리 떨어진 두 계가 묶여 한쪽을 재면 다른 쪽도 정해지는 양자역학적 상관관계"),
 story:[S('en_Quantum_entanglement.txt',en('Quantum_entanglement'),"Einstein later disparaged quantum mechanics for seemingly exhibiting \"spukhafte Fernwirkung\", or \"spooky action at a distance\", meaning the acquisition of a value of a property at one location resulting from a measurement at a distant location.","아인슈타인은 이것을 '유령 같은 원격 작용'이라며 못마땅해했다"),
  S('en_Quantum_entanglement.txt',en('Quantum_entanglement'),"In 2022, the Nobel Prize in Physics was awarded to Aspect, Clauser, and Zeilinger \"for experiments with entangled photons, establishing the violation of Bell inequalities and pioneering quantum information science\".","2022년 노벨 물리학상은 이 현상의 실험 증명에 돌아갔다")],
 hint:null,
 legend:false,care:"'정보가 빛보다 빨리 간다'는 오해 주의 — 해설은 문서 범위 안에서만",why:"아인슈타인이 '유령 같다'고 싫어한 현상이 100년 뒤 노벨상을 받았다"},

{answer:"리튬 이온 전지",also:["리튬이온전지","리튬이온 배터리","리튬 이온 배터리","lithium-ion battery"],major:"기술·의학",mid:"에너지·환경 기술",hr:true,
 spellNote:"한국어 위키백과 표제어(리튬 이온 전지) · 일상에서는 '리튬이온 배터리'도 흔해 also 에",
 core:S('리튬_이온_전지.txt',ko('리튬_이온_전지'),"리튬 이온 전지(-電池, Lithium-ion battery, Li-ion battery)는 이차 전지의 일종으로 방전 과정에서 리튬 이온이 음극에서 양극으로 이동하는 전지이다.","리튬 이온이 오가며 충전과 방전을 하는 이차 전지"),
 story:[S('en_Lithium-ion_battery.txt',en('Lithium-ion_battery'),"Stanley Whittingham conceived intercalation electrodes in the 1970s and created the first rechargeable lithium-ion battery, based on a titanium disulfide cathode and a lithium-aluminium anode, although it suffered from safety problems and was never commercialized.","1970년대 휘팅엄이 만든 첫 전지는 안전 문제로 상품이 되지 못했다"),
  S('en_Lithium-ion_battery.txt',en('Lithium-ion_battery'),"The first prototype of the modern Li-ion battery, which uses a carbonaceous anode rather than lithium metal, was developed by Akira Yoshino in 1985 and commercialized by a Sony and Asahi Kasei team led by Yoshio Nishi in 1991.","1985년 요시노 아키라가 금속 리튬 대신 탄소 음극으로 오늘날 꼴의 원형을 만들었고 1991년 소니 팀이 상품화했다")],
 hint:S('en_Lithium-ion_battery.txt',en('Lithium-ion_battery'),"Whittingham, Goodenough, and Yoshino were awarded the 2019 Nobel Prize in Chemistry for their contributions to the development of lithium-ion batteries.","세 명이 2019년 노벨 화학상을 받았다"),
 legend:false,care:"2006년 노트북 배터리 리콜 등 사고 이야기는 쓰지 않는다",why:"휴대 기기 배터리를 가능하게 한 건 '금속 리튬을 쓰지 않는' 발상이었다"},

{answer:"괴혈병",also:["scurvy"],major:"기술·의학",mid:"의학·건강 상식",hr:false,
 core:S('괴혈병.txt',ko('괴혈병'),"괴혈병(壞血病, 영어: scurvy)은 비타민 C의 부족으로 출혈 장애가 체내의 각 기관에서 발생하는 질병이다.","비타민 C 부족으로 출혈 장애가 생기는 질병"),
 story:[S('괴혈병.txt',ko('괴혈병'),"16세기에서 18세기의 대항해 시대에는 이 질병의 원인을 알 수 없었기 때문에, 해적 이상으로 두려워 했다.","대항해 시대 선원들은 이 병을 해적보다 무서워했다"),
  S('en_Scurvy.txt',en('Scurvy'),"As a naval surgeon on HMS Salisbury, Lind had compared several suggested scurvy cures: hard cider, vitriol, vinegar, seawater, oranges, lemons, and a mixture of balsam of Peru, garlic, myrrh, mustard seed and radish root.","해군 군의관 제임스 린드가 사과주 · 식초 · 바닷물 · 오렌지와 레몬 등을 나누어 비교했다"),
  S('en_Scurvy.txt',en('Scurvy'),"It was not until 1747 that James Lind formally demonstrated that scurvy could be treated by supplementing the diet with citrus fruit, in one of the first controlled clinical experiments reported in the history of medicine.","1747년, 감귤류가 낫게 한다는 결과는 의학사 최초급의 대조 임상 실험이었다")],
 hint:S('en_Scurvy.txt',en('Scurvy'),"While almost all animals, plants, and other life forms produce their vitamin C, humans and a few others do not.","대부분의 동물은 스스로 만드는 영양소를 사람은 만들지 못한다"),
 legend:false,care:"쿡 선장 이야기는 문서마다 달라(ko: 자우어크라우트 · en: 맥아즙) 쓰지 않는다. 힌트에 '비타민 C' 가 직접 나오지 않게(hint text 는 영양소로만)",why:"최초의 대조 실험이 배 위에서 레몬 대 식초로 벌어졌다"},

{answer:"블록체인",also:["블록 체인","blockchain","block chain"],major:"기술·의학",mid:"컴퓨터·인터넷",hr:false,
 core:S('블록체인.txt',ko('블록체인'),"블록체인 기술은 비트코인을 비롯한 대부분의 암호화폐 거래에 사용된다.","비트코인 같은 암호화폐 거래를 기록하는 분산 장부 기술"),
 story:[S('en_Blockchain.txt',en('Blockchain'),"Further work on a cryptographically secured chain of blocks was described in 1991 by Stuart Haber and W. Scott Stornetta.","블록을 암호로 이어 붙이는 방식은 1991년 하버와 스토네타가 이미 설명했다"),
  S('en_Blockchain.txt',en('Blockchain'),"A blockchain was created by a person (or group of people) using the name (or pseudonym) Satoshi Nakamoto in 2008 to serve as the public distributed ledger for bitcoin cryptocurrency transactions, based on previous work by Stuart Haber, W.","2008년 사토시 나카모토라는 이름의 누군가가 비트코인 거래 장부로 만들었다")],
 hint:null,
 legend:false,care:"투자 · 가격 이야기는 쓰지 않는다. 1991년 원래 목적은 이번에 확인하지 못해 쓰지 않음",why:"비트코인보다 17년 앞서 같은 아이디어가 이미 있었다"},

{answer:"하이퍼텍스트",also:["hypertext"],major:"기술·의학",mid:"컴퓨터·인터넷",hr:false,
 core:S('하이퍼텍스트.txt',ko('하이퍼텍스트'),"하이퍼텍스트(hypertext, 문화어: 초본문, 하이퍼본문)는 컴퓨터 디스플레이나 다른 전자기기에 표시되는 텍스트로, 독자가 즉시 접근할 수 있는 다른 텍스트에 대한 참조(하이퍼링크)를 포함한다.","누르면 다른 글로 바로 건너가는 링크를 가진 글"),
 story:[S('en_Hypertext.txt',en('Hypertext'),"In 1945, Vannevar Bush wrote an article in The Atlantic Monthly called \"As We May Think\", about a futuristic proto-hypertext device he called a Memex.","1945년 배니바 부시가 마이크로필름으로 글을 이어 읽는 가상의 기계 '메멕스'를 구상했다"),
  S('en_Hypertext.txt',en('Hypertext'),"In 1965, Ted Nelson coined the terms 'hypertext' and 'hypermedia' as part of a model he developed for creating and using linked content (first published reference 1965).","1965년 테드 넬슨이 이 말을 만들었다"),
  S('en_Hypertext.txt',en('Hypertext'),"Ted Nelson said in the 1960s that he began implementation of a hypertext system he theorized, which was named Project Xanadu, but his first and incomplete public release was finished much later, in 1998.","넬슨의 '자나두' 프로젝트는 1960년대에 시작해 불완전한 첫 공개가 1998년에야 나왔다")],
 hint:S('en_Hypertext.txt',en('Hypertext'),"One of the most successful computer games, Myst, was first written in HyperCard.","게임 '미스트'는 애플의 카드형 도구로 처음 만들어졌다"),
 legend:false,care:"Memex 가 microfilm 이라는 서술은 부시 원문 확인 안 함(en 문서 그대로)",why:"웹이 나오기 40년 전에 상상한 '링크'를 정작 만든 사람은 완성에 30년 넘게 걸렸다"},
];
const dir='C:/work/quiz-web/data/pipeline/audit/g111-raw/tmp44/';let bad=0;
const chk=(s,k)=>{const t=fs.readFileSync(dir+s._f,'utf8');if(!t.includes(s.quote)){console.log('MISS',k,s.quote.slice(0,70));bad++}};
items.forEach(it=>{chk(it.core,it.answer);it.story.forEach(s=>chk(s,it.answer));if(it.hint)chk(it.hint,it.answer)});
console.log('bad',bad);
if(bad==0||process.argv[2]=='force'){
const strip=s=>s?{text:s.text,url:s.url,quote:s.quote}:null;
const out={done:true,chunk:"새재료-44",lane:"hard",grade:4,items:items.map((it,i)=>({key:'n'+(4401+i),answer:it.answer,also:it.also,spelling:"?",major:it.major,mid:it.mid,gradeGuess:4,core:strip(it.core),story:it.story.map(strip),hintIdea:strip(it.hint),legend:it.legend,care:it.care,why:it.why,hintRisk:it.hr,spellNote:it.spellNote||""})),
dropped:{dupActive:44,weakStory:4,noSource:2,other:2},opened:34};
fs.writeFileSync('C:/work/quiz-web/data/pipeline/audit/g111-raw/chunk-44.json',JSON.stringify(out,null,1));console.log('written',out.items.length)}

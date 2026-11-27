// each item: a, also, major, mid, g, core[file,quote], ctext, story[[file,quote,ktext]], hint[file,quote,ktext]|null, legend, care, why
export const I = [];
const add = (a, also, major, mid, g, core, ctext, story, hint, legend, care, why) => I.push({ a, also, major, mid, g, core, ctext, story, hint, legend, care, why });

add('키아로스쿠로', ['명암법', 'chiaroscuro'], '문화·예술', '미술·화가', 4,
  ['en-Chiaroscuro', "chiaroscuro (English:  kee-AR-ə-SKOOR-oh, -⁠SKURE-, Italian: [ˌkjaroˈskuːro]; lit. 'light-dark') is the use of strong contrasts between light and dark, usually bold contrasts affecting a whole composition."],
  '빛과 어둠의 강한 대비로 입체감과 극적인 효과를 내는 회화 기법(이탈리아어로 빛-어둠)',
  [['en-Chiaroscuro', "The term chiaroscuro originated during the Renaissance as drawing on coloured paper, where the artist worked from the paper's base tone toward light using white gouache, and toward dark using ink, bodycolour or watercolour.", '이 말은 르네상스 때 색종이 위에 흰 물감과 먹으로 명암을 그리던 소묘에서 나왔다'],
   ['en-Chiaroscuro', "The invention of these effects in the West, \"skiagraphia\" or \"shadow-painting\" to the Ancient Greeks, traditionally was ascribed to the famous Athenian painter of the fifth century BC, Apollodoros.", '고대 그리스에서는 이 효과를 그림자 그림이라 불렀고 기원전 5세기 화가 아폴로도로스가 만들었다고 전해 왔다']],
  ['en-Chiaroscuro', "Artists known for using the technique include Leonardo da Vinci, Caravaggio, Rembrandt, Vermeer, Goya, and Georges de La Tour.", '레오나르도 다 빈치 · 카라바조 · 렘브란트 · 베르메르가 이 기법으로 알려졌다'],
  false, '', '명암 기법 이름이 원래 색종이 위에 흰색과 먹으로 그리던 소묘에서 나왔다');

add('스푸마토', ['sfumato'], '문화·예술', '미술·화가', 4,
  ['en-Sfumato', "Sfumato (English:  sfoo-MAH-toh, Italian: [sfuˈmaːto]; lit. 'smoked off', i.e. 'blurred') is a painting technique for softening the transition between colours, mimicking an area beyond what the human eye is focusing on, or the out-of-focus plane."],
  '윤곽선 없이 색과 명암을 연기처럼 부드럽게 번지게 하는 회화 기법(이탈리아어로 연기처럼 사라지다)',
  [['en-Sfumato', "He described sfumato as \"without lines or borders, in the manner of smoke\".", '레오나르도는 이 기법을 선도 경계도 없이 연기처럼이라고 설명했다'],
   ['en-Sfumato', "They found that Leonardo modelled the shadows with glazes or very thin layers of paint, applying the glazes in coats only 1 to 2 micrometres thick to a total thickness of no more than 30 to 40 micrometres.", '2010년 엑스선 분석에서 그림자를 1~2마이크로미터 두께의 아주 얇은 물감층으로 쌓은 것이 밝혀졌다']],
  ['en-Sfumato', "He introduced it and implemented it in many of his works, including the Virgin of the Rocks and in his famous painting of the Mona Lisa.", '레오나르도는 바위 위의 성모와 모나리자 등에 이 기법을 썼다'],
  false, '', '모나리자의 부드러운 표정이 연기 같은 기법이고 물감 층은 머리카락보다 훨씬 얇다');

add('테네브리즘', ['암흑화법', 'tenebrism'], '문화·예술', '미술·화가', 5,
  ['en-Tenebrism', "Tenebrism, from Italian tenebroso ('dark, gloomy, mysterious'), also occasionally called dramatic illumination, is a style of painting using especially pronounced chiaroscuro, where there are violent contrasts of light and dark, and where darkness becomes a dominating feature of the image."],
  '어둠이 화면을 지배하고 한 곳에만 강한 빛을 비추는 극단적 명암 양식(이탈리아어로 어둡고 음침한)',
  [['en-Tenebrism', "The technique was developed to add drama to an image through a spotlight effect, and is common in Baroque paintings.", '스포트라이트를 비춘 듯한 효과로 극적인 분위기를 더하며 바로크 그림에 흔하다'],
   ['en-Tenebrism', "The artist Caravaggio is generally credited with the invention of the style, although this technique was also used by earlier artists such as Albrecht Dürer in his several self portraits;", '카라바조가 만든 양식으로 흔히 여겨지지만 뒤러의 자화상 등에도 앞서 쓰였다']],
  null, false, '질문에 극단적 어둠 · 스포트라이트 효과를 넣어 키아로스쿠로와 구분', '그림에 스포트라이트를 비춘 듯한 양식');

add('펜티멘토', ['pentimento', '펜티멘티'], '문화·예술', '미술·화가', 5,
  ['en-Pentimento', "In painting, a pentimento (Italian for 'repentance'; from the verb pentirsi, meaning 'to repent'; plural pentimenti) is \"the presence or emergence of earlier images, forms, or strokes that have been changed and painted over\"."],
  '화가가 고쳐 그리며 덮은 이전 그림의 흔적(이탈리아어로 뉘우침)',
  [['en-Pentimento', "Some pentimenti have always been visible on the final painting with careful inspection; others are revealed by the increasing transparency that some paint acquires after several centuries.", '어떤 것은 세월이 지나 물감이 투명해지며 저절로 드러난다'],
   ['en-Pentimento', "Others, especially in the underdrawing, can only be seen with modern methods such as X-rays and infrared reflectography and photographs.", '밑그림 속 흔적은 엑스선과 적외선 촬영으로만 보인다']],
  null, false, '', '그림 속 화가의 뉘우침이 수백 년 뒤 물감이 투명해져 드러난다');

add('아나모르포시스', ['왜곡 투영', 'anamorphosis'], '문화·예술', '미술·화가', 5,
  ['en-Anamorphosis', "Anamorphosis is a distorted projection that requires the viewer to occupy a specific vantage point, use special devices, or both to view a recognizable image."],
  '특정 각도나 거울로 봐야 제 모습이 보이도록 일부러 왜곡해 그리는 기법',
  [['en-Anamorphosis', "The Ambassadors (1533) by Hans Holbein the Younger is known for the prominent grey diagonal slash across the bottom of the frame which, when viewed from an acute angle, resolves into the image of a human skull.", '홀바인의 대사들(1533) 아래의 비스듬한 얼룩은 날카로운 각도에서 보면 해골이 된다'],
   ['en-Anamorphosis', "It has been hypothesized that the painting, regarded as a vanitas – a meditation on the transience of life including the skull as a memento mori – was intended to be hung alongside stairs to startle viewers with the sudden appearance of a skull.", '계단 옆에 걸어 갑자기 해골이 나타나 놀라게 하려 했다는 가설이 있다']],
  ['en-Anamorphosis', "With mirror anamorphosis, a conical or cylindrical mirror is placed on the distorted drawing or painting to reveal an undistorted image.", '원뿔이나 원통 거울을 올려 놓으면 일그러진 그림이 제대로 보이는 방식도 있다'],
  false, '계단 걸이 설은 가설로 표현', '그림 아래 이상한 얼룩이 비스듬히 보면 해골이 된다');

add('데칼코마니', ['decalcomania'], '문화·예술', '미술·화가', 4,
  ['en-Decalcomania', "Decalcomania (from French: décalcomanie) is a decorative technique by which engravings and prints may be transferred to pottery or other materials."],
  '그림을 다른 표면에 찍어 옮기는 기법(한국에서는 접어서 찍는 대칭 그림으로 흔히 안다)',
  [['en-Decalcomania', "Decalcomania is adapted from French décalcomanie, equivalent to décalquer, \"to transfer a tracing of\", plus English -mania.", '프랑스어 베껴 옮기다에 영어 열광(-mania)이 붙은 말이다'],
   ['en-Decalcomania', "The surrealist Óscar Domínguez referred to his work as \"decalcomania with no preconceived object\".", '초현실주의 화가 오스카르 도밍게스가 1936년부터 이 기법을 그림에 썼다']],
  ['en-Decalcomania', "Decalcomania was first used commercially in England about 1750 and imported into the United States at least as early as 1865.", '1750년쯤 영국에서 도자기 장식으로 처음 상업화됐다'],
  false, '한국의 대칭 그림 뜻과 원뜻이 다름', '학교 미술 시간의 대칭 그림이 원래는 도자기 장식 기법이었다');

add('콜라주', ['collage'], '문화·예술', '미술·화가', 3,
  ['en-Collage', "Collage (, from the French: coller, \"to glue\" or \"to stick together\") is a technique of art creation, primarily used in the visual arts, by which art results from an assembly of different forms, thus creating a new whole."],
  '여러 조각을 붙여 새 화면을 만드는 기법(프랑스어 풀칠하다)',
  [['en-Collage', "Paper collage, is first known to have existed in the 10th century in Japan, when calligraphers began to apply glued paper, using texts on surfaces, when writing their poems.", '종이 콜라주는 10세기 일본 서예가들이 시를 쓰며 풀로 종이를 붙인 데서 처음 보인다'],
   ['en-Collage', "The term Papier collé was coined by both Georges Braque and Pablo Picasso in the beginning of the 20th century when collage became a distinctive part of modern art.", '20세기 초 브라크와 피카소가 파피에 콜레라는 말을 만들며 현대미술의 일부가 됐다']],
  ['en-Collage', "\"It was Braque who purchased a roll of simulated oak-grain wallpaper and began cutting out pieces of the paper and attaching them to his charcoal drawings.", '브라크가 나뭇결 무늬 벽지를 사서 목탄 소묘에 오려 붙인 것이 시작이었다'],
  false, '', '현대미술의 기법이 10세기 일본 서예에도 있었다');

add('키치', ['kitsch'], '문화·예술', '사진·디자인', 4,
  ['en-Kitsch', "Kitsch ( KITCH; loanword from German) is a term applied to art and design that is perceived as naïve imitation, overly eccentric, gratuitous, or of banal taste."],
  '싸구려 · 통속적인 취향으로 여겨지는 예술이나 디자인을 가리키는 독일어 유래 말',
  [['en-Kitsch', "As a descriptive term, kitsch originated in the art markets of Munich, Germany in the 1860s and the 1870s, describing cheap, popular, and marketable pictures and sketches.", '1860~70년대 뮌헨 미술 시장에서 싸고 잘 팔리는 그림을 부르던 말이다'],
   ['en-Kitsch', "However, since the emergence of Pop Art in the 1950s, kitsch has taken on newfound highbrow appeal, often wielded in knowingly ironic, humorous or earnest manners.", '1950년대 팝아트 이후 일부러 즐기는 취향으로도 쓰인다']],
  null, false, '', '싸구려 그림을 부르던 말이 요즘은 일부러 즐기는 취향이 됐다');

add('세피아', ['sepia'], '문화·예술', '사진·디자인', 3,
  ['en-Sepia_(color)', "Sepia is a reddish-brown color, named after the rich brown pigment derived from the ink sac of the common cuttlefish Sepia."],
  '붉은 갈색으로, 갑오징어 먹물에서 얻은 안료 이름에서 왔다',
  [['en-Sepia_(color)', "The word sepia is the Latinized form of the Ancient Greek word σηπία (sēpía), meaning cuttlefish.", '세피아는 갑오징어를 뜻하는 고대 그리스어를 라틴어화한 말이다'],
   ['en-Sepia_(color)', "Sepia toning is a chemical process used in photography which changes the appearance of black-and-white prints to brown.", '흑백 사진을 갈색으로 바꾸는 세피아 토닝이라는 화학 처리도 있다']],
  ['en-Sepia_(color)', "Sepia ink was commonly used for writing in Greco-Roman civilization.", '그리스 · 로마에서는 글씨를 쓰는 잉크로 흔히 썼다'],
  false, '', '옛날 사진의 갈색이 갑오징어 먹물 이름이다');

add('스케르초', ['scherzo'], '문화·예술', '클래식 음악', 4,
  ['en-Scherzo', "The Italian word scherzo means \"joke\" or \"jest\"."],
  '이탈리아어로 농담이라는 뜻의 빠르고 익살스러운 악장 · 곡',
  [['en-Scherzo', "Claudio Monteverdi wrote two sets of works with this title, in 1607 and in 1632.", '몬테베르디가 1607년과 1632년에 스케르초라는 제목의 작품집을 냈다'],
   ['en-Scherzo', "The term can also refer to a fast-moving humorous composition that may or may not be part of a larger work.", '큰 곡의 한 악장이 아니어도 빠르고 익살스러운 곡을 이렇게 부른다']],
  ['en-Scherzo', "A scherzo (, UK also , Italian: [ˈskertso]; plural scherzos or scherzi), in western classical music, is a short composition – sometimes a movement from a larger work such as a symphony or a sonata.", '교향곡이나 소나타의 한 악장으로 자주 들어간다'],
  false, '', '교향곡 한 악장의 이름이 농담이다');

add('오스티나토', ['ostinato'], '문화·예술', '음악 이론·악기', 5,
  ['en-Ostinato', "In music, an ostinato (Italian: [ostiˈnaːto]; from Italian 'stubborn', compare English obstinate) is a motif or phrase that persistently repeats in the same musical voice, frequently in the same pitch."],
  '같은 음형이 고집스럽게 계속 반복되는 음악 기법(이탈리아어로 고집 센)',
  [['en-Ostinato', "Well-known ostinato-based pieces include classical compositions such as Ravel's Boléro and the Carol of the Bells, and popular songs such as John Lennon's \"Mind Games\" (1973), Donna Summer and Giorgio Moroder's \"I Feel Love\" (1977), Henry Mancini's theme from Peter Gunn (1959), The Who's \"Baba O'Riley\" (1971), The Verve's \"Bitter Sweet Symphony\" (1997), and Flo Rida's \"Low\" (2007).", '라벨의 볼레로와 캐럴 오브 더 벨, 비터 스위트 심포니, 플로 라이다의 로우가 이 기법으로 만들어졌다'],
   ['en-Ostinato', "The repeating idea may be a rhythmic pattern, part of a tune, or a complete melody in itself.", '반복되는 것은 리듬이든 선율 조각이든 완결된 선율이든 상관없다']],
  null, false, '', '볼레로 같은 곡이 고집 센 반복 하나로 만들어졌다');

add('코린트 양식', ['코린트식', '코린트 오더', 'Corinthian order'], '문화·예술', '건축', 4,
  ['en-Corinthian_order', "The Corinthian has fluted columns and elaborate capitals decorated with acanthus leaves and scrolls."],
  '아칸서스 잎 장식의 화려한 기둥머리가 특징인 그리스 건축 기둥 양식',
  [['en-Corinthian_order', "Much later, the Roman writer Vitruvius (c. 75 BC – c. 15 BC) related that the Corinthian order had been invented by Callimachus, a Greek architect and sculptor who was inspired by the sight of a votive basket that had been left on the grave of a young girl.", '비트루비우스는 조각가 칼리마코스가 소녀 무덤 위에 놓인 바구니를 보고 이 양식을 만들었다고 전했다'],
   ['en-Corinthian_order', "An acanthus plant had grown through the woven basket, mixing its spiny, deeply cut leaves with the weave of the basket.", '바구니를 뚫고 자란 아칸서스 잎이 엮은 틀과 섞여 있었다고 한다']],
  ['en-Corinthian_order', "The Corinthian order is named for the Greek city-state of Corinth, to which it was connected in the period.", '이름은 그리스 도시국가 코린토스에서 왔다'],
  true, '비트루비우스가 전한 이야기 — 전해집니다 꼴로', '소녀 무덤 위 바구니를 뚫고 자란 풀이 기둥머리가 됐다고 전해진다');

add('프롬프터', ['souffleur', 'prompter'], '문화·예술', '공연·연극·뮤지컬', 3,
  ['en-Prompt_(theatre)', "The prompter (sometimes prompt) in a theatre is a person who prompts or cues actors when they forget their lines or neglect to move on the stage to where they are supposed to be situated."],
  '공연 중 배우가 대사를 잊을 때 몰래 알려 주는 무대 뒤 사람',
  [['en-Prompt_(theatre)', "The role of the souffleur, or prompter, reaches back to the medieval theatre, but has disappeared in countries like Britain, the United States, France, and Italy.", '중세 연극까지 거슬러 올라가는 역할이지만 영국 · 미국 · 프랑스 · 이탈리아에서는 사라졌다'],
   ['en-Prompt_(theatre)', "However, in Germany and central Europe, the job of the prompter is still very much alive and integral to the repertory system.", '독일과 중부 유럽에서는 여러 작품을 돌려 올리는 극장 체계 때문에 아직 꼭 필요한 직업이다']],
  null, false, '방송 장비 프롬프터와 겹치지 않게 연극 맥락을 질문에 명시', '영국 · 미국 극장에선 사라진 직업이 독일에선 아직 있다');

add('펜던티브', ['pendentive', '펜덴티브'], '문화·예술', '건축', 5,
  ['en-Pendentive', "A pendentive is a constructional device permitting the placing of a circular dome over a square room or of an elliptical dome over a rectangular room."],
  '네모난 방 위에 둥근 돔을 올릴 수 있게 하는 구면 삼각형 구조',
  [['en-Pendentive', "The first experimentation with pendentives began with Roman dome construction in the 2nd–3rd century AD, while full development of the architectural form came in the 6th-century  Eastern Roman cathedral, Hagia Sophia, in Constantinople (Istanbul).", '2~3세기 로마 돔 공사에서 시험되기 시작해 6세기 하기아 소피아에서 완성됐다'],
   ['en-Pendentive', "Prior to the pendentive's development, builders used the device of corbelling or  squinches in the corners of a room.", '이전에는 방 모서리에 내쌓기나 스퀸치라는 장치를 썼다']],
  null, false, '', '네모 방 위에 둥근 돔을 올리는 해법이 하기아 소피아에서 완성됐다');

add('브레이크 어 레그', ['break a leg', '다리 부러져라'], '문화·예술', '공연·연극·뮤지컬', 3,
  ['en-Break_a_leg', "\"Break a leg\" is an English-language idiom used in the context of theatre or other performing arts to wish a performer \"good luck\"."],
  '공연 전 행운을 비는 반어적 인사말',
  [['en-Break_a_leg', "An ironic or non-literal saying of uncertain origin (a dead metaphor), \"break a leg\" is commonly said to actors and musicians before they go on stage to perform or before an audition.", '유래가 분명하지 않은 반어적 표현으로 무대나 오디션 전에 흔히 건넨다'],
   ['en-Break_a_leg', "The stage is perhaps the most superstitious institution in England, after the racecourse.", '1921년 글은 영국에서 미신이 가장 센 곳으로 경마장 다음에 무대를 꼽았다']],
  null, true, '유래는 확실하지 않음 — 설로만', '행운을 빌며 저주 같은 말을 건네는 극장 미신');

add('고르디우스의 매듭', ['고르디아스의 매듭', 'Gordian Knot'], '인문·사회', '서양사', 3,
  ['en-Gordian_Knot', "The cutting of the Gordian Knot is an ancient Greek legend associated with Alexander the Great in Gordium in Phrygia, regarding a complex knot that tied an oxcart."],
  '푼 사람이 아시아의 왕이 된다는 복잡한 매듭을 알렉산드로스가 끊었다는 이야기',
  [['en-Gordian_Knot', "Sources from antiquity disagree on his solution.", '고대 기록은 알렉산드로스가 어떻게 풀었는지 엇갈린다'],
   ['en-Gordian_Knot', "However, Plutarch and Arrian relate that, according to Aristobulus, Alexander pulled the linchpin from the pole to which the yoke was fastened, exposing the two ends of the cord and allowing him to untie the knot without having to cut through it.", '플루타르코스와 아리아노스는 쐐기를 뽑아 끊지 않고 풀었다고 전한다']],
  ['en-Gordian_Knot', "This is used as a metaphor for inventing an unexpected method to solve a seemingly intractable problem.", '풀기 어려운 문제를 뜻밖의 방법으로 해결한다는 비유로 쓰인다'],
  true, '칼로 끊었다는 것은 통속적 판본', '칼로 잘랐다는 통념과 달리 쐐기를 뽑았다는 기록도 있다');

add('면죄부', ['indulgence', '대사'], '인문·사회', '종교·경전 상식', 3,
  ['en-Indulgence', "In 1517, Pope Leo X offered indulgences for those who gave alms to rebuild St. Peter's Basilica in Rome."],
  '1517년 성 베드로 대성당 재건 헌금을 낸 이에게 교황이 준 것으로 종교개혁의 불씨가 됨',
  [['en-Indulgence', "The aggressive marketing practices of Johann Tetzel in promoting this cause provoked Martin Luther to write his Ninety-five Theses, condemning what he saw as the purchase and sale of salvation.", '테첼의 공격적 판매가 루터의 95개조 반박문을 낳았다'],
   ['en-Indulgence', "This oft-quoted saying was by no means representative of the official Catholic teaching on indulgences, but rather, more a reflection of Tetzel's capacity to exaggerate.", '돈 소리가 나면 영혼이 튀어 오른다는 유명한 문구는 공식 교리가 아니라 테첼의 과장이었다는 평가가 있다']],
  ['en-Indulgence', "In the teaching of the Catholic Church, an indulgence (Latin: indulgentia, from indulgeo, 'permit') is \"a way to reduce the amount of punishment one has to undergo for (forgiven) sins\".", '교리상 이미 용서받은 죄에 대한 벌을 줄여 주는 것이다'],
  false, '종교 비하로 읽히지 않게 사실만', '공식 교리와 달리 판매원의 과장이 종교개혁을 불렀다');

add('마우솔레움', ['영묘', 'mausoleum'], '인문·사회', '서양사', 3,
  ['en-Mausoleum', "The word mausoleum (from the Ancient Greek: μαυσωλεῖον) derives from the Mausoleum at Halicarnassus (near modern-day Bodrum in Turkey), the grave of King Mausolus, the Persian satrap of Caria, whose large tomb was one of the Seven Wonders of the Ancient World."],
  '큰 무덤 건물을 뜻하는 말은 고대 7대 불가사의였던 할리카르나소스 왕의 무덤 이름에서 나왔다',
  [['en-Mausoleum', "A mausoleum without the person's remains is called a cenotaph.", '시신이 없는 영묘는 가묘(세노타프)라 부른다'],
   ['en-Mausoleum', "In the Roman Empire, these were often in necropoles or along roadsides: the via Appia Antica retains the ruins of many private mausolea for kilometres outside Rome.", '로마 제국에서는 길가에 많이 세웠고 아피아 가도에 폐허가 남아 있다']],
  null, false, '답이 사람 이름(마우솔로스)으로 오해되지 않게', '무덤 건물의 일반명이 한 왕의 이름에서 왔다');

add('아고라', ['agora'], '인문·사회', '서양사', 3,
  ['en-Agora', "The agora (English:  or ; Ancient Greek: ἀγορά, romanized: agorá, meaning \"market\" in Modern Greek) was a central public space in ancient Greek city-states."],
  '고대 그리스 도시국가의 중심 광장으로 정치 · 장사 · 사교의 중심',
  [['en-Agora', "From these twin functions of the agora as a political and a commercial spot came the two Greek verbs ἀγοράζω, agorázō, \"I shop\", and ἀγορεύω, agoreúō, \"I speak in public\".", '정치와 장사라는 두 기능에서 장을 보다와 공개 연설하다라는 두 그리스어 동사가 나왔다'],
   ['en-Agora', "The literal meaning of the word \"agora\" is \"gathering place\" or \"assembly\".", '낱말 뜻은 모이는 곳 또는 집회다']],
  null, false, '', '장보기와 연설이 한 낱말에서 갈라져 나왔다');

add('데시메이션', ['decimation', '십분의 일 처형'], '인문·사회', '전쟁·군사사', 4,
  ['en-Decimation_(punishment)', "In the military of ancient Rome, decimation (from Latin  decimatio 'destruction of a tenth') was a form of military discipline in which every tenth man in a group was executed by members of his cohort."],
  '고대 로마군에서 열 명 중 한 명을 처형하던 군기 처벌',
  [['en-Decimation_(punishment)', "Regardless, the first well-attested instance was in 72 BC during the war against Spartacus under the command of Marcus Licinius Crassus.", '확실한 첫 사례는 기원전 72년 스파르타쿠스 전쟁 때 크라수스의 명령이었다'],
   ['en-Decimation_(punishment)', "In modern English, the word is used most commonly to mean total destruction or annihilation.", '현대 영어에서는 전멸을 뜻하는 말로 가장 흔히 쓰인다']],
  ['en-Decimation_(punishment)', "The historicity of the punishment during the early and middle republic is questioned, and it may be an ahistorical rhetorical construct of the late republic.", '공화정 초중기 기록의 역사성은 의심받는다'],
  false, '처형 서술은 사실만 간단히', '원뜻은 10분의 1인데 영어에서는 전멸을 뜻하게 됐다');

add('스틱스강', ['스틱스', 'Styx'], '인문·사회', '신화', 3,
  ['en-Styx', "In Greek mythology, Styx ( ; Ancient Greek: Στύξ [stýks]; lit. \"Shuddering\"), also called the River Styx, is a goddess and one of the rivers of the Greek Underworld."],
  '그리스 신화 저승의 강으로 신들이 이 강물에 걸고 맹세했다',
  [['en-Styx', "She sided with Zeus in his war against the Titans, and because of this, to honor her, Zeus decreed that the solemn oaths of the gods be sworn by the water of Styx.", '티탄 전쟁에서 제우스 편에 선 보답으로 신들의 맹세를 이 강물에 걸고 하게 됐다'],
   ['en-Styx', "In both the Iliad and the Odyssey, it is said that swearing by the water of Styx is \"the greatest and most dread oath for the blessed gods\".", '일리아스와 오디세이아는 이 맹세를 신들의 가장 무서운 맹세라고 한다']],
  null, false, '', '저승 강이 사실은 제우스 편에 선 여신이라 신들의 맹세 증인이 됐다');

add('암브로시아', ['ambrosia'], '인문·사회', '신화', 3,
  ['en-Ambrosia', "In the ancient Greek myths, ambrosia (, Ancient Greek: ἀμβροσία 'immortality') is the food or drink of the Greek gods, and is often depicted as conferring longevity or immortality upon whoever consumed it."],
  '그리스 신들이 먹고 마신다는 불사의 음식',
  [['en-Ambrosia', "In one version of the myth of Tantalus, part of Tantalus' crime is that after tasting ambrosia himself, he attempts to steal some to give to other mortals.", '탄탈로스의 죄 하나가 암브로시아를 맛보고 인간에게 훔쳐 주려 한 것이라는 판본이 있다'],
   ['en-Ambrosia', "Those who consume ambrosia typically have ichor, not blood, in their veins.", '이것을 먹는 이들은 피 대신 이코르가 흐른다고 한다']],
  null, false, '', '신들의 몸엔 피 대신 이코르가 흐른다');

add('레콘키스타', ['재정복 운동', 'Reconquista'], '인문·사회', '서양사', 4,
  ['en-Reconquista', "The Reconquista concluded in 1492 with the capture of Granada by the Catholic Monarchs of Spain, thereby ending the presence of any Muslim rule on the Iberian Peninsula."],
  '8세기부터 1492년 그라나다 함락까지 이베리아 반도의 기독교 세력이 이슬람 세력과 벌인 전쟁',
  [['en-Reconquista', "The term 'Reconquista' was not used by medieval writers to describe the struggle between Christians and Muslims in the Iberian Peninsula.", '중세 저술가들은 이 말을 쓰지 않았다'],
   ['en-Reconquista', "The concept of Reconquista, consolidated in Spanish historiography in the second half of the 19th century, was associated with Spanish nationalism during the period of Romantic nationalism.", '개념은 19세기 후반 스페인 역사학에서 굳어졌다']],
  null, false, '종교 갈등으로 읽히지 않게 용어 역사 중심', '당시 사람들은 쓰지 않던 이름이 19세기에 붙었다');

add('사순절', ['Lent', '사순시기'], '인문·사회', '종교·경전 상식', 3,
  ['en-Lent', "Lent (Latin: Quadragesima, 'Fortieth') is the solemn Christian religious observance in the liturgical year in preparation for Easter."],
  '부활절을 준비하며 40일 동안 지키는 기독교 절기',
  [['en-Lent', "The English word Lent is a shortened form of the Old English word lencten, meaning \"spring season\", as its Dutch language cognate lente (Old Dutch lentin) still does today.", '영어 Lent 는 봄을 뜻하는 옛말 lencten 의 줄임이고 네덜란드어 lente 가 지금도 봄이다'],
   ['en-Lent', "Which days are enumerated as being part of Lent differs between Christian denominations (see below), although in all of them Lent is described as lasting for a total duration of 40 days, the number of days Jesus, as well as Moses and Elijah, went without food in their respective fasts.", '40일은 예수 · 모세 · 엘리야가 금식한 날 수에서 왔다']],
  null, false, '', '영어로 Lent 는 봄이라는 뜻의 옛말이다');

add('트라팔가 해전', ['트라팔가르 해전', 'Battle of Trafalgar'], '인문·사회', '전쟁·군사사', 4,
  ['en-Battle_of_Trafalgar', "The Battle of Trafalgar was a fleet action fought on 21 October 1805 off Cape Trafalgar between the Royal Navy and a combined fleet of the French and Spanish navies during the Trafalgar campaign of the War of the Third Coalition."],
  '1805년 넬슨의 영국 함대가 프랑스 · 스페인 연합 함대를 꺾은 해전',
  [['en-Battle_of_Trafalgar', "His signal to the fleet shortly before the battle, \"England expects that every man will do his duty\", is regularly quoted and paraphrased.", '개전 직전 넬슨이 보낸 신호 영국은 모두가 의무를 다하기를 기대한다는 말이 지금도 인용된다'],
   ['en-Battle_of_Trafalgar', "Nelson was careful to point out that something had to be left to chance.", '넬슨은 일부는 우연에 맡겨야 한다고 지적하며 함장들에게 재량을 줬다']],
  null, false, '전사 서술은 사실만', '신호기로 보낸 한 문장이 지금도 인용된다');

add('갬빗', ['gambit'], '스포츠·게임', '보드게임·카드게임', 4,
  ['en-Gambit', "A gambit (from Italian gambetto, the act of tripping someone with the leg to make them fall) is a chess opening in which a player sacrifices material with the aim of achieving a subsequent positional advantage."],
  '체스에서 말을 희생해 더 나은 위치를 노리는 오프닝',
  [['en-Gambit', "The Spanish word gambito was originally applied to chess openings in 1561 by Ruy López de Segura, from an Italian expression dare il gambetto (to put a leg forward in order to trip someone).", '1561년 루이 로페스가 이탈리아어 다리를 걸다에서 따 체스 오프닝에 처음 붙였다'],
   ['en-Gambit', "The metaphorical sense of the word as \"opening move meant to gain advantage\" was first recorded in English in 1855.", '유리한 첫수라는 비유 뜻은 1855년 영어에 처음 나온다']],
  null, false, '', '다리를 걸어 넘어뜨리다에서 온 체스 용어');

add('스테일메이트', ['스탈메이트', 'stalemate'], '스포츠·게임', '보드게임·카드게임', 4,
  ['en-Stalemate', "Stalemate is a situation in chess where the player whose turn it is to move is not in check but has no legal move."],
  '체스에서 체크는 아닌데 둘 수 있는 수가 없어 무승부가 되는 상황',
  [['en-Stalemate', "The outcome of a stalemate was standardized as a draw in the 19th century (see § History of the stalemate rule, below).", '무승부로 통일된 것은 19세기다'],
   ['en-Stalemate', "In xiangqi (Chinese chess) it results in an immediate loss for the stalemated player, and there is no explicit distinction between it and checkmate.", '장기(샹치)에서는 지금도 수가 막힌 쪽이 진다']],
  ['en-Stalemate', "The first recorded use of stalemate is from 1765.", '이 낱말의 첫 기록은 1765년이다'],
  false, '', '같은 상황이 옛 체스에선 이기거나 지는 일이었다');

add('추크츠방', ['츠크츠방', 'zugzwang'], '스포츠·게임', '보드게임·카드게임', 5,
  ['en-Zugzwang', "Zugzwang (from German 'compulsion to move'; pronounced [ˈtsuːktsvaŋ]) is a situation found in chess and other turn-based games wherein one player is put at a disadvantage because of their obligation to make a move; a player is said to be \"in zugzwang\" when any legal move will worsen their position."],
  '체스에서 차례를 넘길 수 없어 어떤 수를 둬도 불리해지는 상황(독일어로 수를 두어야 하는 강제)',
  [['en-Zugzwang', "The concept of zugzwang was known to chess players many centuries before the term was coined, appearing in an endgame study published in 1604 by Alessandro Salvio, one of the first writers on the game, and in shatranj studies dating back to the early 9th century, over 1000 years before the first known use of the term.", '용어보다 천 년 앞서 9세기 샤트란지 연구에도 이 상황이 나온다'],
   ['en-Zugzwang', "The term zugzwang was used in German chess literature in 1858 or earlier, and the first known use of the term in English was by World Champion Emanuel Lasker in 1905.", '영어에서는 1905년 세계 챔피언 라스커가 처음 썼다']],
  null, false, '표준 한글 표기 사전 확인 필요(추크츠방 · 츠크츠방)', '차례를 넘길 수 없다는 규칙이 오히려 괴로운 수를 만든다');

add('킬 스크린', ['kill screen'], '스포츠·게임', 'e스포츠·비디오게임', 4,
  ['en-Pac-Man', "An integer overflow causes the 256th level to load improperly, rendering it impossible to complete. This is known as a kill screen."],
  '게임 오류 때문에 더 진행할 수 없게 되는 마지막 화면(팩맨 256판)',
  [['en-Pac-Man', "In September 1983, Walter Day, chief scorekeeper at Twin Galaxies at the time, took the US National Video Game Team on a tour of the East Coast to visit gamers who claimed the ability to pass that level.", '1983년 트윈 갤럭시스의 월터 데이가 그 판을 넘겼다는 사람들을 찾아다녔다'],
   ['en-Pac-Man', "In 1999, Billy Mitchell offered $100,000 to anyone who could pass level 256 before January 1, 2000.", '1999년 빌리 미첼이 256판을 넘기면 10만 달러를 주겠다고 했으나 아무도 못 받았다']],
  ['en-Kill_screen', "A stage or level in a video game (often an arcade game) that stops the player's progress due to a software bug.", '소프트웨어 버그로 진행이 멈추는 판을 뜻한다'],
  false, '', '팩맨 256번째 판이 정수 오버플로로 깨져 끝이다');

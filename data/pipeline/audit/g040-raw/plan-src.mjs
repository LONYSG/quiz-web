// G040 B — 곡 목록 원자료(멜론 페이지에서 받은 순위 그대로 · 2026-11-08 WebFetch) → g040-plan.json
//   kpop-year: 멜론 연도별 차트(chartType=YE · KPOP) 2005~2025 각 1~15위 → 연도마다 앞에서 8(같은 제목은 앞 연도만 · 같은 가수 판 전체 6곡)
//   kpop-classic: 멜론 연대별(chartType=AG · KPOP) 1980 · 1990 · 2000(2000~2004 발매만)
//   pop: 멜론 연대별 해외 POP 1980 · 1990 · 2000 · 2010 각 15 · jpop: 멜론 장르 J-POP 인기 목록(GN1900 · 한국 사용자 인기)
import { writeFileSync } from 'node:fs';
const M = (y) => `https://www.melon.com/chart/age/list.htm?idx=1&chartType=YE&chartGenre=KPOP&chartDate=${y}&moved=Y`;
const AG = (g, d) => `https://www.melon.com/chart/age/list.htm?idx=1&chartType=AG&chartGenre=${g}&chartDate=${d}&moved=Y`;
const JP = 'https://www.melon.com/genre/song_list.htm?gnrCode=GN1900&orderBy=POP';
// 가수 한국 정본 → 영문(iTunes 대조용 · 변형 후보)
export const AE = {
  'SG 워너비': 'SG Wannabe', '버즈': 'Buzz', '윤도현': 'Yoon Do Hyun', '엠투엠': 'M To M', '김종국': 'Kim Jong Kook', 'MC몽': 'MC Mong', '채연': 'Chae Yeon',
  '백지영': 'Baek Z Young', '씨야': 'SeeYa', '쥬얼리': 'Jewelry', '조PD': 'ZoPD', '이루': 'Eru', '바이브': 'Vibe', '이승기': 'Lee Seung Gi', '성시경': 'Sung Si Kyung',
  '이기찬': 'Lee Ki Chan', '아이비': 'IVY', '더 넛츠': 'The Nuts', '에픽하이': 'Epik High', 'KCM': 'KCM', '박효신': 'Park Hyo Shin',
  '원더걸스': 'Wonder Girls', '빅뱅': 'BIGBANG', '브라운아이드걸스': 'Brown Eyed Girls', '다비치': 'Davichi', '이효리': 'Lee Hyori',
  '소녀시대': "Girls' Generation", '2NE1': '2NE1', 'G-DRAGON': 'G-DRAGON', '2PM': '2PM', '에이트': '8Eight', '김태우': 'Kim Tae Woo', '슈퍼주니어': 'SUPER JUNIOR',
  '미쓰에이': 'miss A', '아이유': 'IU', '포맨': '4MEN', '2AM': '2AM', '티아라': 'T-ARA', '옴므': 'Homme',
  'GG': 'GG', '비스트': 'BEAST', '리쌍': 'Leessang', '씨스타': 'SISTAR', '싸이': 'PSY', '버스커 버스커': 'Busker Busker', '에일리': 'Ailee',
  '프라이머리': 'Primary', '에이핑크': 'Apink', '배치기': 'Baechigi', '포미닛': '4MINUTE', '허각': 'Huh Gak', '이승철': 'Lee Seung Chul',
  '소유, 정기고': 'SOYOU & JUNGGIGO', '태양': 'TAEYANG', '산이, 레이나': 'San E & Raina', '하이포, 아이유': 'HIGH4 & IU', '걸스데이': "Girl's Day", '악뮤': 'AKMU',
  '나얼': 'Naul', '자이언티': 'Zion.T', '백아연': 'Baek A Yeon', '혁오': 'HYUKOH', '자이언티, 크러쉬': 'Zion.T & Crush', '로꼬, 유주': 'Loco & YUJU', '임창정': 'Lim Chang Jung',
  '트와이스': 'TWICE', '여자친구': 'GFRIEND', '엠씨더맥스': 'M.C the MAX', '어반자카파': 'Urban Zakapa', '한동근': 'Han Dong Geun', '지코': 'ZICO', '거미': 'GUMMY', '이적': 'Lee Juck',
  '윤종신': 'Yoon Jong Shin', '볼빨간사춘기': 'BOL4', '마크툽, 구윤회': 'MAKTUB & Koo Yoon Hoe', '헤이즈': 'Heize', '크러쉬': 'Crush',
  'iKON': 'iKON', '장덕철': 'Jang Deok Cheol', '폴킴': 'Paul Kim', '닐로': 'Nilo', '모모랜드': 'MOMOLAND', 'BLACKPINK': 'BLACKPINK', '멜로망스': 'MeloMance', '숀': 'SHAUN', '로이킴': 'Roy Kim',
  '임재현': 'Lim Jae Hyun', '케이시': 'Kassy', '방탄소년단': 'BTS', '태연': 'TAEYEON', '잔나비': 'JANNABI', '송하예': 'Song Ha Ye',
  '창모': 'CHANGMO', '조정석': 'Jo Jung Suk', '장범준': 'Jang Beom June', '노을': 'Noel', '가호': 'Gaho',
  '브레이브걸스': 'Brave Girls', 'aespa': 'aespa', '경서': 'Kyoungseo', '이무진': 'Lee Mu Jin', '송이한': 'Song I Han',
  'IVE': 'IVE', '(여자)아이들': 'i-dle', '김민석': 'Kim Min Seok', '임영웅': 'Lim Young Woong', '경서예지, 전건호': 'Kyoungseo Yeji & Jeon Gun Ho',
  'NewJeans': 'NewJeans', '윤하': 'YOUNHA', '박재정': 'Parc Jae Jung',
  'TWS': 'TWS', 'DAY6': 'DAY6', '아일릿': 'ILLIT', '이창섭': 'LEE CHANG SUB', 'QWER': 'QWER',
  'WOODZ': 'WOODZ', '황가람': 'Hwang Ga Ram', '조째즈': 'Jo Jazz', '로제, 브루노 마스': 'ROSÉ & Bruno Mars', '10CM': '10CM', '제니': 'JENNIE', 'BOYNEXTDOOR': 'BOYNEXTDOOR', '로제': 'ROSÉ',
};
// 연도: [제목 정본, 가수 정본] 1~15위 순서(피처링 · 드라마 표기 뺀 꼴 — 원문은 rawTitle)
export const YE = {
  2005: [['죄와벌', 'SG 워너비'], ['겁쟁이', '버즈'], ['사랑했나봐', '윤도현'], ['살다가', 'SG 워너비'], ['광', 'SG 워너비', '광(狂)'], ['세글자', '엠투엠'], ['제자리 걸음', '김종국'], ['가시', '버즈'], ['I Love U Oh Thank U', 'MC몽'], ['둘이서', '채연'], ['너에게 전하는 아홉가지 바램', 'KCM'], ['Smile Again', 'KCM']],
  2006: [['내 사람', 'SG 워너비', '내 사람: Partner For Life'], ['사랑 안해', '백지영'], ['여인의 향기', '씨야'], ['남자를 몰라', '버즈'], ['LOVE ALL', 'gavy nj'], ['Hold the line', '조PD'], ['까만안경', '이루'], ['그 남자 그 여자', '바이브'], ['하기 힘든 말', '이승기'], ['거리에서', '성시경'], ['그녀를 사랑해줘요', '하동균']],
  2007: [['미인', '이기찬', '미인 (美人)'], ['이럴거면', '아이비'], ['유혹의 소나타', '아이비'], ['미워요', '씨야'], ['잔소리', '더 넛츠'], ['Love Love Love', '에픽하이'], ['안녕', 'KCM'], ['흰눈', '이루'], ['추억은 사랑을 닮아', '박효신'], ['사랑...후에', '신혜성, 린'], ['같은 베개...', '테이']],
  2008: [['So Hot', '원더걸스'], ['하루 하루', '빅뱅'], ['Love', '브라운아이드걸스'], ['Nobody', '원더걸스'], ['서커스', 'MC몽'], ['마지막 인사', '빅뱅'], ['사랑과 전쟁', '다비치'], ['U-Go-Girl', '이효리'], ['천국', '빅뱅'], ['가지마 가지마', '브라운 아이즈'], ['발자국', '먼데이 키즈']],
  2009: [['Gee', '소녀시대'], ["I Don't Care", '2NE1'], ['Abracadabra', '브라운아이드걸스'], ['Heartbreaker', 'G-DRAGON'], ['Again & Again', '2PM'], ['심장이 없어', '에이트'], ['사랑비', '김태우'], ['Fire', '2NE1'], ['쏘리 쏘리', '슈퍼주니어'], ['Lollipop', '빅뱅, 2NE1'], ['외톨이', '아웃사이더']],
  2010: [['Bad Girl Good Girl', '미쓰에이'], ['잔소리', '아이유'], ['죽을 만큼 아파서', 'MC몽'], ['못해', '포맨'], ['죽어도 못 보내', '2AM'], ['Oh!', '소녀시대'], ['2 Different Tears', '원더걸스'], ['너 때문에 미쳐', '티아라'], ['밥만 잘 먹더라', '옴므'], ['Go Away', '2NE1'], ['루팡', '카라'], ['시간아 멈춰라', '다비치']],
  2011: [['Roly-Poly', '티아라'], ['바람났어', 'GG'], ['내가 제일 잘 나가', '2NE1'], ['비가 오는 날엔', '비스트'], ['TV를 껐네...', '리쌍'], ['So Cool', '씨스타'], ['UGLY', '2NE1'], ['좋은 날', '아이유'], ['살다가 한번쯤', '포맨'], ['안녕이라고 말하지마', '다비치'], ['그리워 그리워', '노을']],
  2012: [['강남스타일', '싸이'], ['나혼자', '씨스타'], ['벚꽃 엔딩', '버스커 버스커'], ['Loving U', '씨스타'], ['FANTASTIC BABY', '빅뱅'], ['I Love You', '2NE1'], ['정말로 사랑한다면', '버스커 버스커'], ['Heaven', '에일리'], ['하루 끝', '아이유'], ['첫사랑', '버스커 버스커'], ['Lovey-Dovey', '티아라']],
  2013: [['자니', '프라이머리'], ['눈물', '리쌍'], ['NoNoNo', '에이핑크'], ['눈물샤워', '배치기'], ['? (물음표)', '프라이머리'], ['Give It To Me', '씨스타'], ['이름이 뭐예요?', '포미닛'], ['모노드라마', '허각'], ['My Love', '이승철'], ['있다 없으니까', '씨스타19'], ['미친연애', '범키'], ['으르렁', 'EXO']],
  2014: [['썸', '소유, 정기고'], ['야생화', '박효신'], ['눈, 코, 입', '태양'], ['금요일에 만나요', '아이유'], ['한여름밤의 꿀', '산이, 레이나'], ['봄 사랑 벚꽃 말고', '하이포, 아이유'], ['Mr. Chu', '에이핑크'], ['너의 의미', '아이유'], ['Something', '걸스데이'], ['200%', '악뮤'], ['그대가 분다', '엠씨더맥스']],
  2015: [['뱅뱅뱅', '빅뱅'], ['같은 시간 속의 너', '나얼'], ['꺼내 먹어요', '자이언티'], ['이럴거면 그러지말지', '백아연'], ['위잉위잉', '혁오'], ['LOSER', '빅뱅'], ['BAE BAE', '빅뱅'], ['그냥', '자이언티, 크러쉬'], ['양화대교', '자이언티'], ['우연히 봄', '로꼬, 유주'], ['또 다시 사랑', '임창정'], ['위아래', 'EXID']],
  2016: [['CHEER UP', '트와이스'], ['시간을 달려서', '여자친구'], ['어디에도', '엠씨더맥스'], ['널 사랑하지 않아', '어반자카파'], ['이 사랑', '다비치'], ['이 소설의 끝을 다시 써보려 해', '한동근'], ['너는 나 나는 너', '지코'], ['You Are My Everything', '거미'], ['OOH-AHH하게', '트와이스'], ['걱정말아요 그대', '이적']],
  2017: [['첫눈처럼 너에게 가겠다', '에일리'], ['밤편지', '아이유'], ['좋니', '윤종신'], ['좋다고 말해', '볼빨간사춘기'], ['Marry Me', '마크툽, 구윤회'], ['비도 오고 그래서', '헤이즈'], ['팔레트', '아이유'], ['Beautiful', '크러쉬'], ['오늘 취하면', '수란'], ['KNOCK KNOCK', '트와이스'], ['REALLY REALLY', 'WINNER'], ['봄날', '방탄소년단']],
  2018: [['사랑을 했다', 'iKON'], ['그날처럼', '장덕철'], ['모든 날, 모든 순간', '폴킴'], ['지나오다', '닐로'], ['뿜뿜', '모모랜드'], ['뚜두뚜두', 'BLACKPINK'], ['선물', '멜로망스'], ['Way Back Home', '숀'], ['그때 헤어지면 돼', '로이킴'], ['여행', '볼빨간사춘기']],
  2019: [['사랑에 연습이 있었다면', '임재현'], ['그때가 좋았어', '케이시'], ['작은 것들을 위한 시', '방탄소년단'], ['넘쳐흘러', '엠씨더맥스'], ['너를 만나', '폴킴'], ['사계', '태연'], ['주저하는 연인들을 위해', '잔나비'], ['니 소식', '송하예'], ['오늘도 빛나는 너에게', '마크툽'], ['벌써 12시', '청하']],
  2020: [['아무노래', '지코'], ['METEOR', '창모'], ['아로하', '조정석'], ['흔들리는 꽃들 속에서 네 샴푸향이 느껴진거야', '장범준'], ['에잇', '아이유'], ['Blueming', '아이유'], ['늦은 밤 너의 집 앞 골목길에서', '노을'], ['시작', '가호'], ['Psycho', '레드벨벳'], ['어떻게 이별까지 사랑하겠어, 널 사랑하는 거지', '악뮤'], ['Dynamite', '방탄소년단']],
  2021: [['Celebrity', '아이유'], ['롤린', '브레이브걸스'], ['Next Level', 'aespa'], ['라일락', '아이유'], ['밤하늘의 별을', '경서'], ['신호등', '이무진'], ['Butter', '방탄소년단'], ['내 손을 잡아', '아이유'], ['밝게 빛나는 별이 되어 비춰줄게', '송이한'], ['바라만 본다', 'MSG워너비'], ['잠이 오질 않네요', '장범준'], ['헤픈 우연', '헤이즈']],
  2022: [['LOVE DIVE', 'IVE'], ['TOMBOY', '(여자)아이들'], ['취중고백', '김민석'], ['사랑인가 봐', '멜로망스'], ['사랑은 늘 도망가', '임영웅'], ['ELEVEN', 'IVE'], ['봄여름가을겨울', '빅뱅'], ['다정히 내 이름을 부르면', '경서예지, 전건호'], ['That That', '싸이'], ['정이라고 하자', 'BIG Naughty']],
  2023: [['Ditto', 'NewJeans'], ['Hype Boy', 'NewJeans'], ['I AM', 'IVE'], ['OMG', 'NewJeans'], ['사건의 지평선', '윤하'], ['Kitsch', 'IVE'], ['퀸카', '(여자)아이들'], ['Attention', 'NewJeans'], ['헤어지자 말해요', '박재정'], ['After LIKE', 'IVE'], ['Spicy', 'aespa']],
  2024: [['첫 만남은 계획대로 되지 않아', 'TWS'], ['나는 아픈 건 딱 질색이니까', '(여자)아이들'], ['Supernova', 'aespa'], ['Love wins all', '아이유'], ['한 페이지가 될 수 있게', 'DAY6'], ['비의 랩소디', '임재현'], ['예뻤어', 'DAY6'], ['Magnetic', '아일릿'], ['천상연', '이창섭'], ['고민중독', 'QWER'], ['To. X', '태연']],
  2025: [['Drowning', 'WOODZ'], ['HOME SWEET HOME', 'G-DRAGON'], ['Whiplash', 'aespa'], ['나는 반딧불', '황가람'], ['모르시나요', '조째즈'], ['APT.', '로제, 브루노 마스'], ['REBEL HEART', 'IVE'], ['HAPPY', 'DAY6'], ['TOO BAD', 'G-DRAGON'], ['너에게 닿기를', '10CM'], ['like JENNIE', '제니']],
};
export const CLASSIC = [
  ...[['가까이 하기엔 너무 먼 당신', '이광조'], ['가시나무', '시인과 촌장'], ['개똥벌레', '신형원'], ['거리에서', '김광석'], ['그것만이 내세상', '들국화'], ['나 항상 그대를', '이선희'], ['난 아직 모르잖아요', '이문세'], ['겨울 비는 내리고', '김범룡'], ['그댄 봄비를 무척 좋아하나요', '배따라기'], ['꿈에', '조덕배']].map((x) => [...x, AG('KPOP', 1980), '1980']),
  ...[['내사랑 내곁에', '김현식'], ['너를 사랑해', '한동준'], ['아주 오래된 연인들', '015B'], ['이별의 그늘', '윤상'], ['Poison', '엄정화'], ['내가 만일', '안치환'], ['도시인', '넥스트'], ['애모', '김수희'], ['너를 향한 마음', '이승환'], ['희망사항', '변진섭'], ['핑계', '김건모'], ['사랑을 위하여', '김종환'], ['사랑일뿐야', '김민우'], ['달팽이', '패닉'], ['잘못된 만남', '김건모'], ['사랑할수록', '부활'], ['기억의 습작', '전람회'], ['미소 속에 비친 그대', '신승훈'], ['나를 슬프게 하는 사람들', '김경호'], ['나의 노래', '김광석']].map((x) => [...x, AG('KPOP', 1990), '1990']),
  ...[['벌써 일년', '브라운 아이즈'], ['No.1', '보아'], ['I Love You', '포지션'], ['거짓말', 'god'], ['아시나요', '조성모'], ['With Me', '휘성'], ['미안해요', '김건모'], ['열정', 'SE7EN'], ['Break Away', '빅마마'], ['아틀란티스 소녀', '보아'], ['비몽', '코요태']].map((x) => [...x, AG('KPOP', 2000), '2000']),
];
export const POP = [
  ...[['Take My Breath Away', 'Berlin'], ['I Just Called to Say I Love You', 'Stevie Wonder'], ['Careless Whisper', 'Wham!'], ['Every Breath You Take', 'The Police'], ['Right Here Waiting', 'Richard Marx'], ['Woman in Love', 'Barbra Streisand'], ["Nothing's Gonna Change My Love for You", 'Glenn Medeiros'], ['Keep On Loving You', 'REO Speedwagon'], ['Funkytown', 'Lipps Inc.'], ['Endless Love', 'Lionel Richie'], ['The Lady in Red', 'Chris de Burgh'], ["Hard to Say I'm Sorry", 'Chicago'], ['Flashdance... What a Feeling', 'Irene Cara'], ["I Love Rock 'N Roll", 'Joan Jett & the Blackhearts'], ['Billie Jean', 'Michael Jackson']].map((x) => [...x, AG('POP', 1980), '1980']),
  ...[['The Power of Love', 'Céline Dion'], ['I Will Always Love You', 'Whitney Houston'], ['My Heart Will Go On', 'Céline Dion'], ['Truly Madly Deeply', 'Savage Garden'], ['Nothing Compares 2 U', "Sinéad O'Connor"], ['Now and Forever', 'Richard Marx'], ["(I Can't Help) Falling in Love With You", 'UB40'], ['(Everything I Do) I Do It for You', 'Bryan Adams'], ['Time to Say Goodbye', 'Andrea Bocelli'], ["I'll Be Missing You", 'Puff Daddy'], ['How Am I Supposed to Live Without You', 'Michael Bolton'], ['Because You Loved Me', 'Céline Dion'], ['Change the World', 'Eric Clapton'], ['Tears in Heaven', 'Eric Clapton'], ['A Whole New World', 'Peabo Bryson']].map((x) => [...x, AG('POP', 1990), '1990']),
  ...[["I'm Yours", 'Jason Mraz'], ['Crazy in Love', 'Beyoncé'], ['Maria Maria', 'Santana'], ["Can't Get You Out of My Head", 'Kylie Minogue'], ['I Knew I Loved You', 'Savage Garden'], ['Hey Ya!', 'OutKast'], ['Because of You', 'Ne-Yo'], ['Yeah!', 'Usher'], ['Foolish', 'Ashanti'], ['Poker Face', 'Lady Gaga'], ['Toxic', 'Britney Spears'], ['No One', 'Alicia Keys'], ['Lady Marmalade', 'Christina Aguilera'], ['Thank You', 'Dido'], ['This Love', 'Maroon 5']].map((x) => [...x, AG('POP', 2000), '2000']),
  ...[["I'm Not the Only One", 'Sam Smith'], ['Shape of You', 'Ed Sheeran'], ['Lost Stars', 'Adam Levine'], ['Sugar', 'Maroon 5'], ['Love Yourself', 'Justin Bieber'], ['Someone Like You', 'Adele'], ['Uptown Funk', 'Mark Ronson'], ['Havana', 'Camila Cabello'], ['Maps', 'Maroon 5'], ['HandClap', 'Fitz and The Tantrums'], ['2002', 'Anne-Marie'], ['Closer', 'The Chainsmokers'], ['Hello', 'Adele'], ['See You Again', 'Wiz Khalifa'], ['Problem', 'Ariana Grande']].map((x) => [...x, AG('POP', 2010), '2010']),
];
// J-POP: [제목(멜론 표기), 가수(영문 — iTunes), 한국 표기 가수 정본]
export const JPOP = [['Pretender', 'Official HIGE DANDism', '오피셜히게단디즘'], ['晩餐歌', 'tuki.', '츠키'], ['Lemon', 'Kenshi Yonezu', '요네즈 켄시'], ['BETELGEUSE', 'Yuuri', '유우리'], ['Heroine', 'back number', '백넘버'], ['IRIS OUT', 'Kenshi Yonezu', '요네즈 켄시'],
  ['JANE DOE', 'Kenshi Yonezu', '요네즈 켄시'], ['odoriko', 'Vaundy', '바운디'], ['Walking with You', 'Novelbright', '노벨브라이트'], ['Good bye-bye', 'Ai Tomioka', '토미오카 아이'], ['NIGHT DANCER', 'imase', '이마세'], ['サムライハート (Some Like It Hot!!)', 'SPYAIR', '스파이에어'],
  ['LADY', 'Kenshi Yonezu', '요네즈 켄시'], ['愛を伝えたいだとか', 'Aimyon', '아이묭'], ['夜に駆ける', 'YOASOBI', '요아소비'], ['怪獣の花唄', 'Vaundy', '바운디'], ['Dried Flower', 'Yuuri', '유우리'], ['Lilac', 'Mrs. GREEN APPLE', '미세스 그린 애플'],
  ['W / X / Y', 'Tani Yuuki', '타니 유우키'], ['KICK BACK', 'Kenshi Yonezu', '요네즈 켄시'], ['真夜中のドア〜stay with me', 'Miki Matsubara', '마츠바라 미키'], ['残酷な天使のテーゼ', 'Yoko Takahashi', '타카하시 요코'], ['クリスマスソング', 'back number', '백넘버'], ['水平線', 'back number', '백넘버'],
  ['アイドル', 'YOASOBI', '요아소비'], ['スパークル', 'RADWIMPS', '래드윔프스'], ['悪魔の子', 'Ai Higuchi', '히구치 아이'], ['青のすみか', 'Tatsuya Kitani', '키타니 타츠야'], ['シルエット', 'KANA-BOON', '카나분'], ['マリーゴールド', 'Aimyon', '아이묭']];
export const SRC = { M, AG, JP };

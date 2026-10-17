// =============================================================================
// ★★ 타자 미니게임 제시 문장 (R051 · D-237) — 한글 40(짧은 22 · 긴 18) · 영어 40 · 15~40자(공백 · 구두점 포함)
//
// ★ 출처 — 저작권 문제가 없는 것만:
//   · 한글 짧은 것: 우리 속담(전래 · 지은이 없음).
//   · 한글 긴 것: 속담 두 개를 이은 것(이음말만 MAIN 이 붙임) · 이순신(1545~1598) 「必死則生 必生則死」의 흔한 우리말 풀이 ·
//     안중근(1879~1910) 유묵 「一日不讀書 口中生荊棘」의 흔한 우리말 풀이 — 둘 다 옛 글(공유 저작물).
//   · 영어: 팬그램(전해 오는 것 · 지은이 없음) · 영어 속담 · 옛 격언(Bacon 1597 · Descartes 1637 · Shakespeare 1600 · Caesar ·
//     Bulwer-Lytton 1839 — 모두 공유 저작물).
//   ✗ 가사 · 현대 시 · 소설 문장은 넣지 않는다.
// ★ 모바일 키보드가 바꿔 버리는 글자는 넣지 않는다 — 따옴표 ' " (아이폰 "스마트 구두점" 이 ’ ” 로 바꾼다) · 줄표 -- · 말줄임 ...
// ★ 단위 검사(typing.test.ts)가 길이 15~40 · 개수 · 겹침 없음 · 금지 글자를 지킨다.
// =============================================================================

/** 한글 짧은 것 (15~25자) — 1판 */
export const TYPING_KO_SHORT: readonly string[] = [
  '가는 말이 고와야 오는 말이 곱다.',
  '낮말은 새가 듣고 밤말은 쥐가 듣는다.',
  '원숭이도 나무에서 떨어질 때가 있다.',
  '고래 싸움에 새우 등 터진다.',
  '하늘이 무너져도 솟아날 구멍이 있다.',
  '콩 심은 데 콩 나고 팥 심은 데 팥 난다.',
  '될성부른 나무는 떡잎부터 알아본다.',
  '사공이 많으면 배가 산으로 간다.',
  '개구리 올챙이 적 생각 못 한다.',
  '구슬이 서 말이라도 꿰어야 보배라.',
  '굼벵이도 구르는 재주가 있다.',
  '말 한마디로 천 냥 빚을 갚는다.',
  '서당 개 삼 년이면 풍월을 읊는다.',
  '오르지 못할 나무는 쳐다보지도 마라.',
  '한 귀로 듣고 한 귀로 흘린다.',
  '가지 많은 나무에 바람 잘 날 없다.',
  '모로 가도 서울만 가면 된다.',
  '사촌이 땅을 사면 배가 아프다.',
  '남의 잔치에 감 놓아라 배 놓아라 한다.',
  '자라 보고 놀란 가슴 솥뚜껑 보고 놀란다.',
  '귀에 걸면 귀걸이 코에 걸면 코걸이.',
  '뱁새가 황새를 따라가면 가랑이가 찢어진다.',
];

/** 한글 긴 것 (26~40자) — 3판 */
export const TYPING_KO_LONG: readonly string[] = [
  '물에 빠진 놈 건져 놓으니 보따리 내놓으라 한다.',
  '열 길 물속은 알아도 한 길 사람 속은 모른다.',
  '떡 줄 사람은 생각도 않는데 김칫국부터 마신다.',
  '죽고자 하면 살 것이요, 살고자 하면 죽을 것이다.',
  '하루라도 책을 읽지 않으면 입안에 가시가 돋는다.',
  '가는 말이 고와야 오는 말이 곱고, 말 한마디로 천 냥 빚을 갚는다.',
  '낮말은 새가 듣고 밤말은 쥐가 들으니, 발 없는 말이 천 리 간다.',
  '돌다리도 두들겨 보고 건너고, 아는 길도 물어 가라.',
  '티끌 모아 태산이요, 천 리 길도 한 걸음부터다.',
  '소 잃고 외양간 고치지 말고, 우물은 목마르기 전에 파라.',
  '콩 심은 데 콩 나고 팥 심은 데 팥 나니, 뿌린 대로 거둔다.',
  '백지장도 맞들면 낫고, 두 손뼉이 맞아야 소리가 난다.',
  '세 살 버릇 여든까지 가고, 바늘 도둑이 소도둑 된다.',
  '웃는 얼굴에 침 못 뱉고, 미운 아이 떡 하나 더 준다.',
  '하늘이 무너져도 솟아날 구멍이 있고, 고생 끝에 낙이 온다.',
  '가랑비에 옷 젖는 줄 모르고, 티끌 모아 태산이 된다.',
  '뛰는 놈 위에 나는 놈 있으니, 하룻강아지 범 무서운 줄 모른다.',
  '열 번 찍어 안 넘어가는 나무 없고, 낙숫물이 댓돌을 뚫는다.',
];

/** 영어 (15~40자) — 2판 */
export const TYPING_EN: readonly string[] = [
  // 팬그램
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump!',
  'Sphinx of black quartz, judge my vow.',
  'The five boxing wizards jump quickly.',
  'Jackdaws love my big sphinx of quartz.',
  'Bright vixens jump; dozy fowl quack.',
  'Quick zephyrs blow, vexing daft Jim.',
  'Waltz, bad nymph, for quick jigs vex.',
  'Glib jocks quiz nymph to vex dwarf.',
  'Two driven jocks help fax my big quiz.',
  'Five quacking zephyrs jolt my wax bed.',
  // 속담 · 옛 격언
  'Actions speak louder than words.',
  'A picture is worth a thousand words.',
  'Practice makes perfect.',
  'Better late than never.',
  'Every cloud has a silver lining.',
  'Where there is a will, there is a way.',
  'When in Rome, do as the Romans do.',
  'The early bird catches the worm.',
  'An apple a day keeps the doctor away.',
  'Time and tide wait for no man.',
  'All that glitters is not gold.',
  'Rome was not built in a day.',
  'Honesty is the best policy.',
  'Knowledge is power.',
  'Slow and steady wins the race.',
  'Two heads are better than one.',
  'Fortune favors the bold.',
  'Laughter is the best medicine.',
  'Still waters run deep.',
  'Birds of a feather flock together.',
  'The pen is mightier than the sword.',
  'Easy come, easy go.',
  'Necessity is the mother of invention.',
  'A friend in need is a friend indeed.',
  'Absence makes the heart grow fonder.',
  'I think, therefore I am.',
  'Brevity is the soul of wit.',
  'I came, I saw, I conquered.',
  'Strike while the iron is hot.',
];

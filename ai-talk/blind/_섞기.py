# -*- coding: utf-8 -*-
# 블라인드 평가지 만들기 (max 설계 · 2026-11-12)
#   python _섞기.py   →  평가.html (찬종이 여는 것) · _열쇠.json (다 고를 때까지 아무도 열지 않는다)
# 섞는 순서는 고정 씨앗 + 문항 id 로만 정해진다(누가 썼는지와 무관).
import io, json, re, random, hashlib

SEED = 'quiz-web-blind-20261112'
WRITERS = ['gpt', 'max', 'web']
NUM = r'\d[\d,\.]*\d|\d'


def norm(x):
    return re.sub(r'\s+', ' ', (x or '').strip())


def nsent(x):
    return len([p for p in re.split(u'(?<=[.?!])\\s+', x.strip()) if p])


src = {}
order = []
for blk in io.open(u'입력-50.txt', encoding='utf-8').read().split('\n\n'):
    m = re.match(u'\\[(\\d+)\\] 등급 (\\S+)\n질문: (.*)\n정답: (.*)\n힌트: (.*)\n해설: (.*)', blk.strip(), re.S)
    if m:
        i = int(m.group(1))
        src[i] = dict(grade=m.group(2), q=norm(m.group(3)), a=m.group(4).strip(), hint=m.group(5).strip(), expl=m.group(6).strip())
        order.append(i)

out = {}
for w in WRITERS:
    raw = io.open(u'출력-%s.json' % w, encoding='utf-8-sig').read()
    d = json.loads(re.search(r'\{.*\}', raw, re.S).group(0))
    out[w] = dict((r['id'], r) for r in d['results'])


def gate(i, q):
    """원문 대비 기계 검사 — (막는 깃발, 참고 깃발)"""
    o = src[i]
    hard, soft = [], []
    a = o['a'].replace(' ', '').lower()
    if a in q.replace(' ', '').lower() and a not in o['q'].replace(' ', '').lower():
        hard.append(u'정답 글자가 질문에 있음')
    lost = set(re.findall(NUM, o['q'])) - set(re.findall(NUM, q))
    if lost:
        hard.append(u'원문 숫자 빠짐 ' + u' · '.join(sorted(lost)))
    for x in re.findall(u"['‘]([^'’]{2,})['’]", o['q']):
        if x not in q:
            hard.append(u'원문 인용 빠짐 ' + x)
    new = set(re.findall(NUM, q)) - set(re.findall(NUM, o['q'] + o['hint'] + o['expl']))
    if new:
        soft.append(u'새 숫자 ' + u' · '.join(sorted(new)))
    if nsent(q) < nsent(o['q']) and not re.search(u'\\? \\S', o['q']):
        soft.append(u'문장 합침')
    if not re.search(u'까요\\?$', q):
        soft.append(u'끝이 ~까요? 아님')
    return hard, soft


def build(i, salt):
    o = src[i]
    cands = {}  # text -> authors

    def add(text, who):
        cands.setdefault(text, []).append(who)

    add(o['q'], u'원문')
    for w in WRITERS:
        r = out[w][i]
        v = r.get('verdict')
        if v == 'keep':
            add(o['q'], w)
        elif v == 'discard':
            add(u'(이 문항은 버리자고 함 — %s)' % norm(r.get('note') or r.get('reason') or ''), w)
        else:
            add(norm(r.get('question')), w)
    texts = sorted(cands)
    rnd = random.Random(hashlib.sha256((u'%s|%s|%s' % (SEED, i, salt)).encode('utf-8')).hexdigest())
    rnd.shuffle(texts)
    shown, key, stats = [], {}, {}
    for n, t in enumerate(texts):
        k = 'ABCD'[n]
        hard, soft = ([], []) if t.startswith(u'(이 문항은') else gate(i, t)
        shown.append(dict(k=k, text=t, warn=hard))
        key[k] = cands[t]
        stats[k] = dict(hard=hard, soft=soft, len=len(t), same_as_original=(t == o['q']))
    return shown, key, stats


rnd0 = random.Random(SEED)
repeat = rnd0.sample(order, 8)
sheet, keyfile = [], {}
seq = [(i, 'first') for i in order] + [(i, 'again') for i in repeat]
unanimous = []
n = 0
for (i, salt) in seq:
    shown, key, stats = build(i, salt)
    o = src[i]
    if len(shown) == 1:  # 셋 다 원문 그대로 — 고를 것이 없어 화면에서 뺀다
        if salt == 'first':
            unanimous.append(i)
        continue
    n += 1
    sheet.append(dict(n=n, answer=o['a'], hint=o['hint'], cands=shown))
    keyfile[str(n)] = dict(id=i, repeat=(salt == 'again'), authors=key, stats=stats)

tpl = io.open(u'_평가-틀.html', encoding='utf-8').read()
html = tpl.replace(u'/*DATA*/[]', json.dumps(sheet, ensure_ascii=False))
io.open(u'평가.html', 'w', encoding='utf-8', newline='').write(html)
keyfile['_unanimous_keep'] = unanimous
io.open(u'_열쇠.json', 'w', encoding='utf-8', newline='').write(json.dumps(keyfile, ensure_ascii=False, indent=1))
ncand = [len(s['cands']) for s in sheet]
print(u'화면 문항 %d(되풀이 포함) · 셋 다 원문 그대로 %d · 후보 수 분포 %s' % (len(sheet), len(unanimous), dict((k, ncand.count(k)) for k in sorted(set(ncand)))))

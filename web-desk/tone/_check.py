# -*- coding: utf-8 -*-
# 설계 검사용 (웹에 올리지 않는다): python _check.py 02 03 ...  (인자 없으면 받은것/ 의 비어 있지 않은 결과 전부)
import io, json, re, sys, os, glob
from collections import Counter
def load_src(nn):
    src = {}
    for blk in io.open(u'보낼것/조각-%s.txt' % nn, encoding='utf-8').read().split('\n\n'):
        m = re.match(u'\[(\d+)\] 등급 (\S+)\n질문: (.*)\n정답: (.*)\n힌트: (.*)\n해설: (.*)', blk.strip(), re.S)
        if m: src[int(m.group(1))] = m.groups()
    return src
NUM = r'\d[\d,\.]*\d|\d'
def check(nn):
    f = u'받은것/결과-%s.json' % nn
    raw = io.open(f, encoding='utf-8').read()
    if not raw.strip(): return None
    try: d = json.loads(re.search(r'\{.*\}', raw, re.S).group(0))
    except Exception as e: return u'%s: JSON 오류 %s' % (nn, e)
    src = load_src(nn); R = d.get('results', [])
    ids = [r.get('id') for r in R]; bad = []
    miss = set(src) - set(ids); extra = set(ids) - set(src)
    c = Counter((r.get('verdict'), r.get('form')) for r in R)
    for r in R:
        o = src.get(r.get('id'))
        if not o or r.get('verdict') != 'rewrite': continue
        q = r.get('question') or ''; fl = []
        if not re.search(u'까요\?$', q.strip()): fl.append(u'끝')
        if q.count('?') > 1 and not re.search(u"['\"“‘][^'\"”’]*\?", q): fl.append(u'물음표 여럿')
        if q.count(u'데요') >= 3: fl.append(u'데요 3+')
        if re.match(u'^(이것은|이곳은|이들은) ', q) and re.search(u'(입니다)\. 이', q) and r.get('form') != 'long': fl.append(u'틀 반복?')
        _a = o[3].replace(' ', '').lower()
        if _a in q.replace(' ', '').lower() and _a not in o[2].replace(' ', '').lower(): fl.append(u'정답 노출(새로)')
        lost = set(re.findall(NUM, o[2])) - set(re.findall(NUM, q))
        if lost: fl.append(u'숫자 빠짐 %s' % sorted(lost))
        new = set(re.findall(NUM, q)) - set(re.findall(NUM, o[2] + o[4] + o[5]))
        if new and not r.get('added'): fl.append(u'새 숫자 %s' % sorted(new))
        for x in re.findall(u"['‘]([^'’]{2,})['’]", o[2]):
            if x not in q: fl.append(u'따옴표 빠짐 ' + x)
        L = len(q)
        if L > 230 or L > len(o[2]) * 1.6 + 15 or L < len(o[2]) * 0.6: fl.append(u'길이 %d→%d' % (len(o[2]), L))
        if re.search(u'(이다|했다|한다|된다)\. ', q): fl.append(u'~다 말투')
        if r.get('form') == 'line' and len(q) > 70 and u', ' in q: fl.append(u'긴 한 문장 %d자' % len(q))
        if fl: bad.append((r['id'], fl, q))
    out = [u'조각 %s: %d/%d · 빠짐 %d · 더함 %d · %s · 깃발 %d' % (nn, len(R), len(src), len(miss), len(extra), dict((u'%s/%s' % k, v) for k, v in c.items()), len(bad))]
    for b in bad: out.append(u'  #%s %s | %s' % (b[0], u' · '.join(b[1]), b[2][:90]))
    for r in R:
        if r.get('verdict') == 'discard': out.append(u'  폐기 #%s %s — %s | 정답 %s' % (r['id'], r.get('reason'), r.get('note'), src.get(r['id'], ['']*4)[3]))
    return u'\n'.join(out)
if __name__ == '__main__':
    nns = sys.argv[1:] or sorted(os.path.basename(p)[3:5] for p in glob.glob(u'받은것/결과-[0-9][0-9].json'))
    for nn in nns:
        r = check(nn)
        if r: print(r)

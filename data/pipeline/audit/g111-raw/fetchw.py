import sys,json,urllib.request,urllib.parse,time,os
lang=sys.argv[1]
for t in sys.argv[2:]:
    fn=f"tmp50/{lang}-{t}.txt"
    if os.path.exists(fn) and os.path.getsize(fn)>0: continue
    for k in range(6):
        try:
            u=f"https://{lang}.wikipedia.org/w/api.php?"+urllib.parse.urlencode({"action":"query","prop":"extracts","explaintext":1,"redirects":1,"format":"json","formatversion":2,"titles":t})
            r=urllib.request.Request(u,headers={"User-Agent":"quiz-research/1.0"})
            d=json.load(urllib.request.urlopen(r))
            p=d['query']['pages'][0]
            open(fn,"w",encoding="utf-8").write(p.get('extract',''))
            break
        except Exception as e:
            time.sleep(40)
    time.sleep(4)

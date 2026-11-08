#!/usr/bin/env python3
# share_data.json -> share.json (page payload)
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'share_data.json')
OUT = os.path.join(ROOT, 'data', 'share_page_data.json')

KO = {
 'ae':'아랍에미리트','ar':'아르헨티나','at':'오스트리아','au':'호주','be':'벨기에','bg':'불가리아',
 'bo':'볼리비아','br':'브라질','ca':'캐나다','ch':'스위스','cl':'칠레','co':'콜롬비아','cr':'코스타리카',
 'cz':'체코','de':'독일','dk':'덴마크','do':'도미니카공화국','ec':'에콰도르','ee':'에스토니아','eg':'이집트',
 'es':'스페인','fi':'핀란드','fr':'프랑스','gb':'영국','gr':'그리스','gt':'과테말라','hk':'홍콩',
 'hn':'온두라스','hu':'헝가리','id':'인도네시아','ie':'아일랜드','in':'인도','is':'아이슬란드','it':'이탈리아',
 'jp':'일본','kr':'한국','kz':'카자흐스탄','lt':'리투아니아','lu':'룩셈부르크','lv':'라트비아','ma':'모로코',
 'mx':'멕시코','my':'말레이시아','ng':'나이지리아','ni':'니카라과','nl':'네덜란드','no':'노르웨이',
 'nz':'뉴질랜드','pa':'파나마','pe':'페루','ph':'필리핀','pk':'파키스탄','pl':'폴란드','pt':'포르투갈',
 'py':'파라과이','ro':'루마니아','sa':'사우디아라비아','se':'스웨덴','sg':'싱가포르','sk':'슬로바키아',
 'sv':'엘살바도르','th':'태국','tr':'튀르키예','tw':'대만','ua':'우크라이나','us':'미국','uy':'우루과이',
 've':'베네수엘라','vn':'베트남','za':'남아프리카공화국',
}

REG = {}
for r, cs in {
 '동아시아': 'kr jp tw hk',
 '동남아': 'sg my th vn id ph',
 '남아시아': 'in pk',
 '북미': 'us ca',
 '유럽': 'at be bg ch cz de dk ee es fi fr gb gr hu ie is it lt lu lv nl no pl pt ro se sk ua',
 '라틴아메리카': 'ar bo br cl co cr do ec gt hn mx ni pa pe py sv uy ve',
 '오세아니아': 'au nz',
 '중동': 'ae sa tr',
 '아프리카': 'eg ma ng za',
 '기타': 'kz',
}.items():
    for c in cs.split():
        REG[c] = r

d = json.load(open(SRC))
M = d['months']
C = d['country']
S = {x['c']: x for x in d['summary']}

missing = [c for c in C if c not in KO or c not in REG]
assert not missing, missing

rows = []
for c in sorted(C, key=lambda c: -S[c]['last']):
    rows.append({
        'c': c, 'ko': KO[c], 'reg': REG[c],
        'last': round(S[c]['last'], 2),
        'first': round(S[c]['first'], 2),
        'delta': round(S[c]['delta'], 2),
        'avg': round(S[c]['avg'], 2),
        's': [round(C[c][m], 2) for m in M],
    })

# region aggregates (equal weight is correct: every country contributes the same
# 200 chart slots per day, so the denominator is identical across countries)
def agg(cs):
    f = sum(S[c]['first'] for c in cs) / len(cs)
    l = sum(S[c]['last'] for c in cs) / len(cs)
    ser = [round(sum(C[c][m] for c in cs) / len(cs), 2) for m in M]
    return {'first': round(f, 2), 'last': round(l, 2), 'delta': round(l - f, 2), 's': ser}

groups = {}
for r in set(REG.values()):
    cs = [c for c in C if REG[c] == r]
    groups[r] = dict(agg(cs), n=len(cs))

out = {
    'months': M,
    'rows': rows,
    'groups': groups,
    'world': d['world'],
    'cohort': d['cohort'],
    'span': [M[0], M[-1]],
}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT), 'bytes;', len(rows), 'countries')
print('groups:')
for r, g in sorted(groups.items(), key=lambda kv: -kv[1]['last']):
    print(f"  {r:8s} n={g['n']:2d}  {g['first']:6.2f} -> {g['last']:6.2f}  ({g['delta']:+.2f}p)")

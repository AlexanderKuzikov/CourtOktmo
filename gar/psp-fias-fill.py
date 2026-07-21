#!/usr/bin/env python3
import json, urllib.request, urllib.parse, time, re

TOKEN = json.loads(urllib.request.urlopen(
    urllib.request.Request("https://fias.nalog.ru/Home/GetSpasSettings?url=https://fias.nalog.ru/Search",
        headers={'User-Agent': 'Mozilla/5.0'})
).read())['Token']

def fias(query):
    url = f"https://fias-public-service.nalog.ru/api/spas/v2.0/GetAddressHint?{urllib.parse.urlencode({'search_string': query[:120], 'address_type': '1'})}"
    req = urllib.request.Request(url, headers={'master-token': TOKEN, 'User-Agent': 'Mozilla/5.0'})
    try: return json.loads(urllib.request.urlopen(req, timeout=15).read()).get('hints', [])
    except: return []

def get_oktmo(obj_id):
    url = f"https://fias-public-service.nalog.ru/api/spas/v2.0/GetAddressItemById?{urllib.parse.urlencode({'object_id': obj_id, 'address_type': '1'})}"
    req = urllib.request.Request(url, headers={'master-token': TOKEN, 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=15).read())
        a = data['addresses'][0] if data.get('addresses') else {}
        return a.get('address_details', {}).get('oktmo', '') if a else ''
    except: return ''

def simplify(addr):
    if not addr: return ''
    a = re.sub(r'^\d{3,6}\s*,?\s*', '', addr)
    a = re.sub(r'-\d{3}\b', '', a)
    a = re.sub(r'ОПС\s+\d+\s*,?\s*', '', a)
    a = re.sub(r'\(для почт\. корресп\.\)', '', a)
    a = re.sub(r'ПСП,\s*', '', a)
    a = re.sub(r'а/я\s+\d+', '', a)
    parts = [p.strip() for p in a.split(',') if p.strip()]
    if not parts: return ''
    
    # Ищем НП: последнюю часть без ул/пер/д/пр до них
    locality = ''
    for p in parts:
        clean = re.sub(r'\b(с\.|г\.|п\.|д\.|аул|ст-ца|х\.|пгт|рп|мкр|пос|с\.п\.)\s', '', p, flags=re.IGNORECASE)
        clean = re.sub(r'[\(\)\[\]«»"\']', '', clean).strip()
        if len(clean) > 3 and not any(x in clean.lower() for x in ['ул', 'пер', 'д ', 'пр-', 'наб', 'шоссе', 'проезд', 'бокс', 'р-н', 'микрорайон', 'мкр']):
            locality = clean
    if not locality:
        for p in parts:
            clean = re.sub(r'[\(\)\[\]«»"\']', '', p).strip()
            if len(clean) > 3:
                locality = clean
    if not locality and parts:
        locality = parts[-1]
    
    region = parts[0]
    query = f"{region}, {locality}"
    query = re.sub(r'\s+', ' ', query).strip().strip(',')
    return query

with open(r'D:\GitHub\CourtOktmo\data\resolved-psp.json', 'r') as f:
    psp = json.load(f)

targets = [r for r in psp['results'] if not r['oktmo']]
print(f"ПСП без ОКТМО: {len(targets)}\n")

found = 0
for r in targets:
    addr = r['address']
    query = simplify(addr)
    if not query or len(query) < 5:
        print(f"  - [{r['code']} ПСП#{r['psp_idx']}] {addr[:50]} — не удалось упростить")
        continue
    
    hints = fias(query)
    oktmo = ''
    for h in hints:
        oktmo = get_oktmo(h['object_id'])
        if oktmo: break
    
    if oktmo:
        r['oktmo'] = oktmo
        r['method'] = 'fias_v2'
        found += 1
        print(f"  ✓ [{r['code']} ПСП#{r['psp_idx']}] {oktmo} ← {query[:50]}")
    else:
        print(f"  ✗ [{r['code']} ПСП#{r['psp_idx']}] {query[:50]} — не найден")
    
    time.sleep(0.25)

psp['withOktmo'] = sum(1 for r in psp['results'] if r['oktmo'])
print(f"\nНайдено: {found}/{len(targets)}")
print(f"ПСП с ОКТМО: {psp['withOktmo']}/{psp['total']}")

with open(r'D:\GitHub\CourtOktmo\data\resolved-psp.json', 'w', encoding='utf-8') as f:
    json.dump(psp, f, ensure_ascii=False, indent=2)
print("Сохранено")

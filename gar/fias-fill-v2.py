#!/usr/bin/env python3
"""
fias-fill-v2.py — поиск ОКТМО через ФИАС по НП (без улицы/дома).
"""
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
    """Из адреса извлекаем только регион + НП (без улицы, дома, префиксов)"""
    a = addr.strip()
    # Индекс
    a = re.sub(r'^\d{3,6}\s*,?\s*', '', a)
    # Почтовые суффиксы: Омск-091 → Омск
    a = re.sub(r'-\d{3}\b', '', a)
    # Разделяем по запятым
    parts = [p.strip() for p in a.split(',') if p.strip()]
    
    if not parts: return ''
    
    # Регион — первая значащая часть
    region = parts[0]
    
    # Ищем НП — часть с типом населённого пункта (г, с, п, д, аул, ст-ца, х, пгт, рп)
    locality = ''
    for p in parts[1:]:
        # Убираем префиксы локаций
        clean = re.sub(r'\b(с\.|г\.|п\.|д\.|аул|ст-ца|х\.|пгт|рп|мкр|с\.п\.|тер|зона|участок|этаж|пом)\b', '', p, flags=re.IGNORECASE)
        clean = re.sub(r'[\(\)\[\]«»"\']', '', clean).strip()
        # Если после очистки осталось короткое слово — пропускаем (улица, переулок и т.д.)
        if len(clean) > 3 and not any(x in clean.lower() for x in ['ул', 'пер', 'пр', 'д ', 'наб', 'шоссе', 'бульв', 'проезд', 'туп', 'пл']):
            locality = clean
            break
    
    if not locality:
        locality = parts[-1]  # последняя часть
        locality = re.sub(r'\b(ул|пер|пр-т|наб|ш|б-р|пл|д)\b', '', locality).strip()
    
    # Строим запрос: регион, НП
    query = f"{region}, {locality}"
    query = re.sub(r'\s+', ' ', query).strip().strip(',')
    return query

with open(r'D:\GitHub\CourtOktmo\data\no-oktmo.json', 'r') as f:
    no_oktmo = json.load(f)

targets = [c for c in no_oktmo['courts'] if c.get('address')]
print(f"Целей: {len(targets)}\n")

found = 0
for c in targets:
    addr = c['address']
    query = simplify(addr)
    
    if not query:
        print(f"  - [{c['code']}] {addr[:50]} — не смог упростить")
        continue
    
    hints = fias(query)
    oktmo = ''
    for h in hints:
        oktmo = get_oktmo(h['object_id'])
        if oktmo: break
    
    if oktmo:
        c['oktmo_fias'] = oktmo
        found += 1
        print(f"  ✓ [{c['code']}] {oktmo} ← {query[:60]}")
    else:
        # Пробуем без региона
        parts = query.split(',')
        if len(parts) > 1:
            q2 = parts[-1].strip()
            hints2 = fias(q2)
            for h in hints2:
                oktmo = get_oktmo(h['object_id'])
                if oktmo: break
        if oktmo:
            c['oktmo_fias'] = oktmo
            found += 1
            print(f"  ✓ [{c['code']}] {oktmo} ← {q2[:40]} (без региона)")
        else:
            print(f"  ✗ [{c['code']}] {query[:60]} — не найден")
    
    time.sleep(0.25)

with open(r'D:\GitHub\CourtOktmo\data\no-oktmo.json', 'w', encoding='utf-8') as f:
    json.dump(no_oktmo, f, ensure_ascii=False, indent=2)

print(f"\nНайдено: {found}/{len(targets)}")

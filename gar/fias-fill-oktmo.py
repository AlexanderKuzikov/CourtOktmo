#!/usr/bin/env python3
"""
fias-fill-oktmo.py — поиск ОКТМО для судов без него через ФИАС API.
"""
import json, urllib.request, urllib.parse, time, re, ssl

# Конфиг
FIAS_TOKEN = "bfa2407b-1dc4-4714-9346-b678408eb099"

def api_get(endpoint, params):
    url = f"https://fias-public-service.nalog.ru{endpoint}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        'master-token': FIAS_TOKEN,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    })
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def search_address(query):
    hints = api_get('/api/spas/v2.0/GetAddressHint', {'search_string': query[:100], 'address_type': '1'})
    return hints.get('hints', [])

def get_address_detail(object_id):
    data = api_get('/api/spas/v2.0/GetAddressItemById', {'object_id': object_id, 'address_type': '1'})
    addrs = data.get('addresses', [])
    if addrs:
        details = addrs[0].get('address_details', {})
        return {
            'oktmo': details.get('oktmo', ''),
            'okato': details.get('okato', ''),
            'kladr': details.get('kladr_code', ''),
            'full_name': addrs[0].get('full_name', ''),
        }
    return None

# Загружаем суды без ОКТМО
with open(r'D:\GitHub\CourtOktmo\data\no-oktmo.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

targets = [c for c in data['courts'] if c.get('address')]
print(f"Ищем ОКТМО для {len(targets)} судов с адресами...\n")

found = 0
for c in targets:
    addr = c['address']
    # Очищаем адрес для поиска
    clean = re.sub(r'^\d{3,6}\s*,?\s*', '', addr).strip()
    
    # Ищем в ФИАС
    hints = search_address(clean)
    
    if hints:
        # Берём первый подходящий (с наименьшим уровнем)
        best = None
        for h in hints:
            detail = get_address_detail(h['object_id'])
            if detail and detail['oktmo']:
                best = detail
                break
        
        if best:
            c['oktmo'] = best['oktmo']
            c['oktmo_fias'] = best['oktmo']
            c['oktmo_method'] = 'fias'
            found += 1
            print(f"  ✓ [{c['code']}] {best['oktmo']} — {best['full_name'][:60]}")
        else:
            print(f"  ✗ [{c['code']}] {clean[:50]} — нет ОКТМО в ФИАС")
    else:
        print(f"  ✗ [{c['code']}] {clean[:50]} — не найден в ФИАС")
    
    time.sleep(0.3)  # rate limiting

# Сохраняем
with open(r'D:\GitHub\CourtOktmo\data\no-oktmo.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nНайдено ОКТМО: {found}/{len(targets)}")
print(f"Осталось без ОКТМО: {len(data['courts']) - found}")

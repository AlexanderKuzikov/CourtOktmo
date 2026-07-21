import json, os, re, urllib.request, time

with open(r'D:\GitHub\CourtOktmo\data\unified-courts.json', 'r') as f:
    data = json.load(f)

# Читаем ключ
env_path = r'D:\GitHub\CourtHarvest2\.env'
env = open(env_path, 'r').read()
api_key = re.search(r'DADATA_API_KEY=(\w+)', env).group(1)

# СПб адреса без ОКТМО
codes = ['78AA0013','78MS0014','78MS0017','78MS0205','78UD0000']

for code in codes:
    c = next(x for x in data['courts'] if x['code'] == code)
    addr = c['address']
    
    req = urllib.request.Request(
        'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
        data=json.dumps({'query': addr, 'count': 1}).encode(),
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Token {api_key}',
        }
    )
    
    try:
        resp = json.loads(urllib.request.urlopen(req).read())
        if resp['suggestions'] and resp['suggestions'][0]['data']['oktmo']:
            c['oktmo'] = resp['suggestions'][0]['data']['oktmo']
            c['oktmo_method'] = 'dadata_clean'
            print(f"[{code}] {addr} → {c['oktmo']}")
        else:
            print(f"[{code}] {addr} → DaData не нашёл")
    except Exception as e:
        print(f"[{code}] Ошибка: {e}")
    
    time.sleep(0.3)

with open(r'D:\GitHub\CourtOktmo\data\unified-courts.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("\nСохранено")

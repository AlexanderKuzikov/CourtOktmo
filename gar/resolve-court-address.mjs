#!/usr/bin/env node
/**
 * resolve-court-address.mjs — определение ОКТМО для адресов судов по ГАР.
 *
 * Алгоритм (двухфазный):
 *   1. Поиск по населённому пункту (locality) — основной путь
 *   2. Если НП не найден — фоллбэк на поиск по улице+дому (старый алгоритм)
 *
 * Использование:
 *   node resolve-court-address.mjs <region> [courts.json] [data_dir] [gar_dir]
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const REGION   = process.argv[2];
const COURTS   = process.argv[3] || path.join('..', 'CourtHarvest2', 'data', 'courts.json');
const DATA_DIR = process.argv[4] || path.join('D:\\GitHub\\FIAS-parser', 'data');
const GAR_DIR  = process.argv[5] || 'C:\\gar_extracted';

if (!REGION) { console.error('Укажите регион'); process.exit(1); }

console.log(`\n🏛  Регион ${REGION}`);

// ── Маппинг кода суда → ГАР регион ──────────────────────
const garMapping = { '02': '04', '03': '02', '04': '03' };
const garRegion = garMapping[REGION] || REGION;
console.log(`   ГАР регион: ${garRegion}`);

// ── Загрузка данных ──────────────────────────────────────
const courts = JSON.parse(fs.readFileSync(COURTS, 'utf8')).courts;
const regionCourts = courts.filter(c => c.code.startsWith(REGION));
console.log(`   Судов региона: ${regionCourts.length}`);

// Загружаем addr-map: KEY → [{OBJECTID, OBJECTGUID, LEVEL, TYPE}]
console.log('   Загружаем addr-map...');
const addrMap = {};
let addrLines = 0;
const addrStream = readline.createInterface({
  input: fs.createReadStream(path.join(DATA_DIR, `addr-map-${garRegion}.ndjson`)),
  crlfDelay: Infinity,
});
for await (const line of addrStream) {
  const obj = JSON.parse(line);
  if (!addrMap[obj.KEY]) addrMap[obj.KEY] = [];
  addrMap[obj.KEY].push({ OBJECTID: obj.OBJECTID, OBJECTGUID: obj.OBJECTGUID, LEVEL: obj.LEVEL, TYPE: obj.TYPE });
  addrLines++;
}
console.log(`   addr-map: ${addrLines} записей, ${Object.keys(addrMap).length} ключей`);

// Загружаем mun-map: OBJECTID → {OKTMO, PATH, PARENTOBJID}
console.log('   Загружаем mun-map...');
const munMap = {};
let munLines = 0;
const munStream = readline.createInterface({
  input: fs.createReadStream(path.join(DATA_DIR, `mun-map-${garRegion}.ndjson`)),
  crlfDelay: Infinity,
});
for await (const line of munStream) {
  const obj = JSON.parse(line);
  munMap[obj.OBJECTID] = { PARENTOBJID: obj.PARENTOBJID, OKTMO: obj.OKTMO, PATH: obj.PATH, ISACTIVE: obj.ISACTIVE };
  munLines++;
}
console.log(`   mun-map: ${munLines} записей`);

// Загружаем houses-map
console.log('   Загружаем houses-map...');
const housesMap = {};
let housesLines = 0;
const housesStream = readline.createInterface({
  input: fs.createReadStream(path.join(DATA_DIR, `houses-map-${garRegion}.ndjson`)),
  crlfDelay: Infinity,
});
for await (const line of housesStream) {
  const obj = JSON.parse(line);
  housesMap[obj.OBJECTID] = { OBJECTGUID: obj.OBJECTGUID, HOUSENUM: obj.HOUSENUM };
  housesLines++;
}
console.log(`   houses-map: ${housesLines} домов`);

// Загружаем street-houses-map
console.log('   Загружаем street-houses-map...');
const streetHousesMap = {};
let streetLines = 0;
const streetStream = readline.createInterface({
  input: fs.createReadStream(path.join(DATA_DIR, `street-houses-map-${garRegion}.ndjson`)),
  crlfDelay: Infinity,
});
for await (const line of streetStream) {
  const obj = JSON.parse(line);
  streetHousesMap[obj.STREET_ID] = obj.HOUSES;
  streetLines++;
}
console.log(`   street-houses: ${streetLines} улиц`);

// guidToHouseId
const guidToHouseId = {};
for (const [houseObjectId, house] of Object.entries(housesMap)) {
  if (house.OBJECTGUID) guidToHouseId[house.OBJECTGUID] = houseObjectId;
}
console.log(`   guid→house: ${Object.keys(guidToHouseId).length}`);

// ── Типы и константы ─────────────────────────────────────
// Типы населённых пунктов (все известные)
const LOCALITY_TYPES = new Set([
  'г', 'гор', 'город', 'г.',
  'с', 'сел', 'село', 'с.',
  'п', 'пос', 'поселок', 'п.',
  'д', 'дер', 'деревня', 'д.',
  'аул', 'а.',
  'ст-ца', 'станица', 'ст.',
  'х', 'хутор', 'х.',
  'пгт', 'пгт.',
  'рп', 'рп.', 'р.п.',
  'гп', 'гп.',
  'кп', 'кп.',
  'сл', 'сл.', 'слобода',
  'мкр', 'мкр.',
  'ж/д ст.', 'ж/д_ст', 'пжд. ст.', 'п ж/д станции',
  'сп.', 'сп', 'с.п.',
  'м/о',
  'г.о.',
  'зaто',
]);

// Типы улиц
const STREET_TYPES = {
  'ул': 'ул', 'пр': 'пр-кт', 'пр-кт': 'пр-кт', 'просп': 'пр-кт', 'пр-т': 'пр-кт',
  'пер': 'пер', 'б-р': 'б-р', 'бул': 'б-р', 'бульв': 'б-р',
  'пл': 'пл', 'наб': 'наб', 'ш': 'ш', 'пр-д': 'пр-д',
  'туп': 'туп', 'тракт': 'тракт', 'аллея': 'аллея', 'мкр': 'мкр',
  'линия': 'линия', 'лн': 'лн', 'проезд': 'проезд', 'дор': 'дор',
  'км': 'км', 'спуск': 'спуск',
};
const STREET_TYPE_KEYS = new Set(Object.keys(STREET_TYPES));

// Префиксы домов (для фоллбэка)
const HOUSE_PREFIXES = new Set(['д', 'зд', 'стр', 'влд', 'соор', 'к', 'корп', 'литер']);

// ── НОРМАЛИЗАЦИЯ АДРЕСА ─────────────────────────────────

/**
 * Привести адрес к единому формату (CH2-стиль)
 */
function normalize(addr) {
  if (!addr) return addr;
  let a = addr;

  // 1. Сначала д.70→д 70 и д.132→д 132 (до общего удаления точек)
  a = a.replace(/д\.(\d+)/g, 'д $1');

  // 2. Удалить точки после известных префиксов
  const PREFIXES = ['г','ул','д','с','п','пр','пер','р-н','наб','ш','б-р','пл','обл','край',
    'респ','авт','пгт','гп','кп','сл','аллея','пр-кт','пр-д','зд','стр','влд','соор','к','корп',
    'литер','бульв','ал','бул','туп','тракт','мкр','лн','км','спуск','проезд','дор','тер','просп','пр-т'];
  for (const p of PREFIXES) {
    a = a.replace(new RegExp(`(?<!\\p{L})${p}\\.(?=\\s|,|$|\\d|[А-ЯЁ])`, 'gu'), p + ' ');
  }
  a = a.replace(/(?<!\p{L})ст\.(?=\s+[А-ЯЁ])/gu, 'ст-ца');
  a = a.replace(/(?<!\p{L})а\.(?=\s+[А-ЯЁ])/gu, 'аул');

  // 2. Регионы
  const regionDict = {
    'Удмуртская Республика': 'Респ Удмуртская',
    'Чеченская Республика': 'Респ Чеченская',
    'Чувашская Республика': 'Чувашская Республика - Чувашия',
    'Кабардино-Балкарская Республика': 'Респ Кабардино-Балкарская',
    'Карачаево-Черкесская Республика': 'Респ Карачаево-Черкесская',
    'Республика Северная Осетия - Алания': 'Респ Северная Осетия - Алания',
    'Ханты-Мансийский Автономный округ - Югра': 'Ханты-Мансийский АО',
    'Ханты-Мансийский автономный округ - Югра': 'Ханты-Мансийский АО',
    'Ямало-Ненецкий автономный округ': 'Ямало-Ненецкий АО',
    'Чукотский автономный округ': 'Чукотский АО',
    'Еврейская автономная область': 'Еврейская АО',
    'Кемеровская область - Кузбасс': 'Кемеровская обл',
    'Кемеровская обл - Кузбасс': 'Кемеровская обл',
  };
  for (const [oldName, newName] of Object.entries(regionDict)) {
    a = a.replace(oldName, newName);
  }
  a = a.replace(/(?<!\p{L})Республика\s+(?=[А-ЯЁ])/gu, 'Респ ');

  // 3. Префиксы домов (стр не трогаем — часто после д.)
  a = a.replace(/(?<!\p{L})(зд|соор|влд)\.?\s/gu, 'д ');

  // 4. Проспект
  a = a.replace(/(?<!\p{L})пр\.(?=\s+[А-ЯЁ])/gu, 'пр-кт');
  a = a.replace(/(?<!\p{L})проспект(?=\s)/gu, 'пр-кт');
  a = a.replace(/(?<!\p{L})пр-т\.?(?=\s)/gu, 'пр-кт');

  // 5. кв → к
  a = a.replace(/(?<!\p{L})кв\.?\s/gu, 'к ');

  // 6. Литера + регистр
  a = a.replace(/(д\s+\d+)\s+([А-ЯЁ])/g, '$1$2');
  a = a.replace(/(д\s+\d+)([а-я])/g, (_, num, letter) => num + letter.toUpperCase());

  // 7. Инициалы (убрать пробел после точки)
  a = a.replace(/(\.)\s+(?=[А-ЯЁ][а-яё])/g, '$1');

  a = a.replace(/\s+/g, ' ').trim();
  return a;
}

/**
 * Извлечь населённый пункт из адреса
 * Возвращает { type, name } или null
 */
function extractLocality(addr) {
  if (!addr) return null;
  // Убираем индекс и мусор
  let a = addr.replace(/^\d{3,6}\s*,?\s*/, '').trim();
  a = a.replace(/^[а-яё\s]+-\s+/, '').trim();  // "юридический - ..."
  const parts = a.split(',').map(s => s.trim()).filter(Boolean);

  // Сначала ищем по маркерным префиксам (приоритет — ближе к началу)
  // Нормализованные префиксы для поиска
  const localityPatterns = [
    // [regex для префикса, нормализованный type]
    [/^(г\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'г'],
    [/^(с\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'с'],
    [/^(п\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'п'],
    [/^(д\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'д'],
    [/^(аул)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'аул'],
    [/^(ст-ца)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'ст-ца'],
    [/^(х\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'х'],
    [/^(пгт\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'пгт'],
    [/^(рп\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'рп'],
    [/^(р\.п\.)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'рп'],
    [/^(мкр\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'мкр'],
    [/^(ж\/д ст\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(ж\/д_ст)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(пжд\. ст\.)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(п)\s+ж\/д\s+станции\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(сп\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'с'],
    [/^(с\.?)\s+п\.?\s+([А-ЯЁ][а-яё\-\d]+)/i, 'с'],
    [/^(с\.?)\s+[А-ЯЁ]\.\s+([А-ЯЁ][а-яё\-\d]+)/i, 'с'],
    [/^(м\/о)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(г\.о\.)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'г'],
    [/^(зaто)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(зaто)\s+[«"]?([А-ЯЁ][а-яё\-\d]+)[»"]?/i, 'п'],
    [/^зaто\s+г\.?\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(село)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'с'],
    [/^(г\.о)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    // Спецслучаи: Москва, СПб без префикса
  ];

  for (const part of parts) {
    if (!part) continue;
    for (const [regex, normType] of localityPatterns) {
      const m = part.match(regex);
      if (m) {
        const name = m[2].replace(/[^\d\w\-а-яёА-ЯЁ]/g, '').trim();
        if (name.length > 0) return { type: normType, name };
      }
    }
    // Специальные случаи
    const lp = part.toLowerCase().replace(/[.,\s]/g, '');
    if (lp === 'москва') return { type: 'г', name: 'Москва' };
    if (lp === 'санктпетербург') return { type: 'г', name: 'Санкт-Петербург' };
    if (lp === 'севастополь') return { type: 'г', name: 'Севастополь' };
  }

  return null;
}

/**
 * Найти ОКТМО по ОBJECTID (через mun-map, с подъёмом по PATH)
 */
function resolveOktmoByObjectId(objectid) {
  if (!objectid) return null;
  const mun = munMap[objectid];
  if (!mun) return null;
  if (mun.OKTMO && mun.OKTMO !== '0' && mun.OKTMO !== 'null') return mun.OKTMO;

  // Поднимаемся по PATH
  if (mun.PATH) {
    const pathParts = mun.PATH.split('.');
    // Идём от родителя к корню
    for (let i = pathParts.length - 2; i >= 0; i--) {
      const parentMun = munMap[pathParts[i]];
      if (parentMun && parentMun.OKTMO && parentMun.OKTMO !== '0' && parentMun.OKTMO !== 'null') {
        return parentMun.OKTMO;
      }
    }
  }

  // Фоллбэк на PARENTOBJID
  if (mun.PARENTOBJID && mun.PARENTOBJID !== '0') {
    return resolveOktmoByObjectId(mun.PARENTOBJID);
  }

  return null;
}

/**
 * Найти ОКТМО по населённому пункту
 */
function findOktmoByLocality(type, name) {
  // Маппинг сокращённых типов → полные (как в addr-map)
  const typeVariants = {
    'г': ['г', 'город','г.'],
    'с': ['с', 'село','с.','селение'],
    'п': ['п', 'поселок','пос','п.'],
    'д': ['д', 'деревня','д.'],
    'аул': ['аул'],
    'ст-ца': ['ст-ца','станица'],
    'х': ['х', 'хутор','х.'],
    'пгт': ['пгт','пгт.'],
    'рп': ['рп','р.п.','р.п'],
    'мкр': ['мкр','микрорайон'],
    'сл': ['сл','слобода'],
  };
  
  const variants = typeVariants[type] || [type];
  for (const t of variants) {
    const key = `${t}:${name}`;
    const candidates = addrMap[key];
    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        const oktmo = resolveOktmoByObjectId(candidate.OBJECTID);
        if (oktmo) return oktmo;
      }
    }
  }
  return null;
}

// ── ФОЛЛБЭК: старый поиск по улице+дому ─────────────────
function parseAddress(addr) {
  if (!addr) return null;
  addr = addr.split('/')[0];
  addr = addr.replace(/^\d{6},\s*/, '').trim();
  const parts = addr.split(',').map(s => s.trim());

  let houseNum = null, houseIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^(?:д|зд|стр)\s+(\S+)(?:\s+к\.?\s*\S+)?$/i);
    if (m) { houseNum = m[1].replace(/[,.]$/, ''); houseIdx = i; break; }
    const m2 = parts[i].match(/^(\d+[а-яёa-z]?)$/i);
    if (m2) { houseNum = m2[1]; houseIdx = i; break; }
  }
  if (!houseNum) return null;

  let streetType = null, streetName = null, streetIdx = -1;
  for (let i = houseIdx - 1; i >= 0; i--) {
    const m = parts[i].match(/^([а-яёa-z][а-яё\-]*\.?)\s+(.+)$/i);
    if (!m) continue;
    const rawType = m[1].replace(/\.$/, '').toLowerCase();
    if (!STREET_TYPE_KEYS.has(rawType)) continue;
    streetType = STREET_TYPES[rawType];
    streetName = m[2].trim();
    streetIdx = i;
    break;
  }
  if (!streetType) return null;

  let localityType = null, localityName = null;
  for (let i = streetIdx - 1; i >= 0; i--) {
    const m = parts[i].match(/^([а-яёa-z]+\.?)\s+(.+)$/i);
    if (!m) continue;
    const rawType = m[1].replace(/\.$/, '').toLowerCase();
    if (!LOCALITY_TYPES.has(rawType)) continue;
    localityType = rawType === 'пос' ? 'п' : rawType;
    localityName = m[2].trim();
    break;
  }
  return { streetType, streetName, houseNum, localityType, localityName };
}

function matchHouseInList(houses, houseNum) {
  let house = houses.find(h => h.HOUSENUM?.toLowerCase() === houseNum.toLowerCase());
  if (!house) {
    const numOnly = houseNum.replace(/[а-яёa-z]+$/i, '');
    if (numOnly !== houseNum)
      house = houses.find(h => h.HOUSENUM?.toLowerCase() === numOnly.toLowerCase());
  }
  return house ?? null;
}

function findHouse(streetType, streetName, houseNum, localityType, localityName) {
  const key = `${streetType}:${streetName}`;
  const allCandidates = addrMap[key] ?? [];
  if (allCandidates.length === 0) return null;

  let filteredCandidates = allCandidates;
  if (localityType && localityName) {
    const localityIds = new Set(
      (addrMap[`${localityType}:${localityName}`] ?? []).map(e => e.OBJECTID)
    );
    if (localityIds.size > 0) {
      const f = allCandidates.filter(street => {
        const munPath = munMap[street.OBJECTID]?.PATH ?? '';
        return [...localityIds].some(id => munPath.includes(id));
      });
      if (f.length > 0) filteredCandidates = f;
    }
  }

  for (const street of filteredCandidates) {
    const house = matchHouseInList(streetHousesMap[street.OBJECTID] ?? [], houseNum);
    if (house) return { objectguid: house.OBJECTGUID };
  }
  if (filteredCandidates !== allCandidates) {
    for (const street of allCandidates) {
      const house = matchHouseInList(streetHousesMap[street.OBJECTID] ?? [], houseNum);
      if (house) return { objectguid: house.OBJECTGUID };
    }
  }
  return null;
}

function getOktmo(objectguid) {
  const houseObjectId = guidToHouseId[objectguid];
  if (!houseObjectId) return null;
  return munMap[houseObjectId]?.OKTMO ?? null;
}

// ── Основной цикл ────────────────────────────────────────
console.log('\n   Обрабатываем...');
const results = [];
let foundLocality = 0;    // найдено через НП
let foundStreet = 0;      // найдено через улицу+дом (фоллбэк)
let notFound = 0;
let parseErr = 0;

for (let i = 0; i < regionCourts.length; i++) {
  const court = regionCourts[i];
  if (i % 20 === 0 || i === regionCourts.length - 1) {
    const pct = ((i + 1) / regionCourts.length * 100).toFixed(0);
    const totalFound = foundLocality + foundStreet;
    process.stdout.write(`\r   [${i + 1}/${regionCourts.length}] ${pct}% · НП: ${foundLocality} · ул: ${foundStreet} · ошибок: ${notFound + parseErr}`);
  }

  const addr = court.address;
  let oktmo = null;
  let objectguid = null;
  let status = 'not_found';
  let method = null;
  let localityFound = false;

  // Фаза 1: поиск по населённому пункту
  if (addr) {
    const normAddr = normalize(addr);
    const locality = extractLocality(normAddr);
    if (locality) {
      localityFound = true;
      oktmo = findOktmoByLocality(locality.type, locality.name);
      if (oktmo) {
        status = 'found_by_locality';
        method = 'locality';
        foundLocality++;
      }
    }

    // Фаза 2: фоллбэк на старый алгоритм (улица+дом)
    if (!oktmo) {
      const parsed = parseAddress(addr);
      if (parsed) {
        const match = findHouse(
          parsed.streetType, parsed.streetName, parsed.houseNum,
          parsed.localityType, parsed.localityName,
        );
        if (match) {
          oktmo = getOktmo(match.objectguid);
          objectguid = match.objectguid;
          if (oktmo) {
            status = 'found_by_street';
            method = 'street';
            foundStreet++;
          }
        }
      } else if (!localityFound) {
        // parseAddress не смог разобрать И locality не найден — настоящая parse_error
        status = 'parse_error';
        parseErr++;
      }
    }
  }

  if (!oktmo && status !== 'parse_error') {
    notFound++;
  }

  results.push({
    code: court.code,
    name: court.name,
    court_type: court.court_type,
    address: addr,
    oktmo,
    inn: court.inn,
    website: court.website,
    objectguid,
    method,  // 'locality' | 'street' | 'parse_error' | null
    status,
  });
}

console.log(`\n   Итог: НП=${foundLocality}, ул=${foundStreet}, не найдено=${notFound}, ошибок=${parseErr}`);

const outFile = path.join(DATA_DIR, `resolved-${REGION}.json`);
fs.writeFileSync(outFile, JSON.stringify(results));
console.log(`✅ ${outFile} (${results.length} записей)`);

// Итоговая статистика
const withOktmo = results.filter(r => r.oktmo).length;
console.log(`   С ОКТМО: ${withOktmo}/${results.length} (${(withOktmo / results.length * 100).toFixed(1)}%)`);

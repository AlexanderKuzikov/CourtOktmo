#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const REGION   = process.argv[2];
const COURTS   = process.argv[3] || path.join('..', 'CourtHarvest2', 'data', 'courts.json');
const DATA_DIR = process.argv[4] || path.join('D:\\GitHub\\FIAS-parser', 'data');
const GAR_DIR  = process.argv[5] || 'C:\\gar_extracted';

if (!REGION) { console.error('Укажите регион'); process.exit(1); }

console.log(`\n🏛  Регион ${REGION}`);

// ── Загрузка данных ──────────────────────────────────────
const courts = JSON.parse(fs.readFileSync(COURTS, 'utf8')).courts;
const regionCourts = courts.filter(c => c.code.startsWith(REGION));
console.log(`   Судов региона: ${regionCourts.length}`);

// Загружаем addr-map по NDJSON: KEY → [{OBJECTID, OBJECTGUID, LEVEL}]
console.log('   Загружаем addr-map...');
const addrMap = {};
let addrLines = 0;
const addrStream = readline.createInterface({
  input: fs.createReadStream(path.join(DATA_DIR, `addr-map-${REGION}.ndjson`)),
  crlfDelay: Infinity,
});
for await (const line of addrStream) {
  const obj = JSON.parse(line);
  if (!addrMap[obj.KEY]) addrMap[obj.KEY] = [];
  addrMap[obj.KEY].push({ OBJECTID: obj.OBJECTID, OBJECTGUID: obj.OBJECTGUID, LEVEL: obj.LEVEL });
  addrLines++;
}
console.log(`   addr-map: ${addrLines} записей, ${Object.keys(addrMap).length} ключей`);

// Загружаем mun-map
console.log('   Загружаем mun-map...');
const munMap = {};
let munLines = 0;
const munStream = readline.createInterface({
  input: fs.createReadStream(path.join(DATA_DIR, `mun-map-${REGION}.ndjson`)),
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
  input: fs.createReadStream(path.join(DATA_DIR, `houses-map-${REGION}.ndjson`)),
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
  input: fs.createReadStream(path.join(DATA_DIR, `street-houses-map-${REGION}.ndjson`)),
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
const STREET_TYPES = {
  'ул': 'ул', 'пр': 'пр-кт', 'пр-кт': 'пр-кт', 'просп': 'пр-кт',
  'пер': 'пер', 'б-р': 'б-р', 'бул': 'б-р', 'бульв': 'б-р',
  'пл': 'пл', 'наб': 'наб', 'ш': 'ш', 'пр-д': 'пр-д',
  'туп': 'туп', 'тракт': 'тракт', 'аллея': 'аллея', 'мкр': 'мкр',
  'линия': 'линия', 'лн': 'лн', 'проезд': 'проезд', 'дор': 'дор',
  'км': 'км', 'спуск': 'спуск',
};
const LOCALITY_TYPES = new Set(['г', 'п', 'с', 'д', 'пос', 'рп', 'пгт', 'гп']);
const STREET_TYPE_KEYS = new Set(Object.keys(STREET_TYPES));

// ── Парсинг адреса ───────────────────────────────────────
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
        const path = munMap[street.OBJECTID]?.PATH ?? '';
        return [...localityIds].some(id => path.includes(id));
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
let found = 0, notFound = 0, parseErr = 0;

for (let i = 0; i < regionCourts.length; i++) {
  const court = regionCourts[i];
  if (i % 20 === 0 || i === regionCourts.length - 1) {
    const pct = ((i + 1) / regionCourts.length * 100).toFixed(0);
    process.stdout.write(`\r   [${i + 1}/${regionCourts.length}] ${pct}% · найдено: ${found} · ошибок: ${notFound + parseErr}`);
  }

  const parsed = parseAddress(court.address);
  if (!parsed) {
    results.push({
      code: court.code, name: court.name, court_type: court.court_type,
      address: court.address, oktmo: null, inn: court.inn, website: court.website,
      objectguid: null, status: 'parse_error',
    });
    parseErr++;
    continue;
  }

  const match = findHouse(
    parsed.streetType, parsed.streetName, parsed.houseNum,
    parsed.localityType, parsed.localityName,
  );

  if (match) found++;
  else notFound++;

  results.push({
    code: court.code,
    name: court.name,
    court_type: court.court_type,
    address: court.address,
    oktmo: match ? getOktmo(match.objectguid) : null,
    inn: court.inn,
    website: court.website,
    objectguid: match?.objectguid ?? null,
    status: match ? 'found' : 'not_found',
  });
}

console.log(`\n   Итог: найдено ${found}, не найдено ${notFound}, ошибок парсинга ${parseErr}`);

const outFile = path.join(DATA_DIR, `resolved-${REGION}.json`);
fs.writeFileSync(outFile, JSON.stringify(results));
console.log(`✅ ${outFile} (${results.length} записей)`);

const failed = results.filter(r => r.status !== 'found');
if (failed.length > 0 && failed.length <= 10) {
  console.log('\n--- Не найдено ---');
  failed.forEach(r => console.log(`  [${r.status.padEnd(11)}] ${r.address}`));
} else if (failed.length > 10) {
  console.log(`   Не найдено: ${failed.length} (вывод подавлен)`);
}

#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const DATA_DIR = process.argv[2] || 'D:\\GitHub\\FIAS-parser\\data';
const REGION = process.argv[3];
if (!REGION) { console.error('Укажите регион'); process.exit(1); }

console.log(`📦 Регион ${REGION}`);

// Собираем mun-map INDEX: OBJECTID → { PARENTOBJID, OKTMO, PATH }
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
console.log(`  mun-map: ${munLines} записей`);

// Собираем houses-map OBJECTID → { OBJECTGUID, HOUSENUM }
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
console.log(`  houses-map: ${housesLines} домов`);

// Строим street-houses-map
const streetHousesMap = {};
let linked = 0, skipped = 0, i = 0;

for (const [houseObjectId, house] of Object.entries(housesMap)) {
  i++;
  if (i % 200000 === 0) process.stdout.write(`\r  обработано: ${i}...`);

  const mun = munMap[houseObjectId];
  if (!mun?.PATH) { skipped++; continue; }

  const pathParts = mun.PATH.split('.');
  if (pathParts.length < 2) { skipped++; continue; }

  let streetObjectId = pathParts[pathParts.length - 2];
  if (housesMap[streetObjectId] && pathParts.length >= 3) {
    streetObjectId = pathParts[pathParts.length - 3];
  }

  if (!streetHousesMap[streetObjectId]) streetHousesMap[streetObjectId] = [];
  streetHousesMap[streetObjectId].push({
    houseObjectId,
    OBJECTGUID: house.OBJECTGUID,
    HOUSENUM: house.HOUSENUM,
  });
  linked++;
}

// Пишем ndjson
const outFile = path.join(DATA_DIR, `street-houses-map-${REGION}.ndjson`);
const outStream = fs.createWriteStream(outFile);

for (const [streetId, houses] of Object.entries(streetHousesMap)) {
  outStream.write(JSON.stringify({ STREET_ID: streetId, HOUSES: houses }) + '\n');
}
outStream.end();

console.log(`\n✅ ${outFile}`);
console.log(`   Привязано: ${linked}, пропущено: ${skipped}, улиц: ${Object.keys(streetHousesMap).length}`);

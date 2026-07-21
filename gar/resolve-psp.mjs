#!/usr/bin/env node
/**
 * resolve-psp.mjs — расчёт ОКТМО для ПСП-адресов.
 * Использует ту же логику, что resolve-court-address.mjs.
 *
 * Использование: node resolve-psp.mjs <psp.json> <data_dir> <gar_dir>
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const PSP_FILE = process.argv[2] || 'exp/psp-addresses.json';
const DATA_DIR = process.argv[3] || 'data';
const GAR_DIR  = process.argv[4] || 'D:/gar_extracted';

const garMapping = { '02': '04', '03': '02', '04': '03' };

// ── Загружаем ПСП ────────────────────────────────────────
const pspData = JSON.parse(fs.readFileSync(PSP_FILE, 'utf8'));
const records = pspData.records;

// Группируем по регионам
const byRegion = {};
for (const r of records) {
  const region = r.code.slice(0, 2);
  if (!byRegion[region]) byRegion[region] = [];
  for (let i = 0; i < r.psp_count; i++) {
    byRegion[region].push({
      code: r.code,
      psp_idx: i,
      address: r[`psp_address_${i}`],
      phone: r[`psp_phone_${i}`] || '',
    });
  }
}

console.log(`ПСП-записей: ${pspData.count}, адресов: ${records.reduce((s,r) => s + r.psp_count, 0)}`);
console.log(`Регионов: ${Object.keys(byRegion).length}\n`);

// ── Функции из resolve-court-address.mjs ─────────────────
function normalize(addr) {
  if (!addr) return addr;
  let a = addr;
  const PREFIXES = ['г','ул','д','с','п','пр','пер','р-н','наб','ш','б-р','пл','обл','край',
    'респ','авт','пгт','гп','кп','сл','аллея','пр-кт','пр-д','зд','стр','влд','соор','к','корп',
    'литер','бульв','ал','бул','туп','тракт','мкр','лн','км','спуск','проезд','дор','тер','просп','пр-т'];
  for (const p of PREFIXES) {
    a = a.replace(new RegExp(`(?<!\\p{L})${p}\\.(?=\\s|,|$|\\d)`, 'gu'), p);
  }
  a = a.replace(/(?<!\p{L})ст\.(?=\s+[А-ЯЁ])/gu, 'ст-ца');
  a = a.replace(/(?<!\p{L})а\.(?=\s+[А-ЯЁ])/gu, 'аул');
  a = a.replace(/д\.(\d+)/g, 'д $1');
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
  for (const [oldName, newName] of Object.entries(regionDict)) a = a.replace(oldName, newName);
  a = a.replace(/(?<!\p{L})Республика\s+(?=[А-ЯЁ])/gu, 'Респ ');
  a = a.replace(/(?<!\p{L})(зд|соор|влд)\.?\s/gu, 'д ');
  a = a.replace(/(?<!\p{L})пр\.(?=\s+[А-ЯЁ])/gu, 'пр-кт');
  a = a.replace(/(?<!\p{L})проспект(?=\s)/gu, 'пр-кт');
  a = a.replace(/(?<!\p{L})пр-т\.?(?=\s)/gu, 'пр-кт');
  a = a.replace(/(?<!\p{L})кв\.?\s/gu, 'к ');
  a = a.replace(/(д\s+\d+)\s+([А-ЯЁ])/g, '$1$2');
  a = a.replace(/(д\s+\d+)([а-я])/g, (_, num, letter) => num + letter.toUpperCase());
  a = a.replace(/(\.)\s+(?=[А-ЯЁ][а-яё])/g, '$1');
  a = a.replace(/\s+/g, ' ').trim();
  return a;
}

function extractLocality(addr) {
  if (!addr) return null;
  let a = addr.replace(/^\d{3,6}\s*,?\s*/, '').trim();
  const parts = a.split(',').map(s => s.trim()).filter(Boolean);
  const patterns = [
    [/^(г\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'г'],
    [/^(с\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'с'],
    [/^(п\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'п'],
    [/^(д\.?)\s+([А-ЯЁ][а-яё\-\d]+)/, 'д'],
    [/^(аул)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'аул'],
    [/^(ст-ца)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'ст-ца'],
    [/^(х\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'х'],
    [/^(пгт\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'пгт'],
    [/^(рп\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'рп'],
    [/^(ж\/д ст\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
    [/^(сп\.?)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'с'],
    [/^(м\/о)\s+([А-ЯЁ][а-яё\-\d]+)/i, 'п'],
  ];
  for (const part of parts) {
    if (!part) continue;
    for (const [regex, normType] of patterns) {
      const m = part.match(regex);
      if (m) { const n = m[2].replace(/[^\d\w\-а-яёА-ЯЁ]/g, '').trim(); if (n.length > 0) return { type: normType, name: n }; }
    }
  }
  return null;
}

function findOktmo(addrMap, munMap, type, name) {
  const typeVariants = { 'г': ['г','город'], 'с': ['с','село'], 'п': ['п','поселок','пос'], 'д': ['д','деревня'], 'аул': ['аул'], 'ст-ца': ['ст-ца','станица'], 'х': ['х','хутор'], 'пгт': ['пгт'], 'рп': ['рп','р.п.'], 'мкр': ['мкр','микрорайон'] };
  const variants = typeVariants[type] || [type];
  for (const t of variants) {
    const key = `${t}:${name}`;
    const cands = addrMap[key];
    if (cands && cands.length > 0) {
      for (const c of cands) {
        const mun = munMap[c.OBJECTID];
        if (!mun) continue;
        if (mun.OKTMO && mun.OKTMO !== '0' && mun.OKTMO !== 'null') return mun.OKTMO;
        if (mun.PATH) {
          const pp = mun.PATH.split('.');
          for (let j = pp.length - 2; j >= 0; j--) {
            const pm = munMap[pp[j]];
            if (pm && pm.OKTMO && pm.OKTMO !== '0' && pm.OKTMO !== 'null') return pm.OKTMO;
          }
        }
      }
    }
  }
  return null;
}

// ── Основной цикл по регионам ────────────────────────────
const allResults = [];
let totalOktmo = 0;

for (const [region, pspList] of Object.entries(byRegion)) {
  const garRegion = garMapping[region] || region;
  const addrMapFile = path.join(DATA_DIR, `addr-map-${garRegion}.ndjson`);
  const munMapFile  = path.join(DATA_DIR, `mun-map-${garRegion}.ndjson`);

  if (!fs.existsSync(addrMapFile) || !fs.existsSync(munMapFile)) {
    console.log(`⚠️  ${region}: нет карт (ГАР ${garRegion}), пропускаем ${pspList.length} ПСП`);
    for (const p of pspList) allResults.push({ ...p, oktmo: null, method: 'no_data' });
    continue;
  }

  console.log(`📦 ${region}: загружаем ГАР ${garRegion}...`);

  // Загружаем addr-map
  const addrMap = {};
  const aStream = readline.createInterface({ input: fs.createReadStream(addrMapFile), crlfDelay: Infinity });
  for await (const line of aStream) {
    const obj = JSON.parse(line);
    if (!addrMap[obj.KEY]) addrMap[obj.KEY] = [];
    addrMap[obj.KEY].push({ OBJECTID: obj.OBJECTID, LEVEL: obj.LEVEL });
  }

  // Загружаем mun-map (только OBJECTID→OKTMO,PATH)
  const munMap = {};
  const mStream = readline.createInterface({ input: fs.createReadStream(munMapFile), crlfDelay: Infinity });
  for await (const line of mStream) {
    const obj = JSON.parse(line);
    munMap[obj.OBJECTID] = { OKTMO: obj.OKTMO, PATH: obj.PATH };
  }

  console.log(`   addr: ${Object.keys(addrMap).length}, mun: ${Object.keys(munMap).length}`);

  // Resolve
  let ok = 0;
  for (const p of pspList) {
    const normAddr = normalize(p.address);
    const loc = extractLocality(normAddr);
    let oktmo = null;
    let method = null;
    if (loc) {
      oktmo = findOktmo(addrMap, munMap, loc.type, loc.name);
      if (oktmo) method = 'locality';
    }
    if (oktmo) ok++;
    allResults.push({ ...p, oktmo, method, locality: loc });
  }
  totalOktmo += ok;
  console.log(`   ПСП: ${pspList.length}, с ОКТМО: ${ok} (${(ok/pspList.length*100).toFixed(0)}%)`);
}

console.log(`\n✅ ИТОГО: ${allResults.length} ПСП, с ОКТМО: ${totalOktmo} (${(totalOktmo/allResults.length*100).toFixed(1)}%)`);

// ── Сохраняем ────────────────────────────────────────────
const outFile = path.join('data', 'resolved-psp.json');
fs.writeFileSync(outFile, JSON.stringify({
  total: allResults.length,
  withOktmo: totalOktmo,
  results: allResults,
}, null, 2));
console.log(`✅ ${outFile}`);

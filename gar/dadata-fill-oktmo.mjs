#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNIFIED_FILE = path.join(__dirname, '..', 'data', 'unified-courts.json');
const ENV_FILE = path.join(__dirname, '..', '..', 'CourtHarvest2', '.env');

const env = readFileSync(ENV_FILE, 'utf8');
const apiKey = env.match(/DADATA_API_KEY=(\w+)/)?.[1];
const secretKey = env.match(/DADATA_SECRET_KEY=(\w+)/)?.[1];

const unified = JSON.parse(readFileSync(UNIFIED_FILE, 'utf8'));
const courts = unified.courts;

const needDadata = courts.filter(c => !c.oktmo && c.address);
console.log(`Нуждаются в DaData: ${needDadata.length}`);

let done = 0, found = 0, notFound = 0, errors = 0;

for (const c of needDadata) {
  await new Promise(r => setTimeout(r, 250)); // 4 запроса/с
  
  try {
    const resp = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Token ${apiKey}` },
      body: JSON.stringify({ query: c.address, count: 1 }),
    });
    
    if (!resp.ok) { errors++; continue; }
    
    const data = await resp.json();
    if (data.suggestions?.[0]?.data?.oktmo) {
      c.oktmo = data.suggestions[0].data.oktmo;
      c.oktmo_method = 'dadata';
      found++;
    } else {
      notFound++;
    }
  } catch (e) {
    errors++;
  }
  
  done++;
  if (done % 50 === 0) {
    process.stdout.write(`\r  ${done}/${needDadata.length}: найдено ${found}, нет ${notFound}, ошибок ${errors}`);
  }
}

console.log(`\n\nГотово. Из ${needDadata.length}:`);
console.log(`  Найдено ОКТМО:    ${found}`);
console.log(`  Не найдено:       ${notFound}`);
console.log(`  Ошибок запроса:   ${errors}`);

// Итоговая статистика
const withOktmo = courts.filter(c => c.oktmo).length;
console.log(`\nПосле DaData:`);
console.log(`  С ОКТМО: ${withOktmo}/${courts.length} (${(withOktmo/courts.length*100).toFixed(1)}%)`);

writeFileSync(UNIFIED_FILE, JSON.stringify(unified, null, 2));
console.log(`\n✅ ${UNIFIED_FILE} обновлён`);

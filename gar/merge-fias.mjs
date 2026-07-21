#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const UNIFIED = 'data/unified-courts.json';
const NO_OKTMO = 'data/no-oktmo.json';

const unified = JSON.parse(readFileSync(UNIFIED, 'utf8'));
const no_oktmo = JSON.parse(readFileSync(NO_OKTMO, 'utf8'));

const unifiedMap = {};
for (const c of unified.courts) unifiedMap[c.code] = c;

let updated = 0;
for (const c of no_oktmo.courts) {
  // Переносим ОКТМО из ФИАС
  if (c.oktmo_fias && unifiedMap[c.code]) {
    unifiedMap[c.code].oktmo = c.oktmo_fias;
    unifiedMap[c.code].oktmo_method = 'fias';
    updated++;
  }
  // Переносим ручные ОКТМО
  if (c.oktmo && !c.oktmo_fias && unifiedMap[c.code]) {
    unifiedMap[c.code].oktmo = c.oktmo;
    unifiedMap[c.code].oktmo_method = 'manual';
    updated++;
  }
  // Переносим адреса
  if (c.address && unifiedMap[c.code] && !unifiedMap[c.code].address) {
    unifiedMap[c.code].address = c.address;
  }
}

const withOktmo = unified.courts.filter(c => c.oktmo).length;
console.log(`Обновлено: ${updated} записей`);
console.log(`С ОКТМО: ${withOktmo}/${unified.count} (${(withOktmo/unified.count*100).toFixed(1)}%)`);

writeFileSync(UNIFIED, JSON.stringify(unified, null, 2));

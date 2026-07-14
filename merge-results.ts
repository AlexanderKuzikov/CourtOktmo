#!/usr/bin/env node
/**
 * Скрипт для слияния результатов party и address прогонов.
 * 
 * party:  prefix-файлы с okmo/okato/okpo для 229 судов с ИНН
 * address: prefix-файлы с okmo/okato для ~10 000 судов
 * 
 * Результат: объединённые prefix-файлы, где:
 * - Для судов с ИНН: okmo/okato/okpo из party (если есть), иначе из address
 * - Для судов без ИНН: okmo/okato из address
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const PARTY_DIR = join(process.cwd(), 'data', 'prefixes_party');
const ADDR_DIR = join(process.cwd(), 'data', 'prefixes_address');
const OUTPUT_DIR = join(process.cwd(), 'data', 'prefixes');

interface CourtRecord {
  code: string;
  okmo?: string | null;
  okato?: string | null;
  okpo?: string | null;
  inn?: string | null;
  [key: string]: unknown;
}

function main() {
  console.log('🔀 Слияние party + address результатов\n');

  // Собираем все префиксы из обеих директорий
  const partyFiles = existsSync(PARTY_DIR) ? readdirSync(PARTY_DIR).filter(f => f.endsWith('.json')) : [];
  const addrFiles = existsSync(ADDR_DIR) ? readdirSync(ADDR_DIR).filter(f => f.endsWith('.json')) : [];

  const allPrefixes = new Set([...partyFiles, ...addrFiles]);
  console.log(`  Party файлов:   ${partyFiles.length}`);
  console.log(`  Address файлов: ${addrFiles.length}`);
  console.log(`  Всего префиксов: ${allPrefixes.size}\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalMerged = 0;
  let totalPartyOkmo = 0;
  let totalAddrOkmo = 0;

  for (const file of allPrefixes) {
    const prefix = file.replace('.json', '');

    // Читаем party данные (ИНН, okpo)
    let partyData: Map<string, CourtRecord> = new Map();
    if (partyFiles.includes(file)) {
      const data = JSON.parse(readFileSync(join(PARTY_DIR, file), 'utf-8')) as CourtRecord[];
      for (const r of data) {
        if (r.code) partyData.set(r.code, r);
      }
    }

    // Читаем address данные (address, okmo, okato)
    let addrData: Map<string, CourtRecord> = new Map();
    if (addrFiles.includes(file)) {
      const data = JSON.parse(readFileSync(join(ADDR_DIR, file), 'utf-8')) as CourtRecord[];
      for (const r of data) {
        if (r.code) addrData.set(r.code, r);
      }
    }

    // Сливаем: берём все коды из обоих наборов
    const allCodes = new Set([...partyData.keys(), ...addrData.keys()]);
    const merged: CourtRecord[] = [];

    for (const code of allCodes) {
      const party = partyData.get(code);
      const addr = addrData.get(code);

      // Берём максимум данных из обоих источников
      const base = { ...(addr || party) };

      // Приоритет: okmo/okato из party (точнее), okpo только из party
      if (party) {
        if (party.okmo) {
          base.okmo = party.okmo;
          totalPartyOkmo++;
        }
        if (party.okato) base.okato = party.okato;
        if (party.okpo) base.okpo = party.okpo;
      } else if (addr?.okmo) {
        totalAddrOkmo++;
      }

      // Если okmo нет ниоткуда — оставляем null
      if (!base.okmo && addr?.okmo) base.okmo = addr.okmo;
      if (!base.okato && addr?.okato) base.okato = addr.okato;

      merged.push(base);
    }

    // Сортируем по коду
    merged.sort((a, b) => a.code.localeCompare(b.code));
    writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(merged, null, 2), 'utf-8');
    totalMerged += merged.length;
  }

  console.log(`📊 Результаты слияния:`);
  console.log(`  Всего записей:   ${totalMerged}`);
  console.log(`  С ОКТМО (party): ${totalPartyOkmo}`);
  console.log(`  С ОКТМО (addr):  ${totalAddrOkmo}`);
  console.log(`  Без ОКТМО:       ${totalMerged - totalPartyOkmo - totalAddrOkmo}`);
  console.log(`\n✅ Результат: ${OUTPUT_DIR}`);
}

main();

#!/usr/bin/env node
/**
 * Извлечение файлов ГАР из zip-архива.
 * 
 * Использование:
 *   node extract-gar.mjs <путь_к_zip> [директория_назначения] [типы_файлов]
 * 
 * Пример:
 *   node extract-gar.mjs D:\Downloads\gar_xml.zip C:\gar_extracted
 *   node extract-gar.mjs D:\Downloads\gar_xml.zip C:\gar_extracted "AS_ADDR_OBJ,AS_HOUSES,AS_MUN_HIERARCHY"
 */

import yauzl from 'yauzl';
import { mkdirSync, createWriteStream, existsSync } from 'fs';
import { dirname, join, basename } from 'path';

const ZIP_PATH   = process.argv[2] || 'D:\\GitHub\\gar_xml.zip';
const OUT_DIR    = process.argv[3] || 'C:\\gar_extracted';
const NEEDED_RAW = process.argv[4] || 'AS_ADDR_OBJ,AS_HOUSES,AS_MUN_HIERARCHY';

const NEEDED_PREFIXES = NEEDED_RAW.split(',').map(s => s.trim());

if (!existsSync(ZIP_PATH)) {
  console.error(`❌ Файл не найден: ${ZIP_PATH}`);
  process.exit(1);
}

console.log(`📦 Архив: ${ZIP_PATH}`);
console.log(`📂 Назначение: ${OUT_DIR}`);
console.log(`🔍 Типы файлов: ${NEEDED_PREFIXES.join(', ')}`);
console.log();

yauzl.open(ZIP_PATH, { lazyEntries: true }, (err, zip) => {
  if (err) { console.error('❌ Ошибка открытия zip:', err); process.exit(1); }

  let extracted = 0;
  let skipped   = 0;
  let lastPct   = 0;

  zip.readEntry();

  zip.on('entry', (entry) => {
    const name = entry.fileName.replace(/\//g, '\\');

    // Проверяем, относится ли файл к нужным типам
    const matches = NEEDED_PREFIXES.some(prefix => name.includes(prefix));

    if (!matches) {
      skipped++;
      zip.readEntry();
      return;
    }

    const outPath = join(OUT_DIR, name);
    mkdirSync(dirname(outPath), { recursive: true });

    zip.openReadStream(entry, (err, stream) => {
      if (err) { console.error('❌ Ошибка чтения:', entry.fileName); zip.readEntry(); return; }
      const out = createWriteStream(outPath);
      stream.pipe(out);
      out.on('finish', () => {
        extracted++;
        // Прогресс только каждые 100 файлов
        if (extracted % 100 === 0 || extracted <= 5) {
          const pct = zip.entryCount ? ((zip._entryCount - skipped - extracted) / zip._entryCount * 100).toFixed(0) : '?';
          process.stdout.write(`\r📦 Извлечено: ${extracted}  Пропущено: ${skipped}  ${basename(name).slice(0, 50)}`);
        }
        zip.readEntry();
      });
    });
  });

  zip.on('end', () => {
    console.log(`\n✅ Готово. Извлечено: ${extracted} файлов в ${OUT_DIR}`);
  });
});

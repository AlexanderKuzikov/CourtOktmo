#!/usr/bin/env node
/**
 * Построить mun-map для региона в NDJSON формате (одна запись на строку).
 * Использование: node build-mun-map.mjs <gar_dir> <output_dir> <region>
 */
import fs from 'fs';
import path from 'path';
import sax from 'sax';

const GAR_DIR = process.argv[2] || 'C:\\gar_extracted';
const OUT_DIR = process.argv[3] || 'D:\\GitHub\\FIAS-parser\\data';
const REGION = process.argv[4];
if (!REGION) { console.error('Укажите регион'); process.exit(1); }

const regionDir = path.join(GAR_DIR, REGION);
if (!fs.existsSync(regionDir)) { console.error(`❌ ${regionDir}`); process.exit(1); }

const files = fs.readdirSync(regionDir).filter(f => f.startsWith('AS_MUN_HIERARCHY_') && f.endsWith('.XML'));
if (files.length === 0) { console.error(`❌ Нет AS_MUN_HIERARCHY для региона ${REGION}`); process.exit(1); }

const file = path.join(regionDir, files[0]);
console.log(`Читаем: ${file}`);

const outFile = path.join(OUT_DIR, `mun-map-${REGION}.ndjson`);
const stream = fs.createWriteStream(outFile);
let total = 0;
let written = 0;

// Собираем статистику
let withOktmo = 0;
const seenIds = new Set();

const parser = sax.createStream(true, { trim: true });

parser.on('opentag', node => {
  if (node.name !== 'ITEM') return;
  total++;

  const { OBJECTID, PARENTOBJID, OKTMO, PATH, ISACTIVE } = node.attributes;

  // Для дубликатов: предпочитаем ISACTIVE=1
  if (seenIds.has(OBJECTID)) return;
  
  const record = {
    OBJECTID,
    PARENTOBJID: PARENTOBJID || null,
    OKTMO: OKTMO || null,
    PATH: PATH || '',
    ISACTIVE: ISACTIVE || '0',
  };

  seenIds.add(OBJECTID);
  stream.write(JSON.stringify(record) + '\n');
  written++;
  if (OKTMO && OKTMO !== '0') withOktmo++;
});

parser.on('end', () => {
  stream.end();
  console.log(`✅ ${outFile}`);
  console.log(`   Всего: ${total}, записано: ${written}, с ОКТМО: ${withOktmo}`);
});

parser.on('error', err => console.error('Parser error:', err));
fs.createReadStream(file).pipe(parser);

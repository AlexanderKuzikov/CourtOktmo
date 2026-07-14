#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import sax from 'sax';

const GAR_DIR = process.argv[2] || 'C:\\gar_extracted';
const OUT_DIR = process.argv[3] || 'D:\\GitHub\\FIAS-parser\\data';
const REGION = process.argv[4];
if (!REGION) { console.error('Укажите регион'); process.exit(1); }

const regionDir = path.join(GAR_DIR, REGION);
if (!fs.existsSync(regionDir)) { console.error(`❌ ${regionDir}`); process.exit(1); }

const files = fs.readdirSync(regionDir).filter(f => f.startsWith('AS_HOUSES_') && f.endsWith('.XML'));
if (files.length === 0) { console.error(`❌ Нет AS_HOUSES для региона ${REGION}`); process.exit(1); }

const file = path.join(regionDir, files[0]);
console.log(`Читаем: ${file}`);

const outFile = path.join(OUT_DIR, `houses-map-${REGION}.ndjson`);
const stream = fs.createWriteStream(outFile);
let total = 0, kept = 0;

const parser = sax.createStream(true, { trim: true });

parser.on('opentag', node => {
  if (node.name !== 'HOUSE') return;
  total++;
  if (total % 200000 === 0) console.log(`  обработано: ${total}`);

  const { OBJECTID, OBJECTGUID, HOUSENUM, ISACTIVE, ISACTUAL } = node.attributes;
  if (ISACTIVE !== '1' || ISACTUAL !== '1') return;
  if (!HOUSENUM) return;

  stream.write(JSON.stringify({ OBJECTID, OBJECTGUID, HOUSENUM }) + '\n');
  kept++;
});

parser.on('end', () => {
  stream.end();
  console.log(`✅ ${outFile}`);
  console.log(`   Всего: ${total}, сохранено: ${kept}`);
});

parser.on('error', err => console.error('Parser error:', err));
fs.createReadStream(file).pipe(parser);

#!/usr/bin/env node
/**
 * Массовый прогон сбора ОКТМО через ГАР для всех регионов.
 * 
 * Использование:
 *   node run-all-regions.mjs [courts.json] [data_dir] [gar_dir] [--skip-build]
 * 
 * Этапы:
 *   1. Определить какие регионы есть в данных судов
 *   2. Для каждого: build-addr-map → build-mun-map → build-houses-map → build-street-houses-map
 *   3. resolve-court-address для каждого региона
 *   4. Сборка единого resolved.json
 * 
 * --skip-build: пропустить этап сборки карт (использовать существующие)
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CWD = process.cwd();

const COURTS   = process.argv[2] || join('..', 'CourtHarvest2', 'data', 'courts.json');
const DATA_DIR = process.argv[3] || join(CWD, 'data');
const GAR_DIR  = process.argv[4] || 'D:\\gar_extracted';
const SKIP_BUILD = process.argv.includes('--skip-build');

// 1. Определяем список регионов из courts.json
console.log('🔍 Определяем список регионов...');
const courts = JSON.parse(readFileSync(COURTS, 'utf8')).courts;
const regions = new Set();
for (const c of courts) {
  if (c.code && c.code.length >= 2) regions.add(c.code.slice(0, 2));
}
const sortedRegions = [...regions].sort();
console.log(`   Регионов: ${sortedRegions.length}`);
console.log(`   Всего судов: ${courts.length}`);
console.log(`   Регионы: ${sortedRegions.join(', ')}`);

// 2. Проверяем gar_dir
if (!existsSync(GAR_DIR)) {
  console.error(`❌ GAR_DIR не найден: ${GAR_DIR}`);
  process.exit(1);
}

// 3. Проходим по каждому региону
let built = 0;
const allResolved = [];

console.log(`\n🚀 Старт массового прогона (skip_build=${SKIP_BUILD})\n`);

/** Запустить node-скрипт с аргументами, вернуть stdout */
function runScript(scriptName, args) {
  const scriptPath = join(__dirname, scriptName);
  if (!existsSync(scriptPath)) {
    return { ok: false, error: `Скрипт не найден: ${scriptPath}` };
  }
  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', scriptPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 1800000,  // 30 минут
    cwd: CWD,
  });
  if (result.status === 0) {
    return { ok: true, stdout: result.stdout?.toString() || '' };
  }
  const stderr = result.stderr?.toString().slice(0, 200) || `exit code ${result.status}`;
  return { ok: false, error: stderr };
}

for (const region of sortedRegions) {
  const regionDir = join(GAR_DIR, region);
  if (!existsSync(regionDir)) {
    console.log(`⚠️  ${region}: нет данных ГАР, пропускаем`);
    continue;
  }

  console.log(`\n═══════════════════════════════════`);
  console.log(`🏛  Регион ${region}`);
  console.log(`═══════════════════════════════════`);

  // Если resolved уже есть — пропускаем
  const resolvedFile = join(DATA_DIR, `resolved-${region}.json`);
  if (existsSync(resolvedFile)) {
    const existing = JSON.parse(readFileSync(resolvedFile, 'utf8'));
    const withOktmo = existing.filter(r => r.oktmo).length;
    console.log(`   ✅ Уже собран: ${existing.length} судов, ${withOktmo} с ОКТМО`);
    allResolved.push(...existing);
    built++;
    continue;
  }

  const garArgs = [GAR_DIR, DATA_DIR, region];

  // Этап сборки карт
  if (!SKIP_BUILD) {
    const buildScripts = [
      ['build-addr-map.mjs', garArgs],
      ['build-mun-map.mjs', garArgs],
      ['build-houses-map.mjs', garArgs],
    ];

    for (const [scriptName, scriptArgs] of buildScripts) {
      const baseOut = scriptName.replace('build-', '').replace('.mjs', '');
      const outFile = join(DATA_DIR, `${baseOut}-${region}.json`);
      if (existsSync(outFile)) {
        process.stdout.write(`   ⏭  ${scriptName}: уже есть\n`);
        continue;
      }
      process.stdout.write(`   🔨 ${scriptName}...`);
      const result = runScript(scriptName, scriptArgs);
      if (result.ok) {
        process.stdout.write(` ✅\n`);
      } else {
        process.stdout.write(` ❌ ${result.error}\n`);
        // Продолжаем со следующими скриптами
      }
    }

    // street-houses-map — другие аргументы
    const streetFile = join(DATA_DIR, `street-houses-map-${region}.json`);
    if (!existsSync(streetFile)) {
      process.stdout.write(`   🔨 build-street-houses-map.mjs...`);
      const result = runScript('build-street-houses-map.mjs', [DATA_DIR, region]);
      if (result.ok) {
        process.stdout.write(` ✅\n`);
      } else {
        process.stdout.write(` ❌ ${result.error}\n`);
      }
    } else {
      process.stdout.write(`   ⏭  build-street-houses-map.mjs: уже есть\n`);
    }
  }

  // Этап resolve
  if (!existsSync(resolvedFile)) {
    process.stdout.write(`   🔍 resolve-court-address.mjs...`);
    const result = runScript('resolve-court-address.mjs', [region, COURTS, DATA_DIR, GAR_DIR]);
    if (result.ok) {
      process.stdout.write(` ✅\n`);
    } else {
      process.stdout.write(` ❌ ${result.error}\n`);
      continue;
    }
  }

  const data = JSON.parse(readFileSync(resolvedFile, 'utf8'));
  const withOktmo = data.filter(r => r.oktmo).length;
  console.log(`   📊 ${data.length} судов, ${withOktmo} с ОКТМО`);
  allResolved.push(...data);
  built++;
}

// 4. Сборка
console.log(`\n═══════════════════════════════════`);
console.log(`📊  ИТОГО`);
console.log(`═══════════════════════════════════`);
console.log(`   Регионов обработано: ${built}`);
console.log(`   Всего записей: ${allResolved.length}`);
const allWithOktmo = allResolved.filter(r => r.oktmo).length;
console.log(`   С ОКТМО: ${allWithOktmo}`);
console.log(`   Без ОКТМО: ${allResolved.length - allWithOktmo}`);

const outFile = join(DATA_DIR, 'resolved-all.json');
writeFileSync(outFile, JSON.stringify(allResolved, null, 2));
console.log(`\n✅ ${outFile}`);

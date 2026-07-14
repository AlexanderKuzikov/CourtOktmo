#!/usr/bin/env node
import './env.js';
import { Command } from 'commander';
import { join } from 'path';
import { OktmoResolver, ResolverOptions } from './core/OktmoResolver.js';

const CWD = process.cwd();
const KEYS_DIR = join(CWD, 'keys');
const DATA_DIR = join(CWD, 'data');

const program = new Command();

program
  .name('courtoktmo')
  .description('🔍 Определение ОКТМО/ОКАТО/ОКПО для судов РФ через DaData API')
  .version('0.1.0');

/**
 * Общая команда: разрешение ОКТМО для всех судов
 * Читает sourceFile, определяет ОКТМО, сохраняет в prefixesDir
 */
program
  .command('resolve')
  .description('Разрешить ОКТМО для судов (party + address)')
  .option('-s, --source <path>', 'Входной файл с судами (courts.json)', join(DATA_DIR, 'courts.json'))
  .option('-o, --output <dir>', 'Директория prefix-файлов', join(DATA_DIR, 'prefixes'))
  .option('-k, --keys <dir>', 'Директория с ключами', KEYS_DIR)
  .option('-m, --mode <mode>', 'Режим: both, party, address', 'both')
  .action(async (opts) => {
    const resolver = new OktmoResolver();
    const options: ResolverOptions = {
      keysDir: opts.keys,
      sourceFile: opts.source,
      prefixesDir: opts.output,
      mode: opts.mode,
    };

    console.log(`🔍 CourtOktmo · разрешение ОКТМО\n`);
    console.log(`   Источник: ${options.sourceFile}`);
    console.log(`   Режим:    ${options.mode}`);
    console.log(`   Вывод:    ${options.prefixesDir}\n`);

    const started = Date.now();
    try {
      const stats = await resolver.resolveAll(options);
      const elapsed = fmt(Date.now() - started);

      printStats(stats, elapsed);
    } catch (e: any) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }
  });

/**
 * Команда: разрешение ОКТМО только через suggest/party (по ИНН)
 */
program
  .command('party')
  .description('Разрешить ОКТМО по ИНН через suggest/party')
  .option('-s, --source <path>', join(DATA_DIR, 'courts.json'))
  .option('-o, --output <dir>', join(DATA_DIR, 'prefixes'))
  .option('-k, --keys <dir>', KEYS_DIR)
  .action(async (opts) => {
    const resolver = new OktmoResolver();
    const stats = await resolver.resolveAll({
      keysDir: opts.keys,
      sourceFile: opts.source,
      prefixesDir: opts.output,
      mode: 'party',
    });
    printStats(stats, '');
  });

/**
 * Команда: разрешение ОКТМО только через suggest/address (по адресу)
 */
program
  .command('address')
  .description('Разрешить ОКТМО по адресу через suggest/address')
  .option('-s, --source <path>', join(DATA_DIR, 'courts.json'))
  .option('-o, --output <dir>', join(DATA_DIR, 'prefixes'))
  .option('-k, --keys <dir>', KEYS_DIR)
  .action(async (opts) => {
    const resolver = new OktmoResolver();
    const stats = await resolver.resolveAll({
      keysDir: opts.keys,
      sourceFile: opts.source,
      prefixesDir: opts.output,
      mode: 'address',
    });
    printStats(stats, '');
  });

/**
 * Команда: разрешение ОКТМО только для ПСП-адресов
 */
program
  .command('psp')
  .description('Разрешить ОКТМО для ПСП-адресов через suggest/address')
  .option('-s, --source <path>', join(DATA_DIR, 'courts.json'))
  .option('-o, --output <dir>', join(DATA_DIR, 'prefixes'))
  .option('-k, --keys <dir>', KEYS_DIR)
  .action(async (opts) => {
    const resolver = new OktmoResolver();
    console.log(`🔍 CourtOktmo · ПСП ОКТМО\n`);
    const stats = await resolver.resolvePspOnly({
      keysDir: opts.keys,
      sourceFile: opts.source,
      prefixesDir: opts.output,
      mode: 'psp-only',
    });
    printStats(stats, '');
  });

/**
 * Команда: сборка courts.json из prefix-файлов
 */
program
  .command('assemble')
  .description('Собрать единый courts.json из prefix-файлов')
  .option('-i, --input <dir>', 'Директория prefix-файлов', join(DATA_DIR, 'prefixes'))
  .option('-o, --output <file>', 'Выходной файл', join(DATA_DIR, 'courts.json'))
  .action((opts) => {
    const resolver = new OktmoResolver();
    const count = resolver.assembleCourts(opts.input, opts.output);
    if (count > 0) {
      console.log(`✅ Собрано ${count} судов в ${opts.output}`);
    }
  });

/**
 * Команда: full — полный цикл (party + address + psp)
 * 1. party по ИНН из CH2
 * 2. address по main-адресам из CH2  
 * 3. psp по ПСП-адресам из CourtSudrf
 */
program
  .command('full')
  .description('Полный цикл: party + address + psp')
  .option('-k, --keys <dir>', 'Директория с ключами', KEYS_DIR)
  .option('--ch2 <path>', 'courts.json из CourtHarvest2', join(DATA_DIR, '..', 'CourtHarvest2', 'data', 'courts.json'))
  .option('--sudrf <path>', 'courts.json из CourtSudrf', join(DATA_DIR, '..', 'CourtSudrf', 'data', 'courts.json'))
  .option('-o, --output <dir>', 'Директория prefix-файлов', join(DATA_DIR, 'prefixes'))
  .action(async (opts) => {
    const resolver = new OktmoResolver();
    const keysDir = opts.keys;
    const outputDir = opts.output;
    const ch2File = opts.ch2;
    const sudrfFile = opts.sudrf;

    // ЭТАП 1: party — все суды с ИНН
    console.log('\n═══ ЭТАП 1: party (по ИНН) ═══\n');
    let stats = await resolver.resolveAll({
      keysDir, 
      sourceFile: ch2File,
      prefixesDir: join(outputDir, 'stage1_party'),
      mode: 'party',
    });
    printStats(stats, '');

    // ЭТАП 2: address — main-адреса всех судов из CH2
    console.log('\n═══ ЭТАП 2: address (main-адреса) ═══\n');
    stats = await resolver.resolveAll({
      keysDir,
      sourceFile: ch2File,
      prefixesDir: join(outputDir, 'stage2_address'),
      mode: 'address',
    });
    printStats(stats, '');

    // ЭТАП 3: psp — ПСП-адреса из CourtSudrf
    console.log('\n═══ ЭТАП 3: psp (ПСП-адреса) ═══\n');
    stats = await resolver.resolvePspOnly({
      keysDir,
      sourceFile: sudrfFile,
      prefixesDir: join(outputDir, 'stage3_psp'),
      mode: 'psp-only',
    });
    printStats(stats, '');

    // ЭТАП 4: сборка
    console.log('\n═══ ЭТАП 4: сборка ═══\n');
    // TODO: merge всех трёх стадий в единый набор prefix-файлов
    // Пока собираем только stage2_address как основной
    const total = resolver.assembleCourts(
      join(outputDir, 'stage2_address'),
      join(outputDir, '..', 'courts.json'),
    );
    console.log(`✅ Единый файл: ${join(outputDir, '..', 'courts.json')} (${total} судов)`);
  });

program.parse();

// ── Утилиты ────────────────────────────────────────────────

function fmt(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}с`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}м ${s}с`;
}

function printStats(stats: { total: number; success: number; fail: number; skip: number; withOkmo: number; byMethod: { party: number; address: number }; keysUsed: number; totalRequests: number }, elapsed: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊  ИТОГИ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Обработано:   ${stats.total}`);
  console.log(`  Успешно:      ${stats.success}`);
  console.log(`  С ОКТМО:      ${stats.withOkmo}`);
  console.log(`  Ошибок:       ${stats.fail}`);
  console.log(`  Пропущено:    ${stats.skip}`);
  console.log('');
  console.log(`  По ИНН (party):   ${stats.byMethod.party}`);
  console.log(`  По адресу:      ${stats.byMethod.address}`);
  console.log('');
  console.log(`  Ключей:       ${stats.keysUsed}`);
  console.log(`  Запросов:     ${stats.totalRequests}`);
  if (elapsed) console.log(`  Время:        ${elapsed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

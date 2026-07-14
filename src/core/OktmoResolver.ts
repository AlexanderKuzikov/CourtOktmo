import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { KeyManager, ManagedClient } from './KeyManager.js';
import { OktmoResult } from '../types/dadata.js';

/** Формат записи суда из CourtSudrf / CourtHarvest2 */
export interface CourtRecord {
  code: string;
  name: string;
  inn: string | null;
  court_type: string;
  court_type_name: string;
  address: string;
  legal_address: string | null;
  website: string | null;
  phone?: string | null;
  email?: string | null;
  region_code?: string;
  okato?: string | null;
  okmo?: string | null;
  okpo?: string | null;
  addresses?: {
    type: 'main' | 'psp' | 'other';
    address: string;
    phone?: string;
  }[];
  [key: string]: unknown;
}

export interface ResolverOptions {
  keysDir: string;
  sourceFile: string;
  prefixesDir: string;
  mode: 'party' | 'address' | 'both' | 'psp-only';
  /** В address-режиме пропускать суды с ИНН (уже обработаны party) */
  skipWithInn?: boolean;
}

export interface ResolverStats {
  total: number;
  success: number;
  fail: number;
  skip: number;
  withOkmo: number;
  byMethod: { party: number; address: number };
  keysUsed: number;
  totalRequests: number;
}

export class OktmoResolver {
  private km: KeyManager;

  constructor() {
    this.km = new KeyManager();
  }

  /**
   * Массовое разрешение ОКТМО для всех судов
   */
  async resolveAll(options: ResolverOptions): Promise<ResolverStats> {
    const keyCount = this.km.loadKeys(options.keysDir);
    if (keyCount === 0) {
      throw new Error('Нет ключей DaData. Поместите .env файлы в keys/');
    }
    console.log(`🔑 Загружено ключей: ${keyCount}`);

    if (!existsSync(options.sourceFile)) {
      throw new Error(`Файл не найден: ${options.sourceFile}`);
    }
    const raw = JSON.parse(readFileSync(options.sourceFile, 'utf-8'));
    const courts: CourtRecord[] = raw.courts || raw;
    console.log(`📂 Загружено записей: ${courts.length}\n`);

    mkdirSync(options.prefixesDir, { recursive: true });

    const stats: ResolverStats = {
      total: courts.length,
      success: 0, fail: 0, skip: 0, withOkmo: 0,
      byMethod: { party: 0, address: 0 },
      keysUsed: 0, totalRequests: 0,
    };

    // Группируем по префиксам
    const prefixMap = new Map<string, CourtRecord[]>();
    for (const court of courts) {
      if (!court.code) continue;
      const prefix = court.code.slice(0, 4);
      if (!prefixMap.has(prefix)) prefixMap.set(prefix, []);
      prefixMap.get(prefix)!.push(court);
    }

    const isPspOnly = options.mode === 'psp-only';

    for (const [prefix, prefixCourts] of prefixMap) {
      for (const court of prefixCourts) {
        if (court.okmo && court.okmo !== null) {
          stats.skip++;
          continue;
        }

        if (isPspOnly) {
          stats.skip++;
          continue;
        }

        // Если включён skipWithInn — пропускаем суды с ИНН (уже обработаны party)
        if (options.skipWithInn && !!court.inn) {
          stats.skip++;
          continue;
        }

        const mc = this.getManagedClient();
        if (!mc) {
          console.log('⚠️  Все ключи исчерпаны. Прерывание.');
          return stats;
        }

        const hasInn = !!court.inn;

        let result: OktmoResult | null = null;

        if (hasInn && (options.mode === 'party' || options.mode === 'both')) {
          result = await mc.client.suggestParty(court.inn!);
          this.km.trackRequest(mc);
          stats.byMethod.party++;
        } else if (options.mode === 'address' || options.mode === 'both') {
          const addr = court.address || court.legal_address;
          if (addr) {
            result = await mc.client.suggestAddress(addr);
            this.km.trackRequest(mc);
            stats.byMethod.address++;
          } else {
            stats.skip++;
            continue;
          }
        } else {
          stats.skip++;
          continue;
        }

        if (result) {
          court.okmo = result.okmo;
          court.okato = result.okato;
          court.okpo = result.okpo || court.okpo;
          if (result.error) {
            stats.fail++;
          } else {
            stats.success++;
            if (result.okmo) stats.withOkmo++;
          }
        }

        // ПСП-адреса
        if (court.addresses && court.addresses.length > 1) {
          const pspList = court.addresses.filter(a => a.type === 'psp');
          for (const psp of pspList) {
            const mcPsp = this.getManagedClient();
            if (!mcPsp) {
              console.log('⚠️  Все ключи исчерпаны. Прерывание ПСП.');
              return stats;
            }
            const pspResult = await mcPsp.client.suggestAddress(psp.address);
            this.km.trackRequest(mcPsp);
            (psp as any).okmo = pspResult.okmo;
            (psp as any).okato = pspResult.okato;
            stats.byMethod.address++;
            if (pspResult.okmo) stats.withOkmo++;
          }
        }
      }

      // Сохраняем prefix-файл
      const prefixFile = join(options.prefixesDir, `${prefix}.json`);
      writeFileSync(prefixFile, JSON.stringify(prefixCourts, null, 2), 'utf-8');
      process.stdout.write(`  💾 ${prefix}.json (${prefixCourts.length} суд.)\r`);
    }

    const kmStats = this.km.getStats();
    stats.keysUsed = kmStats.totalKeys;
    stats.totalRequests = kmStats.totalRequests;

    return stats;
  }

  /**
   * Разрешение ОКТМО только для ПСП-адресов
   */
  async resolvePspOnly(options: ResolverOptions): Promise<ResolverStats> {
    const keyCount = this.km.loadKeys(options.keysDir);
    if (keyCount === 0) throw new Error('Нет ключей DaData');
    console.log(`🔑 Загружено ключей: ${keyCount}`);

    if (!existsSync(options.sourceFile)) {
      throw new Error(`Файл не найден: ${options.sourceFile}`);
    }
    const raw = JSON.parse(readFileSync(options.sourceFile, 'utf-8'));
    const courts: CourtRecord[] = raw.courts || raw;

    const stats: ResolverStats = {
      total: 0, success: 0, fail: 0, skip: 0, withOkmo: 0,
      byMethod: { party: 0, address: 0 },
      keysUsed: 0, totalRequests: 0,
    };

    for (const court of courts) {
      if (!court.addresses || court.addresses.length <= 1) continue;
      const pspList = court.addresses.filter(a => a.type === 'psp');
      stats.total += pspList.length;

      for (const psp of pspList) {
        const mc = this.getManagedClient();
        if (!mc) {
          console.log('⚠️  Все ключи исчерпаны. Прерывание.');
          return stats;
        }
        const result = await mc.client.suggestAddress(psp.address);
        this.km.trackRequest(mc);
        stats.byMethod.address++;

        (psp as any).okmo = result.okmo;
        (psp as any).okato = result.okato;
        if (result.error) stats.fail++;
        else {
          stats.success++;
          if (result.okmo) stats.withOkmo++;
        }
      }

      // Сохраняем prefix-файл
      if (court.code) {
        const prefix = court.code.slice(0, 4);
        const prefixFile = join(options.prefixesDir, `${prefix}.json`);
        mkdirSync(options.prefixesDir, { recursive: true });

        let existing: CourtRecord[] = [];
        if (existsSync(prefixFile)) {
          existing = JSON.parse(readFileSync(prefixFile, 'utf-8')) as CourtRecord[];
        }
        const idx = existing.findIndex(c => c.code === court.code);
        if (idx >= 0) {
          existing[idx] = court;
        } else {
          existing.push(court);
        }
        writeFileSync(prefixFile, JSON.stringify(existing, null, 2), 'utf-8');
      }
    }

    const kmStats = this.km.getStats();
    stats.keysUsed = kmStats.totalKeys;
    stats.totalRequests = kmStats.totalRequests;
    return stats;
  }

  /**
   * Сборка единого courts.json из prefix-файлов
   */
  assembleCourts(prefixesDir: string, outputFile: string): number {
    if (!existsSync(prefixesDir)) {
      console.error(`❌ Директория не найдена: ${prefixesDir}`);
      return 0;
    }

    const files = readdirSync(prefixesDir).filter(f => f.endsWith('.json'));
    const allCourts: CourtRecord[] = [];

    for (const file of files) {
      const data = JSON.parse(readFileSync(join(prefixesDir, file), 'utf-8')) as CourtRecord[];
      allCourts.push(...data);
    }

    allCourts.sort((a, b) => a.code.localeCompare(b.code));

    const output = {
      meta: {
        totalCourts: allCourts.length,
        timestamp: new Date().toISOString(),
        phase: 'oktmo',
        mode: 'resolve',
      },
      courts: allCourts,
    };

    mkdirSync(join(outputFile, '..'), { recursive: true });
    writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');
    return allCourts.length;
  }

  private getManagedClient(): ManagedClient | null {
    return this.km.getClient();
  }
}

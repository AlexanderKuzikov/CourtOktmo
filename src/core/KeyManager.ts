import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { DaDataClient } from './DaDataClient.js';

const DAILY_LIMIT = 9_500; // чуть меньше 10 000 для запаса

export interface ManagedClient {
  client: DaDataClient;
  keyName: string;
  requestsUsed: number;
}

/**
 * Управление ключами DaData с ротацией по лимиту.
 * Читает keys/*.env файлы аналогично CourtHarvest2.
 */
export class KeyManager {
  private keys: { name: string; apiKey: string; secretKey: string }[] = [];
  private currentIndex = 0;
  public clients: ManagedClient[] = [];

  /**
   * Загрузить ключи из директории
   */
  loadKeys(keysDir: string): number {
    const files: string[] = [];
    try {
      const items = readdirSync(keysDir);
      for (const f of items) {
        if (f.endsWith('.env')) files.push(f);
      }
    } catch {
      console.error(`❌ Не удалось прочитать директорию ключей: ${keysDir}`);
      return 0;
    }

    for (const file of files) {
      const content = readFileSync(join(keysDir, file), 'utf-8');
      const apiKey = extractValue(content, 'DADATA_API_KEY');
      const secretKey = extractValue(content, 'DADATA_SECRET_KEY');
      if (apiKey && secretKey) {
        this.keys.push({
          name: basename(file, '.env'),
          apiKey,
          secretKey,
        });
      }
    }

    // Инициализируем клиентов
    for (const k of this.keys) {
      this.clients.push({
        client: new DaDataClient({
          apiKey: k.apiKey,
          secretKey: k.secretKey,
          minTime: 200,
        }),
        keyName: k.name,
        requestsUsed: 0,
      });
    }

    return this.clients.length;
  }

  /**
   * Получить текущего клиента. Если превышен лимит — переключить на следующий.
   */
  getClient(): ManagedClient | null {
    if (this.clients.length === 0) return null;

    for (let attempt = 0; attempt < this.clients.length; attempt++) {
      const idx = this.currentIndex % this.clients.length;
      this.currentIndex++;
      const mc = this.clients[idx];
      if (mc.requestsUsed < DAILY_LIMIT) {
        return mc;
      }
    }
    return null; // все исчерпаны
  }

  /**
   * Увеличить счётчик использованных запросов у клиента
   */
  trackRequest(mc: ManagedClient): void {
    mc.requestsUsed++;
  }

  /**
   * Получить суммарную статистику
   */
  getStats() {
    return {
      totalKeys: this.clients.length,
      totalRequests: this.clients.reduce((s, c) => s + c.requestsUsed, 0),
      remainingRequests: this.clients.reduce((s, c) => s + Math.max(0, DAILY_LIMIT - c.requestsUsed), 0),
      clients: this.clients.map(c => ({
        key: c.keyName,
        used: c.requestsUsed,
        remaining: Math.max(0, DAILY_LIMIT - c.requestsUsed),
      })),
    };
  }
}

function extractValue(content: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, 'im');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

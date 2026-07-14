/** Загрузка .env — нуль зависимостей */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function loadEnv(envPath?: string): void {
  const path = envPath || findEnv();
  if (!path) return;

  try {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // файла нет — не ошибка
  }
}

function findEnv(): string | null {
  const candidates = ['.env', join(process.cwd(), '.env')];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

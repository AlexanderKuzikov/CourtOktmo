# CourtOktmo 🔍

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![DaData](https://img.shields.io/badge/API-DaData-FF6F00?logo=dadata&logoColor=white)](https://dadata.ru)

**Определение ОКТМО/ОКАТО/ОКПО для адресов судов РФ через DaData API.**

Третий компонент в экосистеме сбора данных о судах (после [CourtHarvest2](https://github.com/AlexanderKuzikov/CourtHarvest2) и [CourtSudrf](https://github.com/AlexanderKuzikov/CourtSudrf)).

## Зачем

ОКТМО (Общероссийский классификатор территорий муниципальных образований) требуется для:
- Привязки судов к муниципальным образованиям
- Формирования отчётности по территориальной подсудности
- Интеграции с 1С и другими учётными системами

DaData suggest/court **не возвращает** ОКТМО. Данные собираются через `suggest/party` (по ИНН) и `suggest/address` (по адресу).

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtOktmo.git
cd CourtOktmo
npm install
```

### Подготовка ключей

Поместите ключи DaData в `keys/*.env`:

```env
DADATA_API_KEY=ваш_ключ
DADATA_SECRET_KEY=ваш_секрет
```

Можно скопировать ключи из CourtHarvest2:
```bash
cp -r ../CourtHarvest2/keys/*.env keys/
```

### Использование

```bash
# Полный сбор: party + address
npx tsx src/index.ts resolve \
  --source ../CourtHarvest2/data/courts.json \
  --output data/prefixes \
  --keys keys

# Только по ИНН (suggest/party)
npx tsx src/index.ts party \
  --source ../CourtHarvest2/data/courts.json \
  --output data/prefixes_party \
  --keys keys

# Только по адресу (suggest/address)
npx tsx src/index.ts address \
  --source ../CourtHarvest2/data/courts.json \
  --output data/prefixes_address \
  --keys keys

# Только для ПСП-адресов
npx tsx src/index.ts psp \
  --source ../CourtSudrf/data/courts.json \
  --output data/prefixes_psp \
  --keys keys

# Сборка единого файла
npx tsx src/index.ts assemble \
  --input data/prefixes \
  --output data/courts.json
```

## Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  CourtHarvest2   │    │  CourtSudrf      │    │  CourtOktmo      │
│  (DaData API)    │    │  (sudrf.ru)      │    │  (ОКТМО)         │
│  code, name,     │    │  ПСП, телефоны,  │    │  okato, okmo,    │
│  address, ИНН    │    │  email           │    │  okpo            │
│  10 225 судов    │    │  10 081 судов    │    │                  │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                      │                       │
         └──────────────────────┴───────────────────────┘
                           Слияние
                      Единая база судов
```

## Источники ОКТМО

| Метод | Эндпоинт | Для кого | Возвращает |
|-------|----------|----------|------------|
| **party** | `/suggest/party` | 229 судов с ИНН (AS, OS, AA, AJ, KJ, AV, KV, OV, VS) | okpo, okato, oktmo |
| **address** | `/suggest/address` | ~9 994 судов без ИНН (MS, RS, GV) + ПСП | okato, oktmo |

## Результаты

| Прогон | Всего | Успешно | С ОКТМО | Ошибок | Запросов |
|--------|:----:|:-------:|:-------:|:-----:|:--------:|
| party (по ИНН) | 10 223 | 229 | 229 | 0 | 229 |
| address (по адресу) | 10 223 | TBD | TBD | TBD | TBD |
| ПСП | 10 081 | TBD | TBD | TBD | TBD |

## Требования

- Node.js ≥ 24
- Ключ DaData (бесплатный: 10 000 запросов/день)

## Лицензия

Apache 2.0

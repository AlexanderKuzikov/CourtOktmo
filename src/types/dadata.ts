/** Типы DaData API для справочника судов, организаций и адресов */

/** Ответ /suggest/party (поиск организации по ИНН) — data внутри suggestion */
export interface PartySuggestion {
  inn: string;
  ogrn: string;
  okpo: string | null;
  okato: string | null;
  oktmo: string | null;
  okogu: string | null;
  okfs: string | null;
  /** Адрес организации */
  address?: {
    value: string;
    data: {
      source?: string;
      postal_code?: string;
      region?: string;
      city?: string;
      street?: string;
      house?: string;
      okato?: string;
      oktmo?: string;
    };
  };
  name: {
    full_with_opf: string;
    short_with_opf: string;
    full: string;
    short: string;
  };
  state: {
    status: 'ACTIVE' | 'LIQUIDATING' | 'LIQUIDATED' | 'REORGANIZING';
    registration_date: number | null;
    liquidation_date: number | null;
  };
  type: 'LEGAL' | 'INDIVIDUAL';
}

/** Ответ /suggest/address (геокодинг по адресу) — data внутри suggestion */
export interface AddressSuggestion {
  postal_code: string | null;
  country: string;
  region: string;
  city: string | null;
  street: string | null;
  house: string | null;
  okato: string | null;
  oktmo: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
  fias_id: string | null;
  kladr_id: string | null;
  qc: string | null;        // 0 = точный, 1-5 = неточный
  qc_geo: number | null;     // 0 = точные координаты
  qc_complete: string | null;
  source: string | null;
  region_fias_id?: string;
  city_fias_id?: string;
  settlement?: string | null;
  settlement_with_type?: string | null;
  city_district?: string | null;
  city_district_with_type?: string | null;
}

/** Результат разрешения ОКТМО для адреса */
export interface OktmoResult {
  /** Исходный адрес или код суда */
  source: string;
  /** ОКТМО (11 цифр) */
  okmo: string | null;
  /** ОКАТО (11 цифр) */
  okato: string | null;
  /** ОКПО (8 цифр, только из suggest/party) */
  okpo: string | null;
  /** Источник: 'party' | 'address' */
  method: 'party' | 'address';
  /** Качество геокодинга: null при party */
  qc?: string | null;
  /** Точность координат: null при party */
  qc_geo?: number | null;
  /** Ошибка, если была */
  error?: string;
}

export interface DaDataResponse<T> {
  suggestions: {
    value: string;
    unrestricted_value: string;
    data: T;
  }[];
}

export interface DaDataClientConfig {
  apiKey: string;
  secretKey: string;
  baseURL?: string;
  timeout?: number;
  minTime?: number;
}

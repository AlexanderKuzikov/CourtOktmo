import axios, { AxiosInstance, AxiosError } from 'axios';
import Bottleneck from 'bottleneck';
import {
  DaDataResponse, DaDataClientConfig,
  PartySuggestion, AddressSuggestion, OktmoResult,
} from '../types/dadata.js';

export class DaDataApiError extends Error {
  public statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'DaDataApiError';
    this.statusCode = statusCode;
  }
}

export class DaDataClient {
  private http: AxiosInstance;
  private limiter: Bottleneck;
  private stats = { total: 0, success: 0, fail: 0 };

  constructor(config: DaDataClientConfig) {
    const baseURL = config.baseURL || 'https://suggestions.dadata.ru/suggestions/api/4_1/rs';

    this.http = axios.create({
      baseURL,
      timeout: config.timeout || 20_000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${config.apiKey}`,
        'X-Secret': config.secretKey,
      },
    });

    this.limiter = new Bottleneck({
      maxConcurrent: 2,
      minTime: config.minTime || 500, // 2 запроса/с
      reservoir: 5,                   // max 5 в секунду
      reservoirRefreshAmount: 5,
      reservoirRefreshInterval: 1000,
    });
  }

  /**
   * Поиск организации по ИНН через /suggest/party
   */
  async suggestParty(inn: string): Promise<OktmoResult> {
    this.stats.total++;
    try {
      const resp = await this.limiter.schedule(() =>
        this.http.post<DaDataResponse<PartySuggestion>>('/suggest/party', {
          query: inn, count: 1,
        }),
      );

      const sug = resp.data.suggestions?.[0]?.data;
      if (!sug) {
        this.stats.success++;
        return {
          source: inn, okmo: null, okato: null, okpo: null,
          method: 'party', error: 'not found',
        };
      }

      this.stats.success++;
      return {
        source: inn,
        okmo: sug.oktmo || null,
        okato: sug.okato || null,
        okpo: sug.okpo || null,
        method: 'party',
      };
    } catch (e) {
      this.stats.fail++;
      return this.handleError(e, inn);
    }
  }

  /**
   * Поиск адреса через /suggest/address
   */
  async suggestAddress(address: string): Promise<OktmoResult> {
    this.stats.total++;
    try {
      const resp = await this.limiter.schedule(() =>
        this.http.post<DaDataResponse<AddressSuggestion>>('/suggest/address', {
          query: address, count: 1,
        }),
      );

      const sugData = resp.data.suggestions?.[0]?.data;
      if (!sugData) {
        this.stats.success++;
        return {
          source: address, okmo: null, okato: null, okpo: null,
          method: 'address', error: 'not found',
        };
      }

      this.stats.success++;
      return {
        source: address,
        okmo: sugData.oktmo || null,
        okato: sugData.okato || null,
        okpo: null,
        method: 'address',
        qc: sugData.qc ?? null,
        qc_geo: sugData.qc_geo ?? null,
      };
    } catch (e) {
      this.stats.fail++;
      return this.handleError(e, address);
    }
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = { total: 0, success: 0, fail: 0 };
  }

  private handleError(e: unknown, source: string): OktmoResult {
    const err = e as AxiosError;
    const status = err.response?.status;
    const msg = err.response?.data
      ? JSON.stringify((err.response?.data as any)?.message || err.response?.data)
      : err.message;
    return {
      source,
      okmo: null, okato: null, okpo: null,
      method: 'party',
      error: `[${status || '?'}] ${msg || String(e)}`,
    };
  }
}

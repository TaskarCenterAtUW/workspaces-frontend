import { BaseHttpClient, BaseHttpClientError } from "~/services/http";
import { ICancelableClient } from "~/services/loading";

const MIN_TOKEN_REFRESH_MS = 10 * 1000;

function refreshTokenActive(refreshExpiresAt: Date) {
  return refreshExpiresAt > new Date(Date.now() + MIN_TOKEN_REFRESH_MS);
}

function expiresAsDate(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}

export class TdeiAuthStore {
  username: string = '';
  accessToken: string = '';
  refreshToken: string = '';
  expiresAt: Date = new Date(0);
  refreshExpiresAt: Date = new Date(0);

  _storageKey: string;

  constructor(storageKey: string = 'tdei-auth') {
    this._storageKey = storageKey;
    this.load();
  }

  get complete() {
    return this.accessToken.length > 0;
  }

  get ok() {
    return this.complete && !this.refreshTokenExpired;
  }

  get accessTokenExpired() {
    return this.expiresAt < new Date();
  }

  get refreshTokenExpired() {
    return !refreshTokenActive(this.refreshExpiresAt);
  }

  get needsRefresh() {
    return this.accessTokenExpired && !this.refreshTokenExpired;
  }

  get nextRefreshMs() {
    if (this.refreshTokenExpired) {
      return 0;
    }

    const nowMs = Date.now() + MIN_TOKEN_REFRESH_MS;

    return this.refreshExpiresAt.getTime() - nowMs;
  }

  store() {
    localStorage.setItem(this._storageKey, JSON.stringify(this));
  }

  load() {
    const serialized = localStorage.getItem(this._storageKey);

    if (!serialized) {
      this.clear();
      return;
    }

    const auth = JSON.parse(serialized);

    if (!refreshTokenActive(new Date(auth.refreshExpiresAt))) {
      this.clear();
      return;
    }

    this.username = auth.username;
    this.accessToken = auth.accessToken;
    this.refreshToken = auth.refreshToken;
    this.expiresAt = new Date(auth.expiresAt);
    this.refreshExpiresAt = new Date(auth.refreshExpiresAt);
  }

  clear() {
    this.username = '';
    this.accessToken = '';
    this.refreshToken = '';
    this.expiresAt = new Date(0);
    this.refreshExpiresAt = new Date(0);

    localStorage.removeItem(this._storageKey);
  }
}

export class TdeiClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`TDEI request failed: ${response.statusText} (${response.url})`);
    this.response = response;
  }
}

export class TdeiClient extends BaseHttpClient implements ICancelableClient {
  #auth: TdeiAuthStore;
  #refreshTimer?: ReturnType<typeof setTimeout>;

  constructor(gatewayUrl: string, auth: TdeiAuthStore, signal?: AbortSignal) {
    super(gatewayUrl, signal);

    this.#auth = auth;
    this.#setAuthHeader();
  }

  get auth() {
    return this.#auth;
  }

  clone(signal?: AbortSignal) {
    return new TdeiClient(this._baseUrl, this.#auth, signal ?? this._abortSignal);
  }

  async authenticate(username: string, password: string) {
    const response = await super._send('authenticate', 'POST', { username, password });
    const body = await response.json();

    this.#setAuth(username, body);
  }

  async refreshToken() {
    const response = await super._send('refresh-token', 'POST', this.#auth.refreshToken);
    const body = await response.json();

    this.#setAuth(this.#auth.username, body);
  }

  restartAutoAuthRefresh() {
    this.stopAutoAuthRefresh();

    if (!this.#auth.refreshTokenExpired) {
      const refreshFn = this.refreshToken.bind(this);
      this.#refreshTimer = setTimeout(refreshFn, this.#auth.nextRefreshMs);
      console.info(`Refreshing TDEI tokens in ${this.#auth.nextRefreshMs} ms.`)
    }
  }

  stopAutoAuthRefresh() {
    clearTimeout(this.#refreshTimer);
  }

  async getDatasetInfo(tdeiRecordId: number) {
    const response = await this._get(`osw?status=All&tdei_record_id=${tdeiRecordId}`);

    return (await response.json())[0];
  }

  #setAuth(username: string, body: any) {
    this.#auth.username = username;
    this.#auth.accessToken = body.access_token;
    this.#auth.refreshToken = body.refresh_token;
    this.#auth.expiresAt = expiresAsDate(body.expires_in);
    this.#auth.refreshExpiresAt = expiresAsDate(body.refresh_expires_in);
    this.#auth.store();

    this.#setAuthHeader();
    this.restartAutoAuthRefresh();
  }

  #setAuthHeader() {
    if (this.#auth.complete) {
      this._requestHeaders.Authorization = 'Bearer ' + this.#auth.accessToken;
    }
  }

  async _send(url: string, method: string, body?: any): Promise<Response> {
    try {
      if (this.#auth.needsRefresh) {
        await this.refreshToken();
      }

      return await super._send(url, method, body);
    } catch (e: any) {
      if (e instanceof BaseHttpClientError) {
        throw new TdeiClientError(e.response);
      }

      throw e;
    }
  }
}

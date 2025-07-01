import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';

import { BaseHttpClient, BaseHttpClientError } from '~/services/http';
import { ICancelableClient } from '~/services/loading';

const MIN_TOKEN_REFRESH_MS = 10 * 1000;

const FILENAME_FORMAT_MAP = new Map([
  ['osw', 'osw.zip'],
  ['osm', 'osm.xml']
]);

function refreshTokenActive(refreshExpiresAt: Date) {
  return refreshExpiresAt > new Date(Date.now() + MIN_TOKEN_REFRESH_MS);
}

function expiresAsDate(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}

function getJwtBody(accessToken: string) {
  const bodyStart = accessToken.indexOf('.');
  const bodyEnd = accessToken.indexOf('.', bodyStart + 1);

  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error('Error parsing JWT body');
  }

  let body = accessToken.substring(bodyStart + 1, bodyEnd);
  body = JSON.parse(atob(body))

  return body;
}

export class TdeiAuthStore {
  username: string = '';
  subject: string = '';
  email: string = '';
  displayName: string = '';
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
    this.subject = auth.subject;
    this.email = auth.email;
    this.displayName = auth.displayName;
    this.accessToken = auth.accessToken;
    this.refreshToken = auth.refreshToken;
    this.expiresAt = new Date(auth.expiresAt);
    this.refreshExpiresAt = new Date(auth.refreshExpiresAt);
  }

  clear() {
    this.username = '';
    this.subject = '';
    this.email = '';
    this.displayName = '';
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

export class TdeiConversionError extends Error {
  constructor(job) {
    super(`TDEI conversion failed: ${job.message}`);
    this.job = job;
  }
}

export class TdeiUserClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`TDEI user request failed: ${response.statusText} (${response.url})`);
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

  async tryRefreshAuth() {
    if (this.#auth.needsRefresh) {
      await this.refreshToken();
      return true
    }

    return false
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

  async getDatasetInfo(tdeiRecordId: string) {
    const response = await this._get(`datasets?status=All&tdei_dataset_id=${tdeiRecordId}`);

    return (await response.json())[0];
  }

  async getDatasetsByProjectGroupAndName(projectGroupId: string, name: string) {
    const response = await this._get(`datasets?tdei_project_group_id=${projectGroupId}&name=${encodeURIComponent(name)}`);

    return (await response.json())
      .map(d => ({ id: d.tdei_dataset_id, name: d.metadata.dataset_detail.name }));
  }

  async downloadOswDataset(tdeiRecordId: string, format: string = 'osw'): Blob {
    const response = await this._sendTest(`osw/${tdeiRecordId}?format=${format}`, 'GET');

    return (await response.blob());
  }

  async downloadPathwaysDataset(tdeiDatasetId: string): Blob {
    const response = await this._sendTest(`gtfs-pathways/${tdeiDatasetId}`, 'GET');

    return (await response.blob());
  }

  async openDatasetArchive(dataset: Blob) {
    const blobReader = new BlobReader(dataset);
    const zipReader = new ZipReader(blobReader);
    const entries = await zipReader.getEntries();
    const blobWriter = new BlobWriter();

    const isDataset = filename => !filename.startsWith('changeset')
      && (filename.endsWith('.zip') || filename.endsWith('.xml'));

    const out = {
      dataset: await entries.find(e => isDataset(e.filename)).getData(blobWriter),
      metadata: entries.find(e => e.filename.endsWith('.json'))
    };

    await zipReader.close();

    return out;
  }

  async uploadOswDataset(
    tdeiRecordId: string,
    projectGroupId: string,
    serviceId: string,
    dataset,
    metadata
  ) {
    const body = new FormData();
    body.append('dataset', new File([dataset], 'dataset.zip', { type: 'application/x-zip-compressed' }));
    body.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json' }));

    let resource = `osw/upload/${projectGroupId}/${serviceId}`;

    if (tdeiRecordId?.length > 0) {
      resource += '?derived_from_dataset_id=' + tdeiRecordId;
    }

    const response = await this._post(resource, body, {
      headers: { 'Authorization': this._requestHeaders['Authorization'] }
    });

    return await response.text();
  }

  async uploadPathwaysDataset(
    tdeiRecordId: string,
    projectGroupId: string,
    serviceId: string,
    dataset,
    metadata
  ) {
    const body = new FormData();
    body.append('dataset', new File([dataset], 'dataset.zip', { type: 'application/x-zip-compressed' }));
    body.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json' }));

    let resource = `gtfs-pathways/upload/${projectGroupId}/${serviceId}`;

    if (tdeiRecordId?.length > 0) {
      resource += '?derived_from_dataset_id=' + tdeiRecordId;
    }

    const response = await this._post(resource, body, {
      headers: { 'Authorization': this._requestHeaders['Authorization'] }
    });

    return await response.text();
  }

  async convertDataset(
    dataset: Blob,
    sourceFormat: string,
    targetFormat: string,
    projectGroupId: string
  ): Blob {
    const body = new FormData();
    body.append('source_format', sourceFormat);
    body.append('target_format', targetFormat);
    const filename = sourceFormat === 'osw' ? 'osw.zip' : 'osm.xml';
    body.append('file', new File([dataset], filename));

    const jobResponse = await this._sendTest('osw/convert', 'POST', body);
    const jobId = (await jobResponse.text());

    while (true) {
      console.info(`Waiting for dataset conversion job ${jobId}...`);
      await new Promise(resolve => setTimeout(resolve, 4000));

      const statusResponse = await this._get(`jobs?job_id=${jobId}&tdei_project_group_id=${projectGroupId}`, {
        headers: {
          'Accept': 'application/text',
          'Authorization': this._requestHeaders['Authorization']
        }
      });
      const statusBody = (await statusResponse.json())[0];
      const statusText = statusBody.status.toLowerCase();

      if (statusText === 'failed') {
        throw new TdeiConversionError(statusBody);
      }

      if (statusText === 'completed') {
        break;
      }
    }

    const fileResponse = await this._sendTest(`job/download/${jobId}`, 'GET');

    return await this.#unwrapConvertedDataset(await fileResponse.blob());
  }

  async #unwrapConvertedDataset(zip: Blob) {
    const zipReader = new ZipReader(new BlobReader(zip));
    const entries = await zipReader.getEntries();
    const out =  await entries[0].getData(new BlobWriter());

    await zipReader.close();

    return out;
  }

  #setAuth(username: string, body: any) {
    const jwt = getJwtBody(body.access_token);

    this.#auth.username = username;
    this.#auth.subject = jwt.sub;
    this.#auth.displayName = jwt.name;
    this.#auth.email = jwt.email;
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

  async _send(url: string, method: string, body?: any, config?: object): Promise<Response> {
    try {
      if (this.#auth.needsRefresh) {
        await this.refreshToken();
      }

      return await super._send(url, method, body, config);
    } catch (e: any) {
      if (e instanceof BaseHttpClientError) {
        throw new TdeiClientError(e.response);
      }

      throw e;
    }
  }
}

export class TdeiUserClient extends BaseHttpClient implements ICancelableClient {
  #tdeiClient: TdeiClient;
  #auth: TdeiAuthStore;

  constructor(apiUrl: string, tdeiClient: TdeiClient, signal?: AbortSignal) {
    super(apiUrl, signal);

    this.#tdeiClient = tdeiClient;
    this.#auth = tdeiClient.auth;
  }

  get auth() {
    return this.#auth;
  }

  clone(signal?: AbortSignal) {
    return new TdeiClient(this._baseUrl, this.#auth, signal ?? this._abortSignal);
  }

  async getMyProjectGroups() {
    const response = await this._get(`project-group-roles/${this.#auth.subject}`);

    return (await response.json())
      .map(p => ({ id: p.tdei_project_group_id, name: p.project_group_name }));
  }

  async getMyServices(projectGroupId: string, type: string = 'all') {
    const response = await this._get(`service?tdei_project_group_id=${projectGroupId}&service_type=${type}`);

    return (await response.json())
      .map(s => ({ id: s.tdei_service_id, name: s.service_name }));
  }

  #setAuthHeader() {
    if (this.#auth.complete) {
      this._requestHeaders.Authorization = 'Bearer ' + this.#auth.accessToken;
    }
  }

  async _send(url: string, method: string, body?: any, config?: object): Promise<Response> {
    try {
      await this.#tdeiClient.tryRefreshAuth();
      this.#setAuthHeader();

      return await super._send(url, method, body, config);
    } catch (e: any) {
      if (e instanceof BaseHttpClientError) {
        throw new TdeiUserClientError(e.response);
      }

      throw e;
    }
  }
}

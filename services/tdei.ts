import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';

import {
  BaseHttpClient,
  BaseHttpClientError,
  type FetchConfig,
  type HttpBody,
  withBearerToken
} from '~/services/http';
import type { ICancelableClient } from '~/services/loading';
import type {
  TdeiFeedback,
  TdeiProjectGroupApiResponse,
  TdeiServiceApiResponse,
  TdeiDatasetApiResponse,
  TdeiProjectGroup,
  TdeiService,
  TdeiDatasetSummary,
  TdeiDatasetMetadata,
  TdeiUserItem,
} from '~/types/tdei.ts';
import {
  requestSessionReauthentication,
  SessionRecoveryCancelledError,
} from '~/services/auth-session';

const MIN_TOKEN_REFRESH_MS = 10 * 1000;

function refreshTokenActive(refreshExpiresAt: Date) {
  return refreshExpiresAt > new Date(Date.now() + MIN_TOKEN_REFRESH_MS);
}

function accessTokenActive(expiresAt: Date) {
  return expiresAt > new Date();
}

function expiresAsDate(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}

function getJwtBody(accessToken: string): any {
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
    return this.complete
      && (!this.accessTokenExpired || !this.refreshTokenExpired);
  }

  get accessTokenExpired() {
    return !accessTokenActive(this.expiresAt);
  }

  get refreshTokenExpired() {
    return !this.refreshToken || !refreshTokenActive(this.refreshExpiresAt);
  }

  get needsRefresh() {
    return this.accessTokenExpired && !this.refreshTokenExpired;
  }

  get nextRefreshMs(): number {
    if (!this.complete || this.refreshTokenExpired) {
      return 0;
    }

    return Math.max(
      0,
      this.expiresAt.getTime() - Date.now() - MIN_TOKEN_REFRESH_MS
    );
  }

  get canReauthenticate(): boolean {
    return this.username.length > 0;
  }

  expire(): void {
    const username = this.username;

    // Keep only the username so this tab and other tabs can recover the session.
    this._resetAuth();
    this.username = username;

    if (username) {
      localStorage.setItem(this._storageKey, JSON.stringify({ username }));
    }
    else {
      localStorage.removeItem(this._storageKey);
    }
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

    let auth: Record<string, unknown>;

    try {
      auth = JSON.parse(serialized) as Record<string, unknown>;
    }
    catch {
      // Corrupt browser storage should behave like a signed-out session.
      this.clear();
      return;
    }

    this.username = typeof auth.username === 'string' ? auth.username : '';
    this.subject = typeof auth.subject === 'string' ? auth.subject : '';
    this.email = typeof auth.email === 'string' ? auth.email : '';
    this.displayName = typeof auth.displayName === 'string' ? auth.displayName : '';
    this.accessToken = typeof auth.accessToken === 'string' ? auth.accessToken : '';
    this.refreshToken = typeof auth.refreshToken === 'string' ? auth.refreshToken : '';
    this.expiresAt = new Date(String(auth.expiresAt ?? ''));
    this.refreshExpiresAt = new Date(String(auth.refreshExpiresAt ?? ''));

    if (!this.ok) {
      // Neither token can continue the session; prepare for password recovery.
      this.expire();
      return;
    }
  }

  clear() {
    this._resetAuth();

    localStorage.removeItem(this._storageKey);
    sessionStorage.removeItem('tdei-selected-project-group');
    sessionStorage.removeItem('tdei-selected-workspace');
  }

  _resetAuth(): void {
    this.username = '';
    this.subject = '';
    this.email = '';
    this.displayName = '';
    this.accessToken = '';
    this.refreshToken = '';
    this.expiresAt = new Date(0);
    this.refreshExpiresAt = new Date(0);
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
  job: any;

  constructor(job: any) {
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
  #refreshPromise?: Promise<void>;
  #sessionRevision = 0;

  constructor(gatewayUrl: string, auth: TdeiAuthStore, signal?: AbortSignal) {
    super(gatewayUrl, signal);

    this.#auth = auth;
  }

  get auth() {
    return this.#auth;
  }

  clone(signal?: AbortSignal) {
    return new TdeiClient(this._baseUrl, this.#auth, signal ?? this._abortSignal);
  }

  async authenticate(username: string, password: string) {
    const sessionRevision = this.#sessionRevision;
    const response = await super._send('authenticate', 'POST', { username, password });

    if (sessionRevision !== this.#sessionRevision) {
      throw new SessionRecoveryCancelledError();
    }

    const body = await response.json();

    this.#setAuth(username, body);
  }

  async refreshToken(): Promise<void> {
    if (this.#refreshPromise) {
      // Requests failing together share the refresh already in progress.
      return this.#refreshPromise;
    }

    const refreshToken = this.#auth.refreshToken;
    const sessionRevision = this.#sessionRevision;

    this.#refreshPromise = (async () => {
      let response: Response;

      try {
        response = await super._send(
          'refresh-token',
          'POST',
          refreshToken
        );
      }
      catch (error: unknown) {
        // Ignore this result if another tab changed the session while we waited.
        if (sessionRevision !== this.#sessionRevision) {
          if (this.#auth.ok) {
            return;
          }
          throw new SessionRecoveryCancelledError();
        }
        throw error;
      }

      if (sessionRevision !== this.#sessionRevision) {
        if (this.#auth.ok) {
          return;
        }
        throw new SessionRecoveryCancelledError();
      }

      this.#setAuth(this.#auth.username, await response.json());
    })();

    try {
      await this.#refreshPromise;
    }
    finally {
      this.#refreshPromise = undefined;
    }
  }

  restartAutoAuthRefresh(): void {
    this.stopAutoAuthRefresh();

    if (!this.#auth.complete || this.#auth.refreshTokenExpired) {
      return;
    }

    this.#refreshTimer = setTimeout(
      () => void this.#onAutoRefreshToken(),
      this.#auth.nextRefreshMs
    );
  }

  stopAutoAuthRefresh() {
    clearTimeout(this.#refreshTimer);
    this.#refreshTimer = undefined;
  }

  synchronizeAuthFromStorage(): void {
    // Ignore auth requests that started before this storage update.
    this.#sessionRevision += 1;
    this.stopAutoAuthRefresh();
    this.#auth.load();

    if (this.#auth.ok) {
      this.restartAutoAuthRefresh();
    }
  }

  async getDatasetInfo(tdeiRecordId: string): Promise<TdeiDatasetApiResponse | undefined> {
    const response = await this._get(`datasets?status=All&tdei_dataset_id=${tdeiRecordId}`);

    return (await response.json() as TdeiDatasetApiResponse[])[0];
  }

  async getAvailableDatasetsByName(name: string, pageNo = 1, pageSize = 10): Promise<TdeiDatasetSummary[]> {
    const params = new URLSearchParams({
      page_no: pageNo.toString(),
      page_size: pageSize.toString(),
      sort_field: 'uploaded_timestamp',
      sort_order: 'DESC',
      status: 'All',
      name
    });
    const response = await this._get(`datasets?${params.toString()}`);

    return (await response.json() as TdeiDatasetApiResponse[])
      .map(d => ({
        id: d.tdei_dataset_id,
        name: d.metadata?.dataset_detail?.name ?? d.tdei_dataset_id,
        version: d.metadata?.dataset_detail?.version,
        projectGroupName: d.project_group?.name
      }));
  }

  async downloadOswDataset(tdeiRecordId: string, format: string = 'osw'): Promise<Blob> {
    const response = await this._get(`osw/${tdeiRecordId}?format=${format}`, {
      headers: { Accept: '*/*' },
    });

    return (await response.blob());
  }

  async downloadPathwaysDataset(tdeiDatasetId: string): Promise<Blob> {
    const response = await this._get(`gtfs-pathways/${tdeiDatasetId}`, {
      headers: { Accept: '*/*' },
    });

    return (await response.blob());
  }

  async openDatasetArchive(dataset: Blob) {
    const blobReader = new BlobReader(dataset);
    const zipReader = new ZipReader(blobReader);
    const entries = await zipReader.getEntries();
    const blobWriter = new BlobWriter();

    const isDataset = (filename: string) => !filename.startsWith('changeset')
      && (filename.endsWith('.zip') || filename.endsWith('.xml'));

    const datasetEntry = entries.find(
      (e): e is FileEntry => !e.directory && isDataset(e.filename)
    );

    const out = {
      dataset: datasetEntry ? await datasetEntry.getData(blobWriter) : undefined,
      metadata: entries.find(e => e.filename.endsWith('.json'))
    };

    await zipReader.close();

    return out;
  }

  async uploadOswDataset(
    tdeiRecordId: string | undefined,
    projectGroupId: string,
    serviceId: string,
    dataset: Blob,
    metadata: TdeiDatasetMetadata,
    changeset?: Blob
  ): Promise<string> {
    const body = new FormData();
    body.append('dataset', new File([dataset], 'dataset.zip', { type: 'application/x-zip-compressed' }));
    body.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json' }));

    if (changeset) {
      body.append('changeset', new File([changeset], 'changeset.zip', { type: 'application/x-zip-compressed' }));
    }

    let resource = `osw/upload/${projectGroupId}/${serviceId}`;

    if ((tdeiRecordId?.length ?? 0) > 0) {
      resource += '?derived_from_dataset_id=' + tdeiRecordId;
    }

    const response = await this._post(resource, body, {
      headers: { Authorization: this._requestHeaders['Authorization'] }
    });

    return await response.text();
  }

  async uploadPathwaysDataset(
    tdeiRecordId: string | undefined,
    projectGroupId: string,
    serviceId: string,
    dataset: Blob,
    metadata: TdeiDatasetMetadata,
    changeset?: Blob
  ): Promise<string> {
    const body = new FormData();
    body.append('dataset', new File([dataset], 'dataset.zip', { type: 'application/x-zip-compressed' }));
    body.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json' }));

    if (changeset) {
      body.append('changeset', new File([changeset], 'changeset.zip', { type: 'application/x-zip-compressed' }));
    }

    let resource = `gtfs-pathways/upload/${projectGroupId}/${serviceId}`;

    if ((tdeiRecordId?.length ?? 0) > 0) {
      resource += '?derived_from_dataset_id=' + tdeiRecordId;
    }

    const response = await this._post(resource, body, {
      headers: { Authorization: this._requestHeaders['Authorization'] }
    });

    return await response.text();
  }

  async convertDataset(
    dataset: Blob,
    sourceFormat: string,
    targetFormat: string,
    projectGroupId: string
  ): Promise<Blob> {
    const body = new FormData();
    body.append('source_format', sourceFormat);
    body.append('target_format', targetFormat);
    const filename = sourceFormat === 'osw' ? 'osw.zip' : 'osm.xml';
    body.append('file', new File([dataset], filename));

    const jobResponse = await this._post('osw/convert', body);
    const jobId = (await jobResponse.text());

    while (true) {
      console.info(`Waiting for dataset conversion job ${jobId}...`);
      await new Promise(resolve => setTimeout(resolve, 4000));

      const statusResponse = await this._get(`jobs?job_id=${jobId}&tdei_project_group_id=${projectGroupId}`, {
        headers: {
          Accept: 'application/text',
          Authorization: this._requestHeaders['Authorization']
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

    const fileResponse = await this._get(`job/download/${jobId}`, {
      headers: { Accept: '*/*' },
    });

    return await fileResponse.blob();
  }

  async getDatasetFeedback(
    tdeiDatasetId: string,
    showResolved: boolean = false,
  ): Promise<TdeiFeedback[]> {
    const feedback = [];
    const pageSize = 50;
    const pageNum = 1;
    let items;

    const params = new URLSearchParams();
    params.append('tdei_dataset_id', tdeiDatasetId);
    params.append('page_size', pageSize.toString());

    if (!showResolved) {
      params.append('status', 'open');
    }

    do {
      params.set('page_no', pageNum.toString());
      const response = await this._get(`osw/dataset-viewer/feedbacks?${params}`);
      items = (await response.json()) ?? [];

      for (const submission of items) {
        submission.created_at = new Date(submission.created_at);
        submission.updated_at = new Date(submission.updated_at);
        submission.due_date = new Date(submission.due_date);
        feedback.push(submission);
      }
    } while (items.length === pageSize);

    return feedback;
  }

  #setAuth(username: string, body: any) {
    const jwt = getJwtBody(body.access_token);

    this.#auth.username = username;
    this.#auth.subject = typeof jwt.sub === 'string' ? jwt.sub : '';
    this.#auth.displayName = typeof jwt.name === 'string' ? jwt.name : '';
    this.#auth.email = typeof jwt.email === 'string' ? jwt.email : '';
    this.#auth.accessToken = body.access_token;
    this.#auth.refreshToken = body.refresh_token;
    this.#auth.expiresAt = expiresAsDate(body.expires_in);
    this.#auth.refreshExpiresAt = expiresAsDate(body.refresh_expires_in);
    this.#auth.store();

    this.restartAutoAuthRefresh();
  }

  async #onAutoRefreshToken() {
    try {
      await this.refreshToken();
      this.restartAutoAuthRefresh();
    }
    catch (error: unknown) {
      if (!this.#isUnauthorized(error)) {
        console.warn('Unable to refresh the TDEI session automatically.', error);
        this.restartAutoAuthRefresh();
        return;
      }

      try {
        await this.#requestPasswordReauthentication();
      }
      catch (recoveryError: unknown) {
        if (!(recoveryError instanceof SessionRecoveryCancelledError)) {
          console.warn('Unable to recover the expired TDEI session.', recoveryError);
        }
      }
    }
  }

  override async _send(
    url: string,
    method: string,
    body?: HttpBody,
    config?: FetchConfig
  ): Promise<Response> {
    try {
      return await this.sendProtectedRequest(accessToken =>
        super._send(
          url,
          method,
          body,
          withBearerToken(config, accessToken)
        )
      );
    }
    catch (error: unknown) {
      if (error instanceof BaseHttpClientError) {
        throw new TdeiClientError(error.response);
      }

      throw error;
    }
  }

  async sendProtectedRequest(
    send: (accessToken: string) => Promise<Response>
  ): Promise<Response> {
    // Make sure the first attempt starts with the best token currently available.
    await this.#ensureSession();

    try {
      return await this.#sendWithAccessToken(send);
    }
    catch (error: unknown) {
      if (!this.#isUnauthorized(error)) {
        throw error;
      }
    }

    if (!this.#auth.refreshTokenExpired) {
      // A server-side 401 may happen before the local expiry time, so refresh once.
      try {
        await this.refreshToken();

        try {
          return await this.#sendWithAccessToken(send);
        }
        catch (error: unknown) {
          if (!this.#isUnauthorized(error)) {
            throw error;
          }
        }
      }
      catch (error: unknown) {
        if (!this.#isUnauthorized(error)) {
          throw error;
        }
      }
    }

    await this.#requestPasswordReauthentication();

    // Password re-login succeeded; retry once with the new access token.
    return await this.#sendWithAccessToken(send);
  }

  async #sendWithAccessToken(
    send: (accessToken: string) => Promise<Response>
  ): Promise<Response> {
    const response = await send(this.#auth.accessToken);

    if (response.status === 401) {
      throw new BaseHttpClientError(response);
    }

    return response;
  }

  async #ensureSession(): Promise<void> {
    if (this.#auth.complete && !this.#auth.accessTokenExpired) {
      return;
    }

    if (this.#auth.needsRefresh) {
      try {
        await this.refreshToken();
        return;
      }
      catch (error: unknown) {
        if (!this.#isUnauthorized(error)) {
          throw error;
        }
      }
    }

    await this.#requestPasswordReauthentication();
  }

  async #requestPasswordReauthentication(): Promise<void> {
    const username = this.#auth.username;

    // Stop automatic refreshes while the user is restoring the session.
    this.stopAutoAuthRefresh();
    this.#auth.expire();

    if (!username) {
      throw new Error('The session expired and no username is available.');
    }

    await requestSessionReauthentication(username);
  }

  #isUnauthorized(error: unknown): boolean {
    return error instanceof BaseHttpClientError
      && error.response.status === 401;
  }

  logout(): void {
    this.#sessionRevision += 1;
    this.stopAutoAuthRefresh();
    this.#auth.clear();
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

  clone(signal?: AbortSignal): TdeiUserClient {
    return new TdeiUserClient(this._baseUrl, this.#tdeiClient, signal ?? this._abortSignal);
  }

  async getMyProjectGroups(pageNo: number = 1, searchText: string = '', pageSize: number = 10, sortBy: 'name' | 'created_at' = 'name'): Promise<{ items: TdeiProjectGroup[]; total?: number }> {
    let url = `project-group-roles/${this.#auth.subject}?page_size=${pageSize}&page_no=${pageNo}&sort_by=${sortBy}`;
    if (searchText) {
      url += `&searchText=${encodeURIComponent(searchText)}`;
    }

    const response = await this._get(url);

    try {
      const totalHeader = response.headers.get('X-Total-Count');
      const totalParsed = totalHeader !== null ? parseInt(totalHeader, 10) : NaN;
      const total = Number.isNaN(totalParsed) ? undefined : totalParsed;
      const items = (await response.json() as TdeiProjectGroupApiResponse[]) ?? [];
      return { items: items.map(p => ({
        tdei_project_group_id: p.tdei_project_group_id,
        name: p.project_group_name,
        roles: p.roles ?? [],
      })), total };
    } catch (e) {
      console.warn('getMyProjectGroups: failed to parse API response', e);
      return { items: [] };
    }
  }

  async getMyRolesForProjectGroup(projectGroupId: string, pgName: string): Promise<string[]> {
    const params = new URLSearchParams({ searchText: pgName });
    const response = await this._get(`project-group-roles/${this.#auth.subject}?${params}`);
    const pgs = (await response.json()) as TdeiProjectGroupApiResponse[];

    return pgs.find(p => p.tdei_project_group_id === projectGroupId)?.roles ?? [];
  }

  /**
   * The TDEI API does not expose a current-user role endpoint filtered by project-group ID.
   * Load the user's complete membership list and select the owning project group locally.
   */
  async getMyRolesForProjectGroupById(projectGroupId: string): Promise<string[]> {
    const response = await this._get(`project-group-roles/${this.#auth.subject}?page_size=10000&page_no=1&sort_by=name`);
    const items = (await response.json() as TdeiProjectGroupApiResponse[]) ?? [];
    return items.find(p => p.tdei_project_group_id === projectGroupId)?.roles ?? [];
  }

  async getMyServices(projectGroupId: string, type: string = 'all'): Promise<TdeiService[]> {
    const response = await this._get(`service?tdei_project_group_id=${projectGroupId}&service_type=${type}`);

    return (await response.json() as TdeiServiceApiResponse[])
      .map(s => ({ id: s.tdei_service_id, name: s.service_name }));
  }

  async getProjectGroupUsers(
    projectGroupId: string,
    searchText: string = '',
    pageNo: number = 1,
    pageSize: number = 10000,
  ): Promise<TdeiUserItem[]> {
    const params = new URLSearchParams();
    params.append('searchText', searchText);
    params.append('page_no', String(pageNo));
    params.append('page_size', String(pageSize));

    const response = await this._get(`project-group/${projectGroupId}/users?${params}`);

    return await response.json();
  }

  override async _send(
    url: string,
    method: string,
    body?: HttpBody,
    config?: FetchConfig,
  ): Promise<Response> {
    try {
      return await this.#tdeiClient.sendProtectedRequest(accessToken =>
        super._send(
          url,
          method,
          body,
          withBearerToken(config, accessToken),
        )
      );
    }
    catch (e: unknown) {
      if (e instanceof BaseHttpClientError) {
        throw new TdeiUserClientError(e.response);
      }

      throw e;
    }
  }
}

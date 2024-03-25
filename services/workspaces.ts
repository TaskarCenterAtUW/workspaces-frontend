import { BaseHttpClient, BaseHttpClientError } from "~/services/http";
import { ICancelableClient } from '~/services/loading';
import { TdeiClient } from '~/services/tdei';

export class WorkspacesClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`Workspaces request failed: ${response.statusText} (${response.url})`);
    this.response = response;
  }
}

export class WorkspacesClient extends BaseHttpClient implements ICancelableClient {
  #tdeiClient: TdeiClient;

  constructor(apiUrl: string, tdeiClient: TdeiClient, signal?: AbortSignal) {
    super(apiUrl, signal);

    this.#tdeiClient = tdeiClient;
    this.#setAuthHeader();
  }

  get auth() {
    return this.#tdeiClient.auth;
  }

  clone(signal?: AbortSignal) {
    return new WorkspacesClient(this._baseUrl, this.#tdeiClient, signal ?? this._abortSignal);
  }

  async getMyWorkspaces() {
    const response = await this._get('my-workspaces');

    return await response.json();
  }

  async createWorkspace(workspace) {
    const response = await this._post('workspaces', workspace);

    return await response.json();
  }

  #setAuthHeader() {
    if (this.#tdeiClient.auth.complete) {
      this._requestHeaders.Authorization = 'Bearer ' + this.#tdeiClient.auth.accessToken;
    }
  }

  async _send(url: string, method: string, body?: any): Promise<Response> {
    try {
      if (this.#tdeiClient.auth.needsRefresh) {
        await this.#tdeiClient.refreshToken();
        this.#setAuthHeader();
      }

      return await super._send(url, method, body);
    } catch (e: any) {
      if (e instanceof BaseHttpClientError) {
        throw new WorkspacesClientError(e.response);
      }

      throw e;
    }
  }
}

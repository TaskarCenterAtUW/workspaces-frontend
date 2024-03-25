export class BaseHttpClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`HTTP request failed: ${response.statusText} (${response.url})`)
    this.response = response
  }
}

export abstract class BaseHttpClient {
  _baseUrl: string;
  _requestHeaders = {
    'Accept': 'application/json',
    'Authorization': '',
    'Content-Type': 'application/json'
  };
  _abortSignal?: AbortSignal;

  constructor(baseUrl: string, signal?: AbortSignal) {
    this._baseUrl = baseUrl;
    this._abortSignal = signal;
  }

  _get(url: string): Promise<Response> {
    return this._send(url, 'GET');
  }

  _post(url: string, body: any): Promise<Response> {
    return this._send(url, 'POST', body);
  }

  _put(url: string, body: any): Promise<Response> {
    return this._send(url, 'PUT', body);
  }

  _delete(url: string): Promise<Response> {
    return this._send(url, 'DELETE');
  }

  async _send(url: string, method: string, body?: any): Promise<Response> {
    const requestOptions = {
      method: method,
      headers: this._requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: this._abortSignal
    };

    const response = await fetch(this._baseUrl + url, requestOptions);

    if (!response.ok) {
      throw new BaseHttpClientError(response);
    }

    return response;
  }
}

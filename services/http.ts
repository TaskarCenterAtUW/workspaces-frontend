export type FetchConfig = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
};

export type HttpBody = BodyInit | object;

export class BaseHttpClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`HTTP request failed: ${response.statusText} (${response.url})`)
    this.response = response
  }
}

export async function resolveHttpErrorMessage(
  error: unknown,
  fallbackMessage: string,
): Promise<string> {
  const response = error instanceof Error && 'response' in error
    ? (error as { response?: Response }).response
    : undefined;

  if (response) {
    try {
      const body = await response.clone().json() as {
        detail?: Array<{ msg?: string }> | string;
        message?: string;
        error?: string;
      };

      if (typeof body.detail === 'string' && body.detail.trim()) {
        return body.detail;
      }

      if (Array.isArray(body.detail)) {
        const messages = body.detail
          .map(item => item.msg?.trim())
          .filter((message): message is string => Boolean(message));

        if (messages.length > 0) {
          return messages.join(' ');
        }
      }

      for (const message of [body.message, body.error]) {
        if (typeof message === 'string' && message.trim()) {
          return message.trim();
        }
      }
    }
    catch {
      try {
        const contentType = response.headers.get('Content-Type') ?? '';
        const message = contentType.includes('application/json')
          ? ''
          : (await response.clone().text()).trim();

        if (message) {
          return message;
        }
      }
      catch {
        // Use the caller's concise fallback when the response body cannot be read.
      }
    }

    return fallbackMessage;
  }

  return error instanceof Error && error.message.trim()
    ? error.message
    : fallbackMessage;
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

  url(rest: string) {
    return this._baseUrl + rest
  }

  _get(url: string, config?: FetchConfig): Promise<Response> {
    return this._send(url, 'GET', undefined, config);
  }

  _post(url: string, body?: HttpBody, config?: FetchConfig): Promise<Response> {
    return this._send(url, 'POST', body, config);
  }

  _put(url: string, body?: HttpBody, config?: FetchConfig): Promise<Response> {
    return this._send(url, 'PUT', body, config);
  }

  _patch(url: string, body?: HttpBody, config?: FetchConfig): Promise<Response> {
    return this._send(url, 'PATCH', body, config);
  }

  _delete(url: string, config?: FetchConfig): Promise<Response> {
    return this._send(url, 'DELETE', undefined, config);
  }

  async _sendTest(url: string, method: string, body?: any): Promise<Response> {
    const response = await fetch(this.url(url), {
      method,
      body,
      headers: {
        Accept: 'application/text',
        Authorization: this._requestHeaders.Authorization
      }
    });

    if (!response.ok) {
      throw new BaseHttpClientError(response);
    }

    return response;
  }

  async _send(
    url: string,
    method: string,
    body?: HttpBody,
    config?: FetchConfig,
  ): Promise<Response> {
    const { headers: configHeaders, ...restConfig } = config ?? {};
    const mergedHeaders: Record<string, string> = {
      ...this._requestHeaders,
      ...configHeaders,
    };
    const requestOptions = {
      method,
      body: undefined as BodyInit | undefined,
      headers: mergedHeaders,
      signal: this._abortSignal,
      ...restConfig,
    };

    // Let the browser set Content-Type (and multipart boundary) for FormData:
    if (body instanceof FormData) {
      delete mergedHeaders['Content-Type'];
      requestOptions.body = body;
    }
    else if (body !== null && body !== undefined && (
      mergedHeaders['Content-Type'] === 'application/json'
      || (
        typeof body === 'object'
        && !(body instanceof Blob)
        && !(body instanceof ArrayBuffer)
        && !ArrayBuffer.isView(body)
        && !(body instanceof URLSearchParams)
        && !(body instanceof ReadableStream)
      )
    )) {
      requestOptions.body = JSON.stringify(body);
    }
    else {
      requestOptions.body = body as BodyInit;
    }

    const response = await fetch(this.url(url), requestOptions);

    if (!response.ok) {
      throw new BaseHttpClientError(response);
    }

    return response;
  }
}

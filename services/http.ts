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

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveJsonErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return nonEmptyString(body);
  }

  const record = body as Record<string, unknown>;
  const detail = record.detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return nonEmptyString(item);
        }
        const itemRecord = item as Record<string, unknown>;
        return nonEmptyString(itemRecord.msg) ?? nonEmptyString(itemRecord.message);
      })
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  const detailMessage = nonEmptyString(detail)
    ?? resolveJsonErrorMessage(detail);
  const message = detailMessage
    ?? nonEmptyString(record.message)
    ?? nonEmptyString(record.error);

  if (!message) {
    return null;
  }

  const detailRecord = detail && typeof detail === 'object' && !Array.isArray(detail)
    ? detail as Record<string, unknown>
    : null;
  const existingLock = detailRecord?.existing_lock;
  const lockRecord = existingLock && typeof existingLock === 'object' && !Array.isArray(existingLock)
    ? existingLock as Record<string, unknown>
    : null;
  const taskNumber = lockRecord?.task_number;

  if (
    typeof taskNumber === 'number'
    || (typeof taskNumber === 'string' && taskNumber.trim())
  ) {
    const normalizedMessage = /[.!?]$/.test(message) ? message : `${message}.`;
    return `${normalizedMessage} Existing lock: Task #${String(taskNumber).trim()}.`;
  }

  return message;
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
      const message = resolveJsonErrorMessage(await response.clone().json());

      if (message) {
        return message;
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

import type { HttpMethod, RequestBody, RequestConfig } from '~/types'

export class BaseHttpClientError extends Error {
  response: Response

  constructor(response: Response) {
    super(`HTTP request failed: ${response.statusText} (${response.url})`)
    this.response = response
  }
}

export abstract class BaseHttpClient {
  _baseUrl: string
  _requestHeaders: Record<string, string> = {
    'Accept': 'application/json',
    'Authorization': '',
    'Content-Type': 'application/json',
  }

  _abortSignal?: AbortSignal

  constructor(baseUrl: string, signal?: AbortSignal) {
    this._baseUrl = baseUrl
    this._abortSignal = signal
  }

  url(rest: string): string {
    return this._baseUrl + rest
  }

  _get(url: string, config?: RequestConfig): Promise<Response> {
    return this._send(url, 'GET', undefined, config)
  }

  _post(url: string, body: RequestBody, config?: RequestConfig): Promise<Response> {
    return this._send(url, 'POST', body, config)
  }

  _put(url: string, body: RequestBody, config?: RequestConfig): Promise<Response> {
    return this._send(url, 'PUT', body, config)
  }

  _patch(url: string, body: RequestBody, config?: RequestConfig): Promise<Response> {
    return this._send(url, 'PATCH', body, config)
  }

  _delete(url: string, config?: RequestConfig): Promise<Response> {
    return this._send(url, 'DELETE', undefined, config)
  }

  async _sendTest(url: string, method: HttpMethod, body?: RequestBody): Promise<Response> {
    const response = await fetch(this.url(url), {
      method,
      body: body as BodyInit | null | undefined,
      headers: {
        Accept: 'application/text',
        Authorization: this._requestHeaders.Authorization,
      },
    })

    if (!response.ok) {
      throw new BaseHttpClientError(response)
    }

    return response
  }

  async _send(url: string, method: HttpMethod, body?: RequestBody, config?: RequestConfig): Promise<Response> {
    let processedBody: BodyInit | null | undefined = body as BodyInit | null | undefined

    if (this._requestHeaders['Content-Type'] === 'application/json'
      && !(body instanceof FormData)
      && typeof body !== 'undefined'
      && body !== null
    ) {
      processedBody = JSON.stringify(body)
    }

    const requestOptions: RequestInit = {
      method,
      body: processedBody,
      headers: this._requestHeaders,
      signal: this._abortSignal,
      ...config,
    }

    const response = await fetch(this.url(url), requestOptions)

    if (!response.ok) {
      throw new BaseHttpClientError(response)
    }

    return response
  }
}

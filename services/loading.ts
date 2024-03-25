export interface ICancelableClient {
  clone(signal?: AbortSignal): ICancelableClient;
}

export class LoadingContext {
  _inProgress: number = 0;
  _abortController?: AbortController;

  get active() {
    return this._inProgress > 0;
  }

  get abortSignal() {
    return this._abortController?.signal;
  }

  start() {
    this._inProgress++;
  }

  finish() {
    this._inProgress--;
  }

  abort() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  async wrap<T extends ICancelableClient>(client: T, tx: (client: T) => Promise<void>) {
    try {
      this.start();
      await tx(client);
    } finally {
      this.finish();
    }
  }

  async cancelable<T extends ICancelableClient>(client: T, tx: (client: T) => Promise<void>) {
    this.abort();

    this._abortController = new AbortController();
    const cancelableClient = client.clone(this.abortSignal) as T;

    await this.wrap(cancelableClient, tx);
  }
}

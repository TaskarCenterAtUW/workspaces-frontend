declare global {
  interface Window {
    __crossOriginWorkerPatched?: boolean;
  }
}

if (typeof window !== 'undefined' && !window.__crossOriginWorkerPatched) {
  const NativeWorker = window.Worker;

  class CrossOriginWorker extends NativeWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      const abs = new URL(scriptURL.toString(), window.location.href);
      let url: string | URL = scriptURL;

      if (abs.origin !== window.location.origin) {
        const shim =
          options?.type === 'module'
            ? `import ${JSON.stringify(abs.href)};`
            : `importScripts(${JSON.stringify(abs.href)});`;
        url = URL.createObjectURL(
          new Blob([shim], { type: 'application/javascript' })
        );
      }
      super(url, options);
    }
  }

  window.Worker = CrossOriginWorker as typeof Worker;
  window.__crossOriginWorkerPatched = true;
}

export {};
import { ref } from 'vue'
import type { TdeiAuthStore } from '~/services/tdei';

/** Global `Rapid` namespace injected by the Rapid script at runtime. */
declare const Rapid: any;

export class RapidManager {
  #baseUrl: string;
  #osmUrl: string;
  #tdeiAuth: TdeiAuthStore;
  #stateCallback: ((state: any) => void) | null = null;
  #uploadCallback: ((result: any) => void) | null = null;

  /** Reactive flag indicating whether the Rapid script has loaded and is ready. */
  loaded: ReturnType<typeof ref<boolean>>;

  /** The DOM element that the Rapid editor mounts into. */
  containerNode: HTMLDivElement;

  /** The Rapid `Context` instance, available after loading completes. */
  rapidContext: any;

  constructor(baseUrl: string, osmUrl: string, tdeiAuth: TdeiAuthStore) {
    this.#baseUrl = baseUrl;
    this.#osmUrl = osmUrl.replace(/\/+$/, '');
    this.#tdeiAuth = tdeiAuth;

    this.loaded = ref(false);
    this.containerNode = document.createElement('div');
    this.rapidContext = null;
  }

  onStateChange(callback: (state: any) => void) {
    this.#stateCallback = callback;
  }

  #notifyStateChange(state: any) {
    if (this.#stateCallback) {
      this.#stateCallback(state);
    }
  }

  onUploadResult(callback: (result: any) => void) {
    this.#uploadCallback = callback;
  }

  #notifyUploadResult(result: any) {
    if (this.#uploadCallback) {
      this.#uploadCallback(result);
    }
  }

  load() {
    if (this.loaded.value) {
      return
    }

    const style = document.createElement('link');
    style.setAttribute('href', this.#baseUrl + 'rapid.css');
    style.setAttribute('type', 'text/css');
    style.setAttribute('rel', 'stylesheet');
    document.head.appendChild(style);

    const script = document.createElement('script');
    script.src = this.#baseUrl + 'rapid.js';
    script.async = true;
    script.onload = this.#onLoaded.bind(this);
    document.body.appendChild(script);
  }

  async init(workspaceId: number) {
    this.rapidContext.workspaceId = workspaceId;
    this.rapidContext.tdeiAuth = this.#tdeiAuth;
    this.rapidContext.preauth = { url: this.#osmUrl, apiUrl: this.#osmUrl };

    await this.rapidContext.initAsync();
    this.#patchRapid();
  }

  switchWorkspace(workspaceId: number) {
    this.rapidContext.workspaceId = workspaceId;

    // Induce the editor to re-read the configuration from the URL hash:
    window.dispatchEvent(new HashChangeEvent('hashchange', {
      newURL: window.location.href,
      oldURL: window.location.href
    }));

    return this.rapidContext.resetAsync();
  }

  #onLoaded() {
    this.loaded.value = true;

    this.rapidContext = new Rapid.Context();
    this.rapidContext.embed(true);
    this.rapidContext.containerNode = this.containerNode;
    this.rapidContext.assetPath = this.#baseUrl;

    console.log('Rapid loaded', this.rapidContext);
  }

  #patchRapid() {
    const rapidOsmService = this.rapidContext.services.osm;
    const rapidOsmClient = rapidOsmService._oauth;

    rapidOsmClient.fetch = this.#wrapFetch(rapidOsmClient.fetch);
    rapidOsmClient.authenticated = () => this.#tdeiAuth.ok;

    // Don't bother to fetch user details when uploading changesets:
    rapidOsmService.userDetails = (callback: (error: string) => void) => {
      callback('dummy error')
    };

    console.log('Rapid editor ', this.rapidContext);
    const editSystem = this.rapidContext.systems.editor;
    editSystem.on('stablechange', (_state: any) => {
      // this.#notifyStateChange(_state);
      const changes = editSystem.changes();
      console.log('Rapid editor changes', changes);
      const changesLength = changes.modified.length || changes.created.length || changes.deleted.length;

      this.#notifyStateChange(changesLength);
    });

    const uploader = this.rapidContext.systems.uploader;
    uploader.on('resultSuccess', (result: any) => {
      console.log('Rapid uploader resultSuccess', result);
      this.#notifyUploadResult(result);
    });

    // editSystem.on('reset', () => {
    //   console.log('Rapid editor reset');
    // });
  }

  #wrapFetch(innerFetch: typeof fetch) {
    return (resource: RequestInfo | URL, options: RequestInit & { headers?: HeadersInit | Record<string, string> }) => {
      if (!options.headers) {
        options.headers = new Headers();
      }

      const tokenHeader = 'Bearer ' + this.#tdeiAuth.accessToken;

      if (options.headers instanceof Headers) {
        options.headers.set('X-Workspace', this.rapidContext.workspaceId);
        options.headers.set('Authorization', tokenHeader);
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['X-Workspace', this.rapidContext.workspaceId]);
        options.headers.push(['Authorization', tokenHeader]);
      } else {
        options.headers['X-Workspace'] = this.rapidContext.workspaceId;

        // Don't let osm-auth overwrite our auth header:
        Object.defineProperty(options.headers, 'Authorization', {
          value: tokenHeader,
          writable: false,
          enumerable: true
        });
      }

      return innerFetch(resource, options);
    };
  }
}

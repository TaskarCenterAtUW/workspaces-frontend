import { ref } from 'vue';
import type { TdeiAuthStore } from '~/services/tdei';
import type { ImagerySource } from '~/types/imagery';
import { convertToRapidImagerySource } from '~/util/rapid-imagery';

/** Global `Rapid` namespace injected by the Rapid script at runtime. */
declare const Rapid: any;

type RapidInitialHashParams = Pick<Map<string, string>, 'delete' | 'set'>;

interface RapidCustomImageryRegistration {
  key: string;
  previousSource: any;
  source: any;
}

function isRapidInitialHashParams(value: unknown): value is RapidInitialHashParams {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.delete === 'function' && typeof candidate.set === 'function';
}

export class RapidManager {
  #baseUrl: string;
  #osmUrl: string;
  #tdeiAuth: TdeiAuthStore;
  #customImageryRegistration: RapidCustomImageryRegistration | null = null;
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

  onStateChange(callback: (state: any) => void): () => void {
    this.#stateCallback = callback;

    return () => {
      if (this.#stateCallback === callback) {
        this.#stateCallback = null;
      }
    };
  }

  #notifyStateChange(state: any) {
    if (this.#stateCallback) {
      this.#stateCallback(state);
    }
  }

  onUploadResult(callback: (result: any) => void): () => void {
    this.#uploadCallback = callback;

    return () => {
      if (this.#uploadCallback === callback) {
        this.#uploadCallback = null;
      }
    };
  }

  #notifyUploadResult(result: any) {
    if (this.#uploadCallback) {
      this.#uploadCallback(result);
    }
  }

  load() {
    if (this.loaded.value) {
      return;
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

  async init(
    workspaceId: number,
    customImagerySource: ImagerySource | null = null,
    changesetHashtags?: string,
  ): Promise<void> {
    this.rapidContext.workspaceId = workspaceId;
    this.rapidContext.tdeiAuth = this.#tdeiAuth;
    this.rapidContext.preauth = { url: this.#osmUrl, apiUrl: this.#osmUrl };
    this.#setInitialChangesetHashtags(changesetHashtags);
    const initPromise = this.rapidContext.initAsync();
    this.#patchRapidAuth();
    await initPromise;

    this.#addCustomImagerySource(customImagerySource);
    this.#bindRapidEvents();
  }

  #addCustomImagerySource(customImagerySource: ImagerySource | null) {
    this.#removeCustomImagerySource();

    if (!customImagerySource) {
      return;
    }

    const imagerySystem = this.rapidContext.systems.imagery;

    const newCustomSourceData = convertToRapidImagerySource(customImagerySource as unknown as ImagerySource | null);
    if (!newCustomSourceData) {
      return;
    }

    const key = newCustomSourceData.id.toLowerCase();
    const newCustomSource = new Rapid.ImagerySource(this.rapidContext, newCustomSourceData);
    const previousSource = imagerySystem._imageryIndex.sources.get(key);
    imagerySystem._imageryIndex.sources.set(key, newCustomSource);
    this.#customImageryRegistration = {
      key,
      previousSource,
      source: newCustomSource,
    };
    imagerySystem.setSourceByID(newCustomSourceData.id);
  }

  #removeCustomImagerySource() {
    const registration = this.#customImageryRegistration;

    if (!registration) {
      return;
    }

    const imagerySystem = this.rapidContext.systems.imagery;
    const sources = imagerySystem._imageryIndex.sources;
    const activeSource = imagerySystem.baseLayerSource();

    if (sources.get(registration.key) === registration.source) {
      if (registration.previousSource) {
        sources.set(registration.key, registration.previousSource);
      } else {
        sources.delete(registration.key);
      }
    }

    this.#customImageryRegistration = null;

    if (activeSource === registration.source) {
      const fallbackSource = imagerySystem.chooseDefaultSource();

      if (fallbackSource) {
        imagerySystem.baseLayerSource(fallbackSource);
      }
    }
  }

  async switchWorkspace(
    workspaceId: number,
    customImagerySource: ImagerySource | null = null,
    changesetHashtags?: string,
  ): Promise<void> {
    this.rapidContext.workspaceId = workspaceId;
    this.#setInitialChangesetHashtags(changesetHashtags);
    this.#removeCustomImagerySource();

    // Induce the editor to re-read the configuration from the URL hash:
    window.dispatchEvent(new HashChangeEvent('hashchange', {
      newURL: window.location.href,
      oldURL: window.location.href
    }));

    await this.rapidContext.resetAsync();
    this.#addCustomImagerySource(customImagerySource);
  }

  #setInitialChangesetHashtags(changesetHashtags?: string): void {
    const initialHashParams: unknown = this.rapidContext.systems?.urlhash?.initialHashParams
      ?? this.rapidContext.initialHashParams;

    if (!isRapidInitialHashParams(initialHashParams)) {
      return;
    }

    if (changesetHashtags) {
      initialHashParams.set('hashtags', changesetHashtags);
    } else {
      initialHashParams.delete('hashtags');
    }
  }

  #onLoaded() {
    this.rapidContext = new Rapid.Context();
    this.rapidContext.embed(true);
    this.rapidContext.containerNode = this.containerNode;
    this.rapidContext.assetPath = this.#baseUrl;

    this.loaded.value = true;
  }

  #patchRapidAuth() {
    const rapidOsmService = this.rapidContext.services.osm;
    const rapidOsmClient = rapidOsmService._oauth;

    rapidOsmClient.fetch = this.#wrapFetch(rapidOsmClient.fetch);
    rapidOsmClient.authenticated = () => this.#tdeiAuth.ok;

    // Don't bother to fetch user details when uploading changesets:
    rapidOsmService.userDetails = (callback: (error: string) => void) => {
      callback('dummy error')
    };
  }

  #bindRapidEvents() {
    const editSystem = this.rapidContext.systems.editor;
    editSystem.on('stablechange', (_state: any) => {
      // this.#notifyStateChange(_state);
      const changes = editSystem.changes();
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

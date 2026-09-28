import { ref } from 'vue'
import type { TdeiAuthStore } from '~/services/tdei'
import type { ImagerySource } from '~/types/imagery'
import { convertToRapidImagerySource } from '~/util/rapid-imagery'
import '~/services/patchWorker'

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any

type RapidInitialHashParams = Pick<Map<string, string>, 'delete' | 'set'>

function isRapidInitialHashParams(value: unknown): value is RapidInitialHashParams {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.delete === 'function' && typeof candidate.set === 'function'
}

/**
 * Manages the lifecycle of an embedded Rapid v3.x editor instance.
 *
 * Handles loading the Rapid v3.x script and stylesheet into the DOM, initializing
 * the editor context for a given workspace, switching between workspaces, and
 * patching Rapid's network layer to inject TDEI auth and workspace headers.
 *
 * Instantiated conditionally in `services/index.ts` — only when the
 * `VITE_RAPID3_URL` environment variable is set.
 */
export class Rapid3Manager {
  #baseUrl: string
  #osmUrl: string
  #tdeiAuth: TdeiAuthStore
  #stateCallback: ((state: any) => void) | null = null
  #uploadCallback: ((result: any) => void) | null = null

  /** Reactive flag indicating whether the Rapid 3 script has loaded and is ready. */
  loaded: ReturnType<typeof ref<boolean>>

  /** The DOM element that the Rapid editor mounts into. */
  containerNode: HTMLDivElement

  /** The Rapid `Context` instance, available after loading completes. */
  rapidContext: any

  /**
   * @constructor
   * @param baseUrl - Base URL where Rapid static assets are served
   *                  A trailing slash is enforced automatically.
   * @param osmUrl  - Base URL of the OSM-compatible API backend.
   * @param tdeiAuth - Reactive auth store providing access tokens and auth state.
   */
  constructor(baseUrl: string, osmUrl: string, tdeiAuth: TdeiAuthStore) {
    this.#baseUrl = baseUrl.replace(/\/*$/, '/')
    this.#osmUrl = osmUrl.replace(/\/+$/, '')
    this.#tdeiAuth = tdeiAuth

    this.loaded = ref(false)
    this.containerNode = document.createElement('div')
    this.rapidContext = null
  }

  onStateChange(callback: (state: any) => void): () => void {
    this.#stateCallback = callback

    return () => {
      if (this.#stateCallback === callback) {
        this.#stateCallback = null
      }
    }
  }

  #notifyStateChange(state: any) {
    this.#stateCallback?.(state)
  }

  onUploadResult(callback: (result: any) => void): () => void {
    this.#uploadCallback = callback

    return () => {
      if (this.#uploadCallback === callback) {
        this.#uploadCallback = null
      }
    }
  }

  #notifyUploadResult(result: any) {
    this.#uploadCallback?.(result)
  }

  /**
   * Injects the Rapid v3.x JavaScript and CSS into the document.
   *
   * This is a one-time operation — subsequent calls are no-ops if the script
   * has already been loaded. Once the script loads, {@link #onRapidLoaded} is
   * called to prepare the Rapid context. If the script fails to load, an error
   * is logged to the console.
   */
  load() {
    if (this.loaded.value) {
      return
    }

    const style = document.createElement('link')
    style.setAttribute('href', this.#baseUrl + 'css/rapid.css')
    style.setAttribute('type', 'text/css')
    style.setAttribute('rel', 'stylesheet')
    document.head.appendChild(style)

    const script = document.createElement('script')
    script.src = this.#baseUrl + 'js/rapid-dev.js'
    script.async = true
    script.onload = this.#onRapidLoaded.bind(this)
    script.onerror = (e) => {
      console.error('Failed to load Rapid3 script from:', script.src, e)
    }
    document.body.appendChild(script)
  }

  /**
   * Script onload handler. Creates the Rapid `Context`, configures it for
   * embedded mode, and runs `prepareAsync()`. Sets {@link loaded} to `true`
   * once preparation is complete, signaling to the edit page that
   * {@link init} can be called.
   */
  #onRapidLoaded() {
    const container = this.containerNode

    if (typeof Rapid === 'undefined' || !Rapid.utilDetect().isSupported) {
      container.innerHTML = 'Sorry, your browser is not currently supported.'
      container.style.padding = '20px'
    }
    else {
      const context = new Rapid.Context()
      context.embed(true); // hide the account management control
      context.containerNode = container
      context.assetPath = this.#baseUrl

      this.rapidContext = context
      context.prepareAsync()
        .then(() => {
          this.loaded.value = true
        })
    }
  }

  /**
   * Initializes the Rapid editor for a specific workspace.
   *
   * Configures the workspace ID, TDEI auth, and OSM API connection, then runs
   * Rapid's async init and start sequence. Must be called after {@link loaded}
   * becomes `true`.
   *
   * @param workspaceId - The numeric ID of the workspace to open for editing.
   * @param customImagerySource - Optional project imagery to select in Rapid.
   * @param changesetHashtags - Optional task hashtag to include on upload.
   * @returns A promise that resolves once the editor is fully started.
   */
  async init(
    workspaceId: number,
    customImagerySource: ImagerySource | null = null,
    changesetHashtags?: string,
  ): Promise<void> {
    const context = this.rapidContext
    context.workspaceId = workspaceId
    context.tdeiAuth = this.#tdeiAuth
    context.preauth = { url: this.#osmUrl, apiUrl: this.#osmUrl }
    this.#setInitialChangesetHashtags(changesetHashtags)
    this.#patchRapidNetwork()

    await context.initAsync()
    this.#patchRapid()

    // Rapid can create or reset its hash settings during initialization.
    this.#setInitialChangesetHashtags(changesetHashtags)
    this.#addCustomImagerySource(customImagerySource)
    this.#bindRapidEvents()
    await context.startAsync()
  }

  /**
   * Switches the editor to a different workspace without a full reload.
   *
   * Updates the workspace ID and dispatches a synthetic `hashchange` event to
   * make Rapid re-read its configuration from the URL hash, then resets the
   * editor state.
   *
   * @param workspaceId - The numeric ID of the workspace to switch to.
   * @param customImagerySource - Optional project imagery to select in Rapid.
   * @param changesetHashtags - Optional task hashtag to include on upload.
   * @returns A promise that resolves once the editor has reset.
   */
  async switchWorkspace(
    workspaceId: number,
    customImagerySource: ImagerySource | null = null,
    changesetHashtags?: string,
  ): Promise<void> {
    this.rapidContext.workspaceId = workspaceId
    this.#setInitialChangesetHashtags(changesetHashtags)

    window.dispatchEvent(new HashChangeEvent('hashchange', {
      newURL: window.location.href,
      oldURL: window.location.href,
    }))

    await this.rapidContext.resetAsync()

    // Reset can clear task-specific settings, so restore them afterward.
    this.#setInitialChangesetHashtags(changesetHashtags)
    this.#addCustomImagerySource(customImagerySource)
  }

  #setInitialChangesetHashtags(changesetHashtags?: string): void {
    const initialHashParams: unknown = this.rapidContext.systems?.urlhash?.initialHashParams
      ?? this.rapidContext.initialHashParams

    if (!isRapidInitialHashParams(initialHashParams)) {
      return
    }

    if (changesetHashtags) {
      initialHashParams.set('hashtags', changesetHashtags)
    }
    else {
      initialHashParams.delete('hashtags')
    }
  }

  #addCustomImagerySource(customImagerySource: ImagerySource | null) {
    if (!customImagerySource) {
      return
    }

    const newCustomSourceData = convertToRapidImagerySource(customImagerySource)
    if (!newCustomSourceData) {
      return
    }

    const imagerySystem = this.rapidContext.systems.imagery
    const newCustomSource = new Rapid.ImagerySource(this.rapidContext, newCustomSourceData)
    imagerySystem._imageryIndex.sources.set(newCustomSourceData.id, newCustomSource)
    imagerySystem.setSourceByID(newCustomSourceData.id)
  }

  #bindRapidEvents() {
    const editSystem = this.rapidContext.systems.editor
    editSystem.on('stablechange', () => {
      const changes = editSystem.changes()
      const changesLength = changes.modified.length || changes.created.length || changes.deleted.length
      this.#notifyStateChange(changesLength)
    })

    const uploader = this.rapidContext.systems.uploader
    uploader.on('resultSuccess', (result: any) => {
      this.#notifyUploadResult(result)
    })
  }

  /**
   * Adds TDEI authentication to Rapid 3's worker-backed network requests.
   */
  #patchRapidNetwork() {
    const context = this.rapidContext
    const osmBaseUrl = new URL(`${this.#osmUrl}/`, window.location.href)

    context.systems.network.addRequestInterceptor((url: string | URL, init: RequestInit = {}) => {
      const requestUrl = new URL(url.toString(), window.location.href)
      const isOsmRequest = requestUrl.origin === osmBaseUrl.origin
        && requestUrl.pathname.startsWith(osmBaseUrl.pathname)

      if (!isOsmRequest) {
        return init
      }

      const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers).entries())
      headers.Authorization = `Bearer ${this.#tdeiAuth.accessToken}`
      headers['X-Workspace'] = String(context.workspaceId)

      return { ...init, headers }
    })
  }

  /**
   * Patches Rapid's OSM service layer to use TDEI authentication.
   *
   * Replaces the built-in OAuth fetch with {@link #wrapFetch} to inject
   * workspace and authorization headers, overrides the `authenticated` check
   * to use TDEI auth state, and stubs out `userDetails` (not needed for
   * workspace-based changeset uploads).
   */
  #patchRapid() {
    const context = this.rapidContext
    const rapidOsmService = context.services.osm
    const rapidOsmClient = rapidOsmService._oauth

    rapidOsmClient.fetch = this.#wrapFetch(rapidOsmClient.fetch)
    rapidOsmClient.authenticated = () => this.#tdeiAuth.ok

    rapidOsmService.userDetails = (callback: (err: string) => void) => {
      callback('dummy error')
    }
  }

  /**
   * Wraps a fetch function to inject `X-Workspace` and `Authorization` headers
   * on every request Rapid makes to the OSM API.
   *
   * Handles all three header formats that Rapid/osm-auth may use: `Headers`
   * instance, array of tuples, or plain object. When headers are a plain object,
   * `Authorization` is defined as non-writable to prevent osm-auth from
   * overwriting it with its own OAuth token.
   *
   * @param innerFetch - The original fetch function from Rapid's OAuth client.
   * @returns A wrapped fetch function with workspace/auth headers injected.
   */
  #wrapFetch(innerFetch: typeof fetch) {
    return (resource: RequestInfo | URL, options: RequestInit & { headers?: HeadersInit | Record<string, string> }) => {
      if (!options.headers) {
        options.headers = new Headers()
      }

      const tokenHeader = 'Bearer ' + this.#tdeiAuth.accessToken

      if (options.headers instanceof Headers) {
        options.headers.set('X-Workspace', this.rapidContext.workspaceId)
        options.headers.set('Authorization', tokenHeader)
      }
      else if (Array.isArray(options.headers)) {
        options.headers.push(['X-Workspace', this.rapidContext.workspaceId])
        options.headers.push(['Authorization', tokenHeader])
      }
      else {
        options.headers['X-Workspace'] = this.rapidContext.workspaceId

        Object.defineProperty(options.headers, 'Authorization', {
          value: tokenHeader,
          writable: false,
          enumerable: true,
        })
      }

      return innerFetch(resource, options)
    }
  }
}

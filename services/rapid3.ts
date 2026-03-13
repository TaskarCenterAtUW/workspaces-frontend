import { ref } from 'vue'
import type { TdeiAuthStore } from '~/services/tdei'

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any

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
    const container = this.containerNode;

    if (typeof Rapid === 'undefined' || !Rapid.utilDetect().support) {
      container.innerHTML = 'Sorry, your browser is not currently supported.'
      container.style.padding = '20px'

    } else {
      const context = new Rapid.Context()
      context.embed(true);   // hide the account management control
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
   * @returns A promise that resolves once the editor is fully started.
   */
  init(workspaceId: number) {
    const context = this.rapidContext
    context.workspaceId = workspaceId
    context.tdeiAuth = this.#tdeiAuth
    context.preauth = { url: this.#osmUrl, apiUrl: this.#osmUrl }

    return context.initAsync()
      .then(() => this.#patchRapid())
      .then(() => context.startAsync())
  }


  /**
   * Switches the editor to a different workspace without a full reload.
   *
   * Updates the workspace ID and dispatches a synthetic `hashchange` event to
   * make Rapid re-read its configuration from the URL hash, then resets the
   * editor state.
   *
   * @param workspaceId - The numeric ID of the workspace to switch to.
   * @returns A promise that resolves once the editor has reset.
   */
  switchWorkspace(workspaceId: number) {
    this.rapidContext.workspaceId = workspaceId

    window.dispatchEvent(new HashChangeEvent('hashchange', {
      newURL: window.location.href,
      oldURL: window.location.href,
    }))

    return this.rapidContext.resetAsync()
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

    rapidOsmService.userDetails = (callback: (err: string) => void) => { callback('dummy error') }
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

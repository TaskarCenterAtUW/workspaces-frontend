import { ref } from 'vue'
import { CONFLATION_SERVICE_ID, createConflationService } from '~/services/conflation/rapid-service'
import type { ConflationDeps } from '~/services/conflation/rapid-service'
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
  #conflationDeps?: ConflationDeps

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
   * @param conflationDeps - How to download TDEI datasets for conflation; without it, conflation is off.
   */
  constructor(baseUrl: string, osmUrl: string, tdeiAuth: TdeiAuthStore, conflationDeps?: ConflationDeps) {
    this.#baseUrl = baseUrl.replace(/\/*$/, '/')
    this.#osmUrl = osmUrl.replace(/\/+$/, '')
    this.#tdeiAuth = tdeiAuth
    this.#conflationDeps = conflationDeps

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

    let error;
    if (typeof Rapid === 'undefined') {
      error = 'Rapid script was not loaded.';
    } else if (!globalThis.isSecureContext) {
      error = 'Rapid requires a secure context (https: or localhost).';
    } else if (!Rapid.utilDetect().isSupported) {
      error = 'Your browser is currently unsupported.';
    }

    if (error) {
      container.innerHTML = error
      container.style.padding = '20px'
    } else {
      const context = new Rapid.Context()
      context.embed(true); // hide the account management control
      context.containerNode = container
      context.assetPath = this.#baseUrl

      this.rapidContext = context;
      (globalThis as any).rapidContext = context;

      this.loaded.value = true
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

    this.#prePrepare()

    return context.prepareAsync()
      .then(() => this.#preInit())
      .then(() => context.initAsync())
      .then(() => this.#preStart())
      .then(() => context.startAsync())
  }

  /**
   * Customizations to run before Rapid instantiates anything.
   * This is a good time to get rid of systems or services that we will never need.
   */
  #prePrepare() {
    const services = Rapid.services.available;
    services.delete('geoscribble');
    services.delete('keepright');
    services.delete('mapwithai');
    services.delete('nsi');
    services.delete('osmose');

    // Conflation of TDEI datasets into the workspace, offered as Rapid suggestions
    if (this.#conflationDeps && !services.has(CONFLATION_SERVICE_ID)) {
      services.set(CONFLATION_SERVICE_ID, createConflationService(this.#conflationDeps));
    }
  }

  /**
   * The service that conflates TDEI datasets into the workspace, once Rapid
   * has started (see `services/conflation/rapid-service.ts`).
   */
  get conflation(): any {
    return this.rapidContext?.services?.[CONFLATION_SERVICE_ID]
  }

  /**
   * Customizations to run after `prepareAsync` but before `initAsync`.
   * The core objects have been instantiated but `initAsync` has not run yet.
   */
  #preInit() {
    const context = this.rapidContext

    //
    // Customize Network system
    // - Add request interceptor to apply TDEI headers to `/api/0.6` requests only.
    //
    const network = context.systems.network
    const interceptor = (url: string, init: RequestInit): RequestInit => {
      if (url.includes('/api/0.6')) {
        const headers = Object.fromEntries(new Headers(init.headers).entries())
        headers['Authorization'] = 'Bearer ' + this.#tdeiAuth.accessToken
        headers['X-Workspace'] = context.workspaceId
        return { ...init, headers }
      }
      return init // by default, no change
    };
    network.addRequestInterceptor(interceptor);

    //
    // Customize OSM service
    // - Override the `authenticated` check to use TDEI auth state
    // - Stub out`getUserDetailsAsync` (not needed for workspace-based changeset uploads).
    //
    const osm = context.services.osm
    osm._oauth.authenticated = () => this.#tdeiAuth.ok
    osm.getUserDetailsAsync = () => Promise.resolve(null)

    //
    // Customize UiSuccess screen (post-save)
    // Remove the functions that load and render the community index
    //
    const empty_oci = { resources: [], defaults: {} };
    Rapid.UiSuccess.prototype._getCommunityIndexAsync = () => Promise.resolve(empty_oci);
    Rapid.UiSuccess.prototype._renderCommunityData = () => null;

    //
    // Customize Localization System
    // When changing or setting up initial locale, override some strings with our own.
    //
    const l10n = context.systems.l10n;
    l10n.prependListener('localechange', () => {
      // The replacements below are English, so only apply them to English locales.
      // Other locales keep Rapid's own translations.
      const code = String(l10n.localeCode ?? '').toLowerCase();
      if (code !== 'en' && !code.startsWith('en-')) {
        return;
      }
      // Internally 'en-US' is stored under 'en'; other English variants (e.g. 'en-GB')
      // fall back to 'en', so write the overrides there and under the variant itself.
      const codes = code === 'en' || code === 'en-us' ? ['en'] : ['en', l10n.localeCode];
      // Change strings
      const replacements = {
        'loading_auth': 'Connecting...', // was: "Connecting to OpenStreetMap..."
        'status.message.error': 'Unable to reach the API. Your edits are safe locally. Check your network connection.',
        'status.message.offline': 'The API is offline. Your edits are safe locally. Please come back later.',
        'status.message.readonly': 'The API is currently read-only. You can continue editing, but must wait to save your changes.',
        'status.message.ratelimit': 'You have downloaded too much data. Please try again in {seconds} seconds or switch accounts.',
        'save.help': 'Review and upload your changes.',
        'save.uploading': 'Uploading Changes...', // was: 'Uploading changes to OpenStreetMap...
        'commit.title': 'Upload Changes', // was: "Upload to OpenStreetMap"
        'success.just_edited': 'Changes Saved!', // was: "You just edited OpenStreetMap!"
        'success.view_on_osm': 'View Changes', // was: "View changes on OSM"
        'map_data.layers.osm.tooltip': 'Existing data in this Workspace', // was: "Map data from OpenStreetMap"
        'map_data.layers.osm.title': 'Workspace Data', // was: "OpenStreetMap Data"
        'map_data.layers.osm.feature': 'Workspace Data', // was: "OpenStreetMap Feature"
        'map_data.layers.notes.tooltip': 'Notes in this Workspace', // was: "Note data from OpenStreetMap"
        'map_data.layers.notes.title': 'Workspace Notes', // was: "OpenStreetMap Notes"
        'map_data.osmhidden': 'These features have been automatically hidden because the Workspace layer is hidden.',
        'shortcuts.command.toggle_osm_data.label': 'Toggle Workspace data', // was: "Toggle OpenStreetMap data"
        'shortcuts.command.toggle_osm_notes.label': 'Toggle Workspace notes' // was: "Toggle OpenStreetMap notes"
      };
      for (const c of codes) {
        for (const [k, v] of Object.entries(replacements)) {
          l10n._store.set(`${c}.core.${k}`, v);
        }
      }
    });
  }

  /**
   * Customizations to run after `initAsync` but before `startAsync`.
   * The systems have been initted, but Rapid hasn't started doing anything yet.
   */
  #preStart() {
    const context = this.rapidContext

    //
    // Customize Imagery system
    // - Remove unapproved imagery sources
    //
    const imagery = context.systems.imagery
    const imageryOverrides = {
      assetID: 'tdei-imagery',
      scopes: [{
        scope: 'osm',
        imagery: {
          Mapbox: null,
          mapbox_locator_overlay: null
        }
      }]
    };
    // Apply these overrides over the imagery already loaded during `init`
    imagery.merge(imageryOverrides)
    imagery._overlayLayers.delete('mapbox_locator_overlay')

    //
    // Customize Style system
    // - apply Gaussian overrides for WA-Proviso
    //
    const styles = context.systems.styles
    const styleOverrides = {
      assetID: 'WA-Proviso-style',
      scopes: [{
        scope: 'osm',
        styles: {
          'override-crossing-marked': {
            label: { color: 0xffffff },
            casing: { color: 0xffffff },
            stroke: { color: 0x6c6f77 }
          },
          'override-footway-sidewalk': {
            label: { color: 0xffffff },
            casing: { color: 0xffffff },
            stroke: { color: 0xd196b1 }
          },
          'override-highway-pedestrian': {
            label: { color: 0xffffff },
            casing: { color: 0x464d50 },
            stroke: { color: 0xffffff }
          },
        },
        selectors: {
          'crossing-marked': {
            weight: 10,
            styleIDs: ['override-crossing-marked', 'line_narrow'],
            match: {
              geometry: 'line',
              tags: [{ key: 'crossing', value: 'marked' }]
            },
          },
          'footway-sidewalk': {
            weight: 10,
            styleIDs: ['override-footway-sidewalk', 'line_narrow'],
            match: {
              geometry: 'line',
              tags: [{ key: 'footway', value: 'sidewalk' }]
            },
          },
          'highway-pedestrian': {
            weight: 10,
            styleIDs: ['override-highway-pedestrian', 'line_wide'],
            match: {
              geometry: 'line',
              tags: [{ key: 'highway', value: 'pedestrian' }]
            },
          }
        }
      }]
    };
    // Apply these overrides over the styles already loaded during `init`
    styles.merge(styleOverrides)
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

//
//  /**
//   * Wraps a fetch function to inject `X-Workspace` and `Authorization` headers
//   * on every request Rapid makes to the OSM API.
//   *
//   * Handles all three header formats that Rapid/osm-auth may use: `Headers`
//   * instance, array of tuples, or plain object. When headers are a plain object,
//   * `Authorization` is defined as non-writable to prevent osm-auth from
//   * overwriting it with its own OAuth token.
//   *
//   * @param innerFetch - The original fetch function from Rapid's OAuth client.
//   * @returns A wrapped fetch function with workspace/auth headers injected.
//   */
//  #wrapFetch(innerFetch: typeof fetch) {
//    return (resource: RequestInfo | URL, options: RequestInit & { headers?: HeadersInit | Record<string, string> }) => {
//      if (!options.headers) {
//        options.headers = new Headers()
//      }
//
//      const tokenHeader = 'Bearer ' + this.#tdeiAuth.accessToken
//
//      if (options.headers instanceof Headers) {
//        options.headers.set('X-Workspace', this.rapidContext.workspaceId)
//        options.headers.set('Authorization', tokenHeader)
//      }
//      else if (Array.isArray(options.headers)) {
//        options.headers.push(['X-Workspace', this.rapidContext.workspaceId])
//        options.headers.push(['Authorization', tokenHeader])
//      }
//      else {
//        options.headers['X-Workspace'] = this.rapidContext.workspaceId
//
//        Object.defineProperty(options.headers, 'Authorization', {
//          value: tokenHeader,
//          writable: false,
//          enumerable: true,
//        })
//      }
//
//      return innerFetch(resource, options)
//    }
//  }
}

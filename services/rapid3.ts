import { ref, shallowRef } from 'vue'
import { tdeiOsmAuth } from '~/services/osm-auth'
import type { TdeiAuthStore } from '~/services/tdei'
import pathwaysSchema from '~/services/rapid3-pathways-schema.json'
import { Rapid3LevelTools } from '~/services/rapid3-levels'
import { installComboDescriptions, installSingleChoiceDropdowns, installTagValueLabels, installTagValueSuggestions } from '~/services/rapid3-tag-labels'
import {
  COMPLETENESS_VALIDATOR_ID,
  COMPLETENESS_VALIDATOR_STRINGS,
  CONNECTIVITY_VALIDATOR_ID,
  CONNECTIVITY_VALIDATOR_STRINGS,
  installCompletenessValidator,
  installConnectivityValidator,
  installReferenceValidator,
  installRequiredFieldsValidator,
  installLevelsValidator,
  installWorkspaceRevalidation,
  showRulesInIssuesPane,
  LEVELS_VALIDATOR_ID,
  LEVELS_VALIDATOR_STRINGS,
  REFERENCE_VALIDATOR_ID,
  REFERENCE_VALIDATOR_STRINGS,
  REQUIRED_FIELDS_VALIDATOR_ID,
  REQUIRED_FIELDS_VALIDATOR_STRINGS
} from '~/services/rapid3-validation'

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any

/** How long to wait before each retry of a failed whole-workspace load. */
const WHOLE_LOAD_RETRY_DELAYS_MS = [2000, 5000]

/** How long the whole-workspace request may take (Rapid's default is 30 s, too short for a big workspace). */
const WHOLE_LOAD_TIMEOUT_MS = 5 * 60 * 1000

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
  #refreshAuth: () => Promise<void>

  /** Reactive flag indicating whether the Rapid 3 script has loaded and is ready. */
  loaded: ReturnType<typeof ref<boolean>>

  /** The DOM element that the Rapid editor mounts into. */
  containerNode: HTMLDivElement

  /** The Rapid `Context` instance, available after loading completes. */
  rapidContext: any

  /**
   * The workspace datatype Rapid was initialized for (e.g. 'osw', 'pathways').
   * Schema customizations are applied once at init and can't be undone, so the
   * edit page reloads rather than reusing a Rapid instance across datatypes.
   */
  datatype: string | undefined

  /** GTFS level tools, set once a pathways workspace has started (see `init`). */
  levelTools = shallowRef<Rapid3LevelTools | undefined>()

  /**
   * @constructor
   * @param baseUrl - Base URL where Rapid static assets are served
   *                  A trailing slash is enforced automatically.
   * @param osmUrl  - Base URL of the OSM-compatible API backend.
   * @param tdeiAuth - Reactive auth store providing access tokens and auth state.
   * @param refreshAuth - Refreshes the TDEI access token (see services/osm-auth.ts).
   */
  constructor(baseUrl: string, osmUrl: string, tdeiAuth: TdeiAuthStore, refreshAuth: () => Promise<void>) {
    this.#baseUrl = baseUrl.replace(/\/*$/, '/')
    this.#osmUrl = osmUrl.replace(/\/+$/, '')
    this.#refreshAuth = refreshAuth
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
    // Minified dev build: still sets the PIXI and Rapid.sdk globals we use, at ~60% of the size
    script.src = this.#baseUrl + 'js/rapid-dev.min.js'
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
   * @param datatype - The workspace datatype; 'pathways' swaps in the GTFS Pathways schema.
   * @returns A promise that resolves once the editor is fully started.
   */
  init(workspaceId: number, datatype?: string) {
    const context = this.rapidContext
    this.datatype = datatype
    context.workspaceId = workspaceId
    context.tdeiAuth = this.#tdeiAuth
    context.preauth = { url: this.#osmUrl, apiUrl: this.#osmUrl }

    this.#prePrepare()

    return context.prepareAsync()
      .then(() => this.#preInit())
      .then(() => context.initAsync())
      .then(() => this.#preStart())
      .then(() => context.startAsync())
      .then(() => {
        if (datatype === 'pathways') {
          this.levelTools.value = new Rapid3LevelTools(context)
          this.#loadWholeWorkspace(workspaceId, { outlineMissingLevels: true })
          this.#reloadWholeWorkspaceAfterResets()
        }
      })
  }

  /**
   * Loads all of a workspace's data into the editor at once, instead of only
   * the tiles the map has shown, so lists drawn from the data (the level_id
   * and parent_station choices, the level panel) cover the whole dataset.
   * Used for pathways workspaces, which are small; OSW ones can be too big.
   * Tiles loaded later skip what's already here.
   */
  /**
   * Reloads the whole workspace after each Rapid reset. A reset drops all
   * loaded data: restoring unsaved edits resets and then brings back only the
   * edited features (and what they need), and switching workspaces resets too.
   * Without this, stations outside the view would be missing afterward, so
   * their stops and levels would lose their station in the level panel.
   */
  #reloadWholeWorkspaceAfterResets() {
    const context = this.rapidContext
    const reset = context.resetAsync.bind(context)
    let lastReset: Promise<void> | undefined
    context.resetAsync = () => {
      const resetting = reset()
      // Concurrent calls share one reset (Rapid memoizes it): reload once.
      if (resetting !== lastReset) {
        lastReset = resetting
        resetting
          .then(() => this.#loadWholeWorkspace(context.workspaceId))
          .catch(() => {}) // the caller sees the reset's own failure
      }
      return resetting
    }
  }

  /**
   * @param options.outlineMissingLevels - once loaded, outline the levels that
   *   have stops but no outline (one undoable edit). Only on first opening the
   *   editor, and not while Rapid offers to restore unsaved edits: an edit then
   *   could interleave with the restored history. Reloads after a reset
   *   (restore, workspace switch) leave them to the level panel's warning.
   */
  async #loadWholeWorkspace(workspaceId: number, options: { outlineMissingLevels?: boolean } = {}, attempt = 0) {
    const tools = this.levelTools.value
    const setStatus = (status: 'loading' | 'loaded' | 'failed') => {
      if (tools && this.rapidContext.workspaceId === workspaceId) tools.workspaceLoad.value = status
    }
    if (tools) tools.retryWorkspaceLoad = () => this.#loadWholeWorkspace(workspaceId, options)
    setStatus('loading')

    // A failed load (e.g. a timeout on a big workspace) is retried after 2 s and 5 s.
    const retryOrFail = (err: unknown) => {
      const delay = WHOLE_LOAD_RETRY_DELAYS_MS[attempt]
      if (delay === undefined || this.rapidContext.workspaceId !== workspaceId) {
        console.error('Failed to load the whole workspace into Rapid3:', err)
        setStatus('failed')
        return
      }
      setTimeout(() => this.#loadWholeWorkspace(workspaceId, options, attempt + 1), delay)
    }

    let bbox: string | undefined
    try {
      const { osmClient } = await import('~/services/index')
      bbox = await osmClient.getExportBbox(workspaceId)
    } catch (err) {
      retryOrFail(err)
      return
    }
    if (this.rapidContext.workspaceId !== workspaceId) return
    if (!bbox) {
      setStatus('loaded') // no bbox: nothing to load beyond what's viewed
      return
    }

    // Requested through Rapid's network system and OSM parser worker, like
    // `osm.loadFromAPI`, but (1) with a longer timeout, and (2) without
    // skipping features the parser has "seen". Rapid marks features seen as it
    // parses a response, even one whose request was then cancelled (panning
    // cancels tile requests) or timed out, so they're dropped from every later
    // response and never load until the page reloads. Loading everything here
    // (merging what's already loaded is harmless) brings those back too.
    const context = this.rapidContext
    const osm = context.services.osm
    const json = osm.preferJSON ? '.json' : ''
    const connection = osm._connectionID
    context.systems.network.fetchEnvelope(`${osm._apiroot}/api/0.6/map${json}?bbox=${bbox}`, {
      requestID: `osm-whole-workspace-${workspaceId}-${Date.now()}`,
      listenerID: 'osmService:fetchAndParse',
      listenerData: { format: json ? 'json' : 'xml', parserOptions: { skipSeen: false } },
      resultPriority: 'normal',
      timeout: WHOLE_LOAD_TIMEOUT_MS
    }).then((envelope: any) => {
      // Rapid reset mid-load (e.g. restoring edits), which starts a new load.
      if (osm._connectionID !== connection || context.workspaceId !== workspaceId) return
      if (!envelope.ok) {
        retryOrFail(envelope)
        return
      }
      setStatus('loaded')
      const results = envelope.value
      if (Array.isArray(results?.data)) {
        context.systems.editor.merge(results.data, results.seenIDs)
        if (options.outlineMissingLevels && !context.systems.editor.canRestoreBackup) {
          this.levelTools.value?.outlineMissingLevels()
        }
      }
    }).catch((err: any) => {
      if (osm._connectionID !== connection || context.workspaceId !== workspaceId) return
      retryOrFail(err)
    })
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
    // - Override the `authenticated` check to use TDEI auth state, and `logout`
    //   (which Rapid calls on an API auth error, then retries) to refresh the
    //   TDEI token instead of retrying forever (see services/osm-auth.ts)
    // - Stub out`getUserDetailsAsync` (not needed for workspace-based changeset uploads).
    // - Stub out `getUserChangesetsAsync` too: with no user it rejects ("No user"), and
    //   the save panel calls it (for recent-comment suggestions) without catching.
    //
    const osm = context.services.osm
    const auth = tdeiOsmAuth(() => this.#tdeiAuth.ok, this.#refreshAuth)
    osm._oauth.authenticated = auth.authenticated
    osm.logout = () => {
      auth.logout()
      return osm
    }
    osm.getUserDetailsAsync = () => Promise.resolve(null)
    osm.getUserChangesetsAsync = () => Promise.resolve([])

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

      // Rapid reads field option labels only from its translation strings, so copy
      // the pathways schema's `strings.options` labels (e.g. is_bidirectional 0/1)
      // into the tagging strings that its radio/combo fields look up.
      if (this.datatype === 'pathways') {
        type LabeledField = { strings?: { options?: Record<string, string> } };
        const fields = pathwaysSchema.scopes[0]!.fields as Record<string, LabeledField>;
        for (const c of codes) {
          for (const [fieldID, field] of Object.entries(fields)) {
            for (const [value, label] of Object.entries(field.strings?.options ?? {})) {
              // Array path: a dotted string would parse values like '0' as array indexes.
              l10n._store.set([c, 'tagging', 'presets', 'fields', fieldID, 'options', value], label);
            }
          }
          // Name the GTFS reference validator in Rapid's Issues panel (rule list).
          for (const [key, text] of Object.entries(REFERENCE_VALIDATOR_STRINGS)) {
            l10n._store.set([c, 'core', 'issues', REFERENCE_VALIDATOR_ID, key], text);
          }
          for (const [key, text] of Object.entries(REQUIRED_FIELDS_VALIDATOR_STRINGS)) {
            l10n._store.set([c, 'core', 'issues', REQUIRED_FIELDS_VALIDATOR_ID, key], text);
          }
          for (const [key, text] of Object.entries(COMPLETENESS_VALIDATOR_STRINGS)) {
            l10n._store.set([c, 'core', 'issues', COMPLETENESS_VALIDATOR_ID, key], text);
          }
          for (const [key, text] of Object.entries(CONNECTIVITY_VALIDATOR_STRINGS)) {
            l10n._store.set([c, 'core', 'issues', CONNECTIVITY_VALIDATOR_ID, key], text);
          }
          for (const [key, text] of Object.entries(LEVELS_VALIDATOR_STRINGS)) {
            l10n._store.set([c, 'core', 'issues', LEVELS_VALIDATOR_ID, key], text);
          }
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

    //
    // Customize Schema system (pathways workspaces only)
    // - Replace the OSM presets and categories with the GTFS Pathways ones, ported
    //   from the Pathways editor (TaskarCenterAtUW/workspaces-pathways-editor,
    //   data/pathways*.json). OSM fields are kept, since Rapid's own UI (e.g. the
    //   changeset comment/source/hashtags fields) relies on them.
    //
    if (this.datatype === 'pathways') {
      context.systems.schema.merge(pathwaysSchema)
      // Label coded GTFS values (e.g. pathway_mode 5 = Elevator) in the tag editor,
      // both next to the value and in its dropdown.
      installTagValueLabels()
      installTagValueSuggestions(context, (key: string) =>
        this.levelTools.value?.referenceChoices(key, context.selectedIDs?.()[0]))
      installSingleChoiceDropdowns()
      // Show levels' stations (and names) in the Fields section's level_id dropdown too.
      installComboDescriptions((key: string) =>
        this.levelTools.value?.referenceChoices(key, context.selectedIDs?.()[0]))
      // Flag parent_station / level_id / stop_id values that don't resolve.
      installReferenceValidator(context, () => this.levelTools.value)
      // Flag stops, pathways and levels missing a field GTFS requires.
      installRequiredFieldsValidator(context)
      // Flag pathways whose ends aren't stops, empty levels and empty stations.
      installCompletenessValidator(context)
      // Flag platforms riders can't reach or leave, missing step-free routes and pathway mistakes.
      installConnectivityValidator(context)
      // Level problems (formerly the Stations panel's warnings), with fixes.
      installLevelsValidator(context, () => this.levelTools.value)
      // Re-run those workspace-spanning checks everywhere after each edit, not just near it.
      installWorkspaceRevalidation(context)
      // List those rules in Rapid's Issues pane, and show their issues on existing data.
      showRulesInIssuesPane(context)
    }
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

    // For pathways, the reset reloads the whole new workspace (see #reloadWholeWorkspaceAfterResets).
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

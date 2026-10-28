import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';

// Generated from the @test outline in pages/workspace/[id]/edit.vue.
//
// edit.vue mounts one of three external editors (Rapid 2 / Rapid 3 / Pathways)
// chosen from the route's `editor` and `datatype` query params. The chosen
// manager (services/{rapid,rapid3,pathways}.ts) injects a <script>/<link> from
// VITE_RAPID_URL / VITE_RAPID3_URL / VITE_PATHWAYS_EDITOR_URL — all pointing at
// http://api.test/{rapid,rapid3,pathways}/ in E2E (playwright.config.ts). On
// script load each manager builds a global editor context (`Rapid` / `window.iD`),
// flips `manager.loaded`, and the page appends `manager.containerNode` into
// `.editorContainer` and calls `manager.init(workspaceId)`.
//
// To get a *successfully loaded* editor (so we can snapshot its UI) the stubbed
// script must define the global namespace the manager pokes at AND render some
// visible UI into the container node. The helpers below fulfill each script URL
// with exactly enough of a fake editor to make the manager's load+init path run
// to completion and paint a recognizable editor surface.
//
// The page itself makes NO workspaces API (api.test/workspaces/...) calls — it reads
// the workspace id straight off the route — so the contract test should see an
// empty violation list.

type Route = import('@playwright/test').Route;

const CSS = (route: Route) => route.fulfill({ body: '', contentType: 'text/css' });

// A fake Rapid 2 global (services/rapid.ts). `#onLoaded` does `new Rapid.Context()`
// then sets containerNode/assetPath; `init` sets workspaceId/tdeiAuth/preauth,
// awaits `initAsync()`, then `#patchRapid` reads `services.osm._oauth`.
// A test can set `window.__holdEditorInit` (a promise) to keep `initAsync()`
// pending until it settles, or `window.__failEditorInit` to make it reject.
const RAPID2_SCRIPT = (route: Route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    window.Rapid = {
      Context: class {
        constructor() { window.__fakeRapidContext = this; }
        embed() {}
        async resetAsync() {}
        async initAsync() {
          await window.__holdEditorInit;
          if (window.__failEditorInit) throw new Error('fake editor failed to start');
          this.containerNode.innerHTML =
            '<div class="fake-editor" role="application" aria-label="Rapid 2 editor">Rapid 2 editor</div>';
        }
        services = { osm: { _oauth: { fetch: () => {}, authenticated: () => true }, userDetails: () => {} } };
        systems = {
          urlhash: { initialHashParams: new Map() },
          editor: {
            changes: () => ({ created: [], deleted: [], modified: [] }),
            on: () => {}
          },
          uploader: { on: () => {} }
        };
      }
    };
  `
});

// A fake Rapid 3 global (services/rapid3.ts). `#onRapidLoaded` checks
// `Rapid.utilDetect().isSupported`, then builds a Context. `init` runs the sequence
// `#prePrepare()` -> `prepareAsync()` -> `#preInit()` -> `initAsync()` ->
// `#preStart()` -> `startAsync()`, customizing Rapid's services/systems along the
// way. The fake must expose every namespace those hooks poke at so init() runs to
// completion and initAsync() paints the editor surface:
//   - Rapid.services.available          (#prePrepare deletes optional services)
//   - context.systems.network           (#preInit adds a request interceptor)
//   - context.systems.l10n              (#preInit overrides OSM-specific strings)
//   - Rapid.UiSuccess                   (#preInit stubs the community index on its prototype)
//   - context.systems.imagery / .styles (#preStart merges overrides)
//   - context.systems.schema            (#preStart merges the pathways schema; the
//                                        fake records merged assetIDs on window.__schemaMerges)
//   - context.systems.editor / .filters (pathways level tools read the graph and wrap
//                                        the filter methods once Rapid has started)
//   - context.resetAsync                (wrapped to reload a pathways workspace after resets)
const RAPID3_SCRIPT = (route: Route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    window.Rapid = {
      utilDetect: () => ({ isSupported: true }),
      services: { available: new Set(['geoscribble', 'keepright', 'mapwithai', 'nsi', 'osmose']) },
      UiSuccess: class {},
      Context: class {
        embed() {}
        async prepareAsync() {}
        async initAsync() {
          this.containerNode.innerHTML =
            '<div class="fake-editor" role="application" aria-label="Rapid 3 editor">Rapid 3 editor</div>';
        }
        async resetAsync() {}
        async startAsync() {}
        services = { osm: { _oauth: { fetch: () => {}, authenticated: () => true }, userDetails: () => {} } };
        systems = {
          network: { addRequestInterceptor: () => {} },
          l10n: { prependListener: () => {}, localeCode: 'en', _store: new Map() },
          imagery: { merge: () => {}, _overlayLayers: new Set(['mapbox_locator_overlay']) },
          // Styles merge just before the schema step in #preStart; flag it so tests
          // can tell the schema step has run.
          styles: { merge: () => { window.__stylesMerged = true; } },
          schema: { merge: (input) => { (window.__schemaMerges ||= []).push(input.assetID); } },
          editor: {
            on: () => {},
            staging: { graph: {
              base: { entities: new Map() },
              local: { entities: new Map() },
              hasEntity: () => undefined,
              parentWays: () => []
            } }
          },
          filters: { isHidden: () => null, filterScene: (entities) => entities, emit: () => {} }
        };
      }
    };
  `
});

// A fake Pathways (iD) global (services/pathways.ts). `#onLoaded` builds a
// coreContext via the fluent `window.iD` API; `init` wires the connection and
// calls `init()`; `#patchEditor` reads `connection().oauthClient.xhr`.
const PATHWAYS_SCRIPT = (route: Route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    (function () {
      var node = null;
      var conn = {
        apiConnections: function () { return conn; },
        switch: function () { return conn; },
        oauthClient: { xhr: function () {} },
        userDetails: function () {}
      };
      var ctx = {
        embed: function () { return ctx; },
        containerNode: function (n) { if (n) { node = n; return ctx; } return node; },
        assetPath: function () { return ctx; },
        setsDocumentTitle: function () { return ctx; },
        connection: function () { return conn; },
        init: function () {
          node.innerHTML =
            '<div class="fake-editor" role="application" aria-label="Pathways editor">Pathways editor</div>';
        },
        reset: function () {}
      };
      window.iD = { coreContext: function () { return ctx; } };
    })();
  `
});

// Stub all three editors' assets so any code path is inert and never 500s.
async function stubAllEditors(page: import('@playwright/test').Page) {
  await page.route('**/rapid/rapid.css', CSS);
  await page.route('**/rapid/rapid.js', RAPID2_SCRIPT);
  await page.route('**/rapid3/css/rapid.css', CSS);
  await page.route('**/rapid3/js/rapid-dev.min.js', RAPID3_SCRIPT);
  await page.route('**/pathways/iD.css', CSS);
  await page.route('**/pathways/iD.js', PATHWAYS_SCRIPT);
}

test.describe('workspace edit (editor host)', () => {
  // @test e2e: loading this page successfully loads the Rapid editor with the workspace data, and shows the editor UI (playwright snapshot this)
  test('loads the Rapid editor and shows the editor UI', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    // Default (no datatype) is the Pathways editor; pass datatype=osw to get Rapid.
    await page.goto('/workspace/1/edit?datatype=osw');

    const editor = page.locator('.editorContainer .fake-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('aria-label', 'Rapid 2 editor');
    await expect(page.locator('.editorContainer')).toMatchAriaSnapshot();
  });

  // @test e2e: loading this page with each value of the "editor" query param (e.g. rapid vs rapid3) loads the correct editor version (playwright snapshot each version's UI)
  test('editor=rapid loads Rapid 2', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=osw&editor=rapid');

    const editor = page.locator('.editorContainer .fake-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('aria-label', 'Rapid 2 editor');
    await expect(page.locator('.editorContainer')).toMatchAriaSnapshot();
  });

  // @test e2e: loading this page with each value of the "editor" query param (e.g. rapid vs rapid3) loads the correct editor version (playwright snapshot each version's UI)
  test('editor=rapid3 loads Rapid 3', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=osw&editor=rapid3');

    const editor = page.locator('.editorContainer .fake-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('aria-label', 'Rapid 3 editor');
    await expect(page.locator('.editorContainer')).toMatchAriaSnapshot();
  });

  // @test e2e: loading this page with the "osw" datatype query param loads the OpenSidewalks editor, and without it loads the Pathways editor (playwright snapshot each editor's UI)
  test('datatype=osw loads the OpenSidewalks (Rapid) editor', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=osw');

    const editor = page.locator('.editorContainer .fake-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('aria-label', 'Rapid 2 editor');
    await expect(page.locator('.editorContainer')).toMatchAriaSnapshot();
  });

  // @test e2e: loading this page with the "osw" datatype query param loads the OpenSidewalks editor, and without it loads the Pathways editor (playwright snapshot each editor's UI)
  test('without datatype loads the Pathways editor', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit');

    const editor = page.locator('.editorContainer .fake-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('aria-label', 'Pathways editor');
    await expect(page.locator('.editorContainer')).toMatchAriaSnapshot();
  });

  // @test e2e: loading this page with editor=rapid3 and a non-osw datatype (e.g. pathways) loads Rapid 3 instead of the Pathways editor (playwright snapshot this)
  test('editor=rapid3 with datatype=pathways loads Rapid 3', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=pathways&editor=rapid3');

    const editor = page.locator('.editorContainer .fake-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('aria-label', 'Rapid 3 editor');
    await expect(page.locator('.editorContainer')).toMatchAriaSnapshot();
  });

  // @test e2e: loading Rapid 3 for a pathways workspace swaps in the GTFS Pathways presets; loading it for an osw workspace keeps the OSM presets
  test('Rapid 3 merges the GTFS Pathways schema for pathways workspaces', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=pathways&editor=rapid3');

    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__schemaMerges ?? []))
      .toEqual(['tdei-pathways-schema']);
  });

  // @test e2e: loading Rapid 3 for a pathways workspace swaps in the GTFS Pathways presets; loading it for an osw workspace keeps the OSM presets
  test('Rapid 3 keeps the OSM schema for osw workspaces', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=osw&editor=rapid3');

    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();
    // #preStart runs after the editor paints; once styles are merged, the schema
    // step (which runs synchronously right after) has had its chance to merge.
    await expect.poll(() => page.evaluate(() => (window as any).__stylesMerged === true)).toBe(true);
    expect(await page.evaluate(() => (window as any).__schemaMerges ?? [])).toEqual([]);
  });

  // @test e2e: Rapid 3 on a pathways workspace marks the editor as GTFS Pathways (hiding Rapid's generic Point/Line/Area/Relation presets, which GTFS has no equivalent for)
  test('hides Rapid\'s generic fallback presets for Rapid 3 on a pathways workspace', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=pathways&editor=rapid3');
    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();

    // Stand-in preset list items, classed the way Rapid classes them.
    await page.locator('.editorContainer .fake-editor').evaluate((editor) => {
      editor.insertAdjacentHTML('beforeend', ['point', 'line', 'area', 'relation', 'platform']
        .map(id => `<div class="preset-list-item preset-${id}">${id}</div>`).join(''));
    });
    for (const id of ['point', 'line', 'area', 'relation']) {
      await expect(page.locator(`.preset-${id}`)).toBeHidden();
    }
    await expect(page.locator('.preset-platform')).toBeVisible();
  });

  // @test e2e: Rapid 3 on a pathways workspace marks the editor as GTFS Pathways (hiding Rapid's generic Point/Line/Area/Relation presets, which GTFS has no equivalent for)
  test('places a tag value\'s label clear of the dropdown arrow', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=pathways&editor=rapid3');
    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();

    // A raw tag editor row as Rapid renders it (no whitespace between elements,
    // as d3 builds it), with the combobox caret styled as Rapid's CSS does: 30px
    // wide, pulled back over the full-width input's right edge.
    await page.locator('.editorContainer .fake-editor').evaluate((editor) => {
      editor.insertAdjacentHTML('beforeend', [
        '<ul style="width: 320px"><li class="tag-row"><div class="inner-wrap" style="display: flex">',
        '<div class="key-wrap" style="flex: 1 1 50%"><input class="key" value="location_type" style="width: 100%"></div>',
        '<div class="value-wrap" style="flex: 1 1 50%">',
        '<input class="value" value="2" style="width: 100%; box-sizing: border-box">',
        '<div class="combobox-caret" style="display: inline-block; position: relative; width: 30px; height: 30px; ',
        'margin-left: -30px; vertical-align: middle"></div>',
        '<span class="gtfs-value-label">Entrance / Exit</span>',
        '</div></div></li></ul>'
      ].join(''));
    });

    const input = (await page.locator('.tag-row input.value').boundingBox())!;
    const label = (await page.locator('.gtfs-value-label').boundingBox())!;
    const caret = (await page.locator('.combobox-caret').boundingBox())!;
    expect(label.width).toBeGreaterThan(0);
    // The arrow sits on the input's line (overlapping it vertically)...
    expect(caret.y).toBeLessThan(input.y + input.height);
    expect(caret.y + caret.height).toBeGreaterThan(input.y);
    // ...and the label ends before it.
    expect(label.x + label.width).toBeLessThanOrEqual(caret.x);
  });

  test('keeps the generic presets for Rapid 3 on an osw workspace', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=osw&editor=rapid3');
    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();

    await page.locator('.editorContainer .fake-editor').evaluate((editor) => {
      editor.insertAdjacentHTML('beforeend', '<div class="preset-list-item preset-point">point</div>');
    });
    await expect(page.locator('.preset-point')).toBeVisible();
  });

  // @test e2e: Rapid 3 on a pathways workspace shows a level panel next to the editor; other editors and datatypes don't
  test('shows the level panel for Rapid 3 on a pathways workspace', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);

    await page.goto('/workspace/1/edit?datatype=pathways&editor=rapid3');

    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();
    const panel = page.getByRole('complementary', { name: 'Stations' });
    await expect(panel).toBeVisible();
    await expect(panel).toMatchAriaSnapshot();
  });

  // @test e2e: Rapid 3 on a pathways workspace shows a level panel next to the editor; other editors and datatypes don't
  for (const query of ['datatype=osw&editor=rapid3', 'datatype=osw', 'datatype=pathways']) {
    test(`does not show the level panel for ${query}`, async ({ page }) => {
      await seedAuthenticatedSession(page);
      await stubAllEditors(page);

      await page.goto(`/workspace/1/edit?${query}`);

      await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Stations' })).toHaveCount(0);
    });
  }

  // @test e2e: while the editor is loading, the page shows a loading spinner over the editor area; it goes away once the editor has started
  for (const [query, script, fake] of [
    ['datatype=osw', '**/rapid/rapid.js', RAPID2_SCRIPT],
    ['datatype=pathways&editor=rapid3', '**/rapid3/js/rapid-dev.min.js', RAPID3_SCRIPT],
    ['datatype=pathways', '**/pathways/iD.js', PATHWAYS_SCRIPT]
  ] as const) {
    test(`shows a loading spinner until the editor has started (${query})`, async ({ page }) => {
      await seedAuthenticatedSession(page);
      await stubAllEditors(page);

      // Hold the editor's script back so the page stays loading until released.
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(script, async (route) => {
        await held;
        await fake(route);
      });

      // Don't wait for `load`: the held script could hold it back until released.
      await page.goto(`/workspace/1/edit?${query}`, { waitUntil: 'domcontentloaded' });

      const loading = page.locator('.edit-page .editor-loading');
      await expect(loading.getByRole('status')).toBeVisible();
      await expect(loading).toContainText('Loading the editor');

      release();

      await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();
      await expect(loading).toHaveCount(0);
    });
  }

  // @test e2e: leaving this page and coming back while the editor is still starting shows the spinner again until it has started
  test('shows the spinner again on coming back while the editor is still starting', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);
    await page.addInitScript(() => {
      (window as any).__holdEditorInit = new Promise((resolve) => {
        (window as any).__releaseEditorInit = resolve;
      });
    });

    await page.goto('/workspace/1/edit?datatype=osw');
    const loading = page.locator('.edit-page .editor-loading');
    await expect(loading.getByRole('status')).toBeVisible();

    // Leave for another workspace's editor in the app (no reload), while the editor is still starting.
    await page.evaluate(() => (document.querySelector('#__nuxt') as any).__vue_app__
      .config.globalProperties.$router.push('/workspace/2/edit?datatype=osw'));
    await expect(page).toHaveURL(/\/workspace\/2\/edit/);
    // The new page has mounted once it has switched the editor to workspace 2.
    await expect.poll(() => page.evaluate(() => (window as any).__fakeRapidContext?.workspaceId)).toBe(2);
    await expect(page.locator('.edit-page')).toHaveCount(1);
    await expect(loading.getByRole('status')).toBeVisible();

    await page.evaluate(() => (window as any).__releaseEditorInit());

    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();
    await expect(loading).toHaveCount(0);
  });

  // @test e2e: if the editor fails to start, the page says so in place of the spinner
  test('says so when the editor fails to start', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);
    await page.addInitScript(() => {
      (window as any).__failEditorInit = true;
    });

    await page.goto('/workspace/1/edit?datatype=osw');

    const loading = page.locator('.edit-page .editor-loading');
    await expect(loading.getByRole('alert')).toHaveText(/The editor couldn't start/);
    await expect(loading.getByRole('status')).toHaveCount(0);
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  test('all API calls conform to the OpenAPI spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);
    const contract = recordContract(page);

    await page.goto('/workspace/1/edit?datatype=osw');
    await expect(page.locator('.editorContainer .fake-editor')).toBeVisible();

    expect(contract.violations()).toEqual([]);
  });
});

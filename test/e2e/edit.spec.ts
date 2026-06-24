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
// The page itself makes NO new-API (api.test/workspaces/...) calls — it reads
// the workspace id straight off the route — so the contract test should see an
// empty violation list.

type Route = import('@playwright/test').Route;

const CSS = (route: Route) => route.fulfill({ body: '', contentType: 'text/css' });

// A fake Rapid 2 global (services/rapid.ts). `#onLoaded` does `new Rapid.Context()`
// then sets containerNode/assetPath; `init` sets workspaceId/tdeiAuth/preauth,
// awaits `initAsync()`, then `#patchRapid` reads `services.osm._oauth`.
const RAPID2_SCRIPT = (route: Route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    window.Rapid = {
      Context: class {
        embed() {}
        async initAsync() {
          this.containerNode.innerHTML =
            '<div class="fake-editor" role="application" aria-label="Rapid 2 editor">Rapid 2 editor</div>';
        }
        services = { osm: { _oauth: { fetch: () => {}, authenticated: () => true }, userDetails: () => {} } };
      }
    };
  `
});

// A fake Rapid 3 global (services/rapid3.ts). `#onRapidLoaded` checks
// `Rapid.utilDetect().support`, builds a Context, calls `prepareAsync()` then
// flips loaded; `init` runs `initAsync().then(patch).then(startAsync)`.
const RAPID3_SCRIPT = (route: Route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    window.Rapid = {
      utilDetect: () => ({ support: true }),
      Context: class {
        embed() {}
        async prepareAsync() {}
        async initAsync() {
          this.containerNode.innerHTML =
            '<div class="fake-editor" role="application" aria-label="Rapid 3 editor">Rapid 3 editor</div>';
        }
        async startAsync() {}
        services = { osm: { _oauth: { fetch: () => {}, authenticated: () => true }, userDetails: () => {} } };
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
  await page.route('**/rapid3/js/rapid-dev.js', RAPID3_SCRIPT);
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

  // @test e2e (disable this test for now): if the editor fails to load, an error message is shown (playwright snapshot this)
  // Disabled per the page outline: the page has no editor-load-failure UI yet.
  test.fixme('shows an error message when the editor fails to load', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubAllEditors(page);
    // Make the chosen editor's script fail to load.
    await page.unroute('**/rapid/rapid.js');
    await page.route('**/rapid/rapid.js', route => route.abort());

    await page.goto('/workspace/1/edit?datatype=osw&editor=rapid');

    // The page should surface a user-facing error when the editor can't load.
    const error = page.getByText(/fail|error|could ?n.t|unable/i);
    await expect(error).toBeVisible();
    await expect(page.locator('.editorContainer')).toMatchAriaSnapshot();
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

# CLAUDE.md

Guidance for working in this repo. Focused on the test infrastructure and
conventions established for it; see `README.md` for app setup.

## Project

- **TDEI Workspaces frontend** — Nuxt 4 / Vue 3 **SPA** (`ssr: false`),
  bootstrap-vue-next UI, maplibre-gl + Leaflet maps.
- API access is via class-based HTTP clients in `services/` (all extend
  `BaseHttpClient` in [services/http.ts](services/http.ts), which wraps `fetch`).
  Clients are constructed in [services/index.ts](services/index.ts) from
  `import.meta.env.VITE_*` URLs.
- Types in `types/`; the workspace API shapes mirror the backend OpenAPI spec
  (integer `id`, `title` not `name`, uuid `tdeiProjectGroupId`, etc.).

## Testing

Stack: **Vitest** (unit) + **Playwright** (e2e) + **MSW** (shared API stubs) +
an **OpenAPI contract validator**. Config: [vitest.config.ts](vitest.config.ts),
[playwright.config.ts](playwright.config.ts).

### Run

```bash
./run-tests.sh            # eslint (test/ only) + unit + e2e
./run-tests.sh unit       # vitest only
./run-tests.sh e2e        # playwright only
./run-tests.sh --update-snapshots   # extra args pass through to playwright
```

The e2e suite **intentionally has failing tests** that document real app bugs —
see [ISSUES.md](ISSUES.md). A non-zero exit on a full run is expected. Unit is
always green.

### Layout

```
test/
  setup.ts                 # MSW server lifecycle for vitest
  mocks/
    fixtures.ts            # canned API data — SINGLE SOURCE OF TRUTH (spec-shaped)
    handlers.ts            # MSW http handlers (vitest)
    server.ts              # setupServer(...handlers)
  contract/openapi.json    # vendored backend OpenAPI spec
  unit/                    # vitest: services/ + util/ (default env happy-dom)
  e2e/
    fixtures.ts            # Playwright test fixture + seed helpers
    contract.ts            # recordContract(page) -> OpenAPI validator
    *.spec.ts              # one per page; *.aria.yml + *.png snapshots alongside
```

### Conventions

- **Unit tests** default to the **happy-dom** environment (several `services/`
  modules construct `DOMParser`/`XMLSerializer` at import time; bare node lacks
  them). A test can opt into the full Nuxt env with `// @vitest-environment nuxt`.
- **e2e auth/stubs:** import from `./fixtures` — `test`, `expect`,
  `seedAuthenticatedSession(page)` (call FIRST for any authed page; user is
  "Tester"/`USER_ID`), `seedProjectGroupSelection(page, {id, name})`. Import
  canned data + ids (`aWorkspace`, `myWorkspaces`, `projectGroups`,
  `PROJECT_GROUP_ID`, `USER_ID`, `TEST_API_BASE`) from `../mocks/fixtures`.
- **API stubbing:** in e2e ALL API base URLs point at host `http://api.test/`
  (set in `playwright.config.ts` `webServer.env`). Stub **every** endpoint a page
  hits or the page 500s on the failed fetch. New-API response bodies **must be
  spec-conformant** (the contract validator checks them).
- **Contract testing:** for a page's "validate API calls match the Swagger spec"
  outline, `const c = recordContract(page)` before navigating, drive the page,
  then `expect(c.violations()).toEqual([])`. Only `api.test` new-API calls are
  checked (TDEI/OSM hosts are out of spec scope).
- **Snapshots:** use **ARIA** snapshots (`toMatchAriaSnapshot()`), not pixel
  screenshots — they're text-based and cross-platform stable. Don't snapshot
  volatile content (blob URLs, transient toasts). Regenerate with
  `--update-snapshots`.
- **Lint:** the stylistic config requires **semicolons** and **no trailing
  commas** (set in `nuxt.config.ts` `eslint.config.stylistic`). New code must
  comply. App source has a large pre-existing backlog of other lint errors, so
  `run-tests.sh` lints `test/` only.

### The `@test` comment workflow

Pages carry `@test e2e:` / `@test unit:` outline comments at the top describing
intended behavior. Tests are generated **to the comment (the spec), not the
current code** — if the code diverges, the test is left RED to document the bug
(see ISSUES.md). Don't soften assertions to make buggy code pass.

## Gotchas (learned the hard way)

- **OSM URLs include `/api/0.6/`.** The OSM client base is
  `http://api.test/osm/api/0.6/`. Route globs must be e.g.
  `**/osm/api/0.6/changesets.json**`. Also: glob `*` matches a single path
  segment, so `**/osm/changeset/*/upload` will NOT match
  `osm/api/0.6/changeset/777/upload`.
- **`DatasetTypeRadio` is a Bootstrap `.btn-check`** (hidden `<input>` + visible
  `<label>`). `.check()` times out — click the label text instead
  (`getByText('GTFS Pathways').click()`).
- **`app-icon` renders material-icon ligature text** (e.g. "menu_book") into
  element text/accessible names. Match headings/buttons by regex name or stable
  class/href, not exact accessible name.
- **Playwright `getByRole({ name })` is substring/normalized** unless
  `exact: true`. "Delete this workspace" also matches "...want to delete this
  workspace" — anchor or use `exact: true`.
- **`selectOption` needs a string/value/index**, not a regex object.
- **maplibre-gl needs WebGL**, unreliable headless. Pages with a map: stub the
  bbox/data endpoints empty so the map shows its empty state instead of
  initializing; assert DOM, not the GL canvas. The dashboard auto-selects a
  workspace when a project group has workspaces (→ mounts the map), so the
  empty-state tests use empty `workspaces/mine`.
- **Nuxt dev server compiles routes lazily**, so cold parallel hits can be slow;
  `playwright.config.ts` sets a 10s `expect` timeout to absorb it. Run e2e
  against a production build if you want pre-compiled routes.
- **Playwright route precedence is most-recently-registered-first** — register
  per-test override routes AFTER (or in a way that wins over) shared stub helpers.

## Permission Structure

Project Group Admin ("POC")
* Superuser for the whole project group
* Implied by "poc" role in TDEI

Lead/Owner/Workspace Admin
* Admin-level access for a workspace
* Configures workspace settings and quest definitions
* Assigns users to workspace teams
* Ability to merge changes from other workspace
* Exports data to TDEI (with appropriate TDEI core roles)
* Granted by Workspaces setting.

Contributor/Data Generator
* Modifies workspace data--all modifications need validation
* Implied by membership in TDEI project group

Validator
* Modifies workspace data and approves changes from contributors
* Granted by Workspaces setting.

Viewer/Member/Everyone Else
* Read-only access to workspace data
* With express TDEI sign-up, the need for this access level diminishes greatly
* Granted by Workspaces setting.

## Known app bugs

Tracked in [ISSUES.md](ISSUES.md) — surfaced by the e2e suite (write-to-spec
tests). Currently 9 distinct app bugs plus 2 outline/spec mismatches across the
97-test e2e suite. The 6 skipped are `test.fixme` dashboard flows blocked by
maplibre/external-editor rendering. Some heavy authed pages (e.g.
`settings/members`) flake under high parallelism — run serially (`--workers=1`)
for deterministic results.

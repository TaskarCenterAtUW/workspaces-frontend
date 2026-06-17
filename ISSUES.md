# Known Issues

Bugs surfaced by the e2e suite. Each test was written to the `@test` outline
comment (the intended behavior) rather than to the current code, so these
failures document real divergences between intent and implementation.

As of the latest run: **7 distinct bugs across 11 failing e2e tests** (60 pass,
6 skipped). Run `./run-tests.sh e2e` to reproduce.

---

## 1. Blank-workspace create has no error handling

**Page:** [pages/workspace/create/blank.vue](pages/workspace/create/blank.vue#L62-L76)
**Tests:** `create-blank.spec.ts:135`, `create-index.spec.ts:253`

`create()` calls `creating.wrap(...)` and then unconditionally
`navigateTo('/dashboard')`. It uses a bare `LoadingContext`
([services/loading.ts:31-38](services/loading.ts#L31-L38)), which has no `error`
or `reset` members and whose `wrap()` rethrows. So on a failed create there is
**no error message, no "Try again" button, and no form reset** — the rejection
just propagates and the redirect never runs.

**Repro:** Go to `/workspace/create/blank`, fill the form, and submit while the
`POST /workspaces` call fails (500). Expected: an error message + "Try again".
Actual: nothing user-facing; the page stays put.

**Fix direction:** Adopt the richer importer-context pattern used by the
file/tdei forms (error state + retry), or add explicit try/catch + error UI.

---

## 2. Create "Try again" does not reset the form fields

**Pages:** [pages/workspace/create/file.vue](pages/workspace/create/file.vue), [pages/workspace/create/tdei.vue](pages/workspace/create/tdei.vue)
**Tests:** `create-file.spec.ts:179`, `create-index.spec.ts:211`

The file/tdei forms *do* render an error + "Try again" on failure, but the
context's `reset()` only clears the import status/error — it does **not** clear
`workspaceTitle` / `projectGroupId` / `datasetType` / `datasetFile`. After
"Try again", the previously entered values remain.

**Repro:** On `/workspace/create/file`, fill the form, submit with `POST
/workspaces` failing, click "Try again". Expected: form fields cleared. Actual:
`Workspace Title` still contains the prior value.

**Fix direction:** Have `reset()` (or the "Try again" handler) also clear the
form field refs.

> Note: `create-index.spec.ts:211` exercises this same bug via the landing page
> and is mildly timing-flaky; `create-file.spec.ts:179` is the stable signal.

---

## 3. File create: wrong file type shows no error

**Page:** [pages/workspace/create/file.vue](pages/workspace/create/file.vue#L105)
**Test:** `create-file.spec.ts:139`

The `complete` computed only checks `datasetFile.name.endsWith('.zip')`, so a
non-zip upload leaves the Create button disabled — but **no error message** is
shown explaining why. The user gets no feedback that the file type is wrong.

**Repro:** On `/workspace/create/file`, upload a `.txt` file. Expected: a
validation/error message. Actual: silently disabled Create button, no message.

**Fix direction:** Surface a validation message for unsupported file types.

---

## 4. Editor page shows no error when the editor fails to load

**Page:** [pages/workspace/[id]/edit.vue](pages/workspace/[id]/edit.vue#L8-L52)
**Test:** `edit.spec.ts:179`

The template is only the editor container; `onMounted` calls `manager.load()`
and watches `manager.loaded`, but there is **no error ref, no catch, no script
`onerror` handling, and no error element**. If the editor asset fails to load,
`manager.loaded` never flips and the user sees a blank `<main>` with no
indication anything went wrong.

**Repro:** Load `/workspace/1/edit` with the RapID/iD editor script failing to
load. Expected: an error message. Actual: blank screen.

**Fix direction:** Add an `onerror`/timeout path that sets an error state and
renders a message.

---

## 5. Download errors are silent (no error toast)

**Page:** [pages/workspace/[id]/export/index.vue](pages/workspace/[id]/export/index.vue#L117-L128)
**Test:** `export-index.spec.ts:148`

`download()` calls `downloading.wrap(...)` **without `await`** inside its
`try`/`catch`. `LoadingContext.wrap` is async and propagates the error as a
rejected promise; because the call isn't awaited, the rejection escapes the
synchronous `catch` as an unhandled rejection and
`toast.error('Error preparing download: ...')` never fires. Download-prep
failures are invisible to the user.

**Repro:** On `/workspace/1/export`, click "Start Preparing File for Download"
with the underlying OSM data fetch failing. Expected: an error toast. Actual:
no toast; failure swallowed.

**Fix direction:** `await downloading.wrap(...)` inside the `try` (or move the
try/catch inside the wrap callback).

---

## 6. Export-to-TDEI has no required-field validation

**Page:** [pages/workspace/[id]/export/tdei.vue](pages/workspace/[id]/export/tdei.vue#L167-L188)
**Test:** `export-tdei.spec.ts:288`

`upload()` builds the metadata and calls `exporter.upload()` directly with no
check that `datasetName` / `datasetVersion` (and the pickers) are non-empty, and
the template renders no "all fields are required" message. Submitting with blank
fields just starts the export.

**Repro:** On `/workspace/1/export/tdei`, clear the fields and submit. Expected:
an "all fields are required" message. Actual: the export proceeds.

**Fix direction:** Validate required fields before `upload()` and show a message.

---

## 7. Settings "saved" confirmations are inline text, not toasts

**Panels:** [components/settings/panel/Apps.vue:263](components/settings/panel/Apps.vue#L263), [components/settings/panel/Imagery.vue:135](components/settings/panel/Imagery.vue#L135)
**Tests:** `settings.spec.ts:162` (unpublish), `settings.spec.ts:210` (publish), `settings.spec.ts:259` (imagery)

The External Apps and Custom Imagery panels confirm a successful save with an
inline `form-text` status (`"Changes saved."`) rather than a toast. The `@test`
outlines specify a toast/confirmation consistent with the rename flow (General
panel, which *does* use `vue3-toastify`).

**Repro:** In `/workspace/1/settings`, toggle "Publish this workspace" (or edit
Custom Imagery) and Save. Expected: a confirmation toast. Actual: inline status
text only.

**Fix direction:** Use `vue3-toastify` for these confirmations (as General
does), or standardize on one mechanism.

> Secondary: the Apps "Publish this workspace" checkbox binds
> `:true-value="1" :false-value="0"`, so a workspace with `externalAppAccess: 2`
> renders **unchecked**. Worth confirming the access-level → checkbox mapping.

---

## 8. Delete confirmation attestation string — RESOLVED

The delete confirmation requires typing the literal string `"delete"`
([Delete.vue:43](components/settings/panel/Delete.vue#L43)). This was accepted as
the intended behavior, and `settings.spec.ts:291` now matches it (types
`"delete"`). The test passes.

> Note: the `@test` outline comment in
> [pages/workspace/[id]/settings.vue](pages/workspace/[id]/settings.vue) still
> says "type in the workspace name" — update that comment to match if you want
> the spec source to agree with the implementation.

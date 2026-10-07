import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { mergeWorkspaceA, mergeWorkspaceB, projectGroups } from '../mocks/fixtures';

import type { Page } from '@playwright/test';

// Generated from the @test outline in pages/workspace/[id]/merge/index.vue.
//
// The page does three top-level awaits before it renders, and all three MUST be
// stubbed or it 500s on the failed fetch:
//   1. workspacesClient.getWorkspace(id)      -> GET workspaces/{id}
//   2. merger.getMergeTargets()               -> GET workspaces/mine
//   3. tdeiUserClient.getMyProjectGroups(...) -> GET tdei-user/project-group-roles/{subject}
//
// `mergeWorkspaceA`/`B` are the fixture pair that is eligible for each other;
// see the note on them in test/mocks/fixtures.ts.
//
// CONVENTION: tests are written to the @test comments (intended behavior). Where
// the code diverges, the test is left to FAIL (red) and the divergence is noted.

const MERGE_URL = '/workspace/1/merge';

async function stubMergePage(page: Page, overrides: { workspace?: object; mine?: object[] } = {}) {
  await page.route('**/api.test/workspaces/1', route =>
    route.fulfill({ json: { ...mergeWorkspaceA, ...overrides.workspace } })
  );

  await page.route('**/api.test/workspaces/mine', route =>
    route.fulfill({ json: overrides.mine ?? [mergeWorkspaceA, mergeWorkspaceB] })
  );

  await page.route('**/tdei-user/project-group-roles/**', route =>
    route.fulfill({ json: projectGroups })
  );

  await page.route('**/api.test/workspaces/check', route =>
    route.fulfill({ json: { available: true } })
  );
}

test.describe('workspace merge page', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
  });

  // @test e2e: loading this page as a workspace owner shows a form listing the workspaces
  //            eligible to merge with this one (playwright snapshot this)
  test('an owner sees the merge form listing eligible targets', async ({ page }) => {
    await stubMergePage(page);
    await page.goto(MERGE_URL);

    await expect(page.getByRole('heading', { name: 'Merge Workspace' })).toBeVisible();
    await expect(page.getByText('Only workspace owners can merge')).toHaveCount(0);

    const target = page.getByLabel(/Merge workspace/);
    await expect(target).toBeVisible();
    await expect(target.locator('option')).toHaveText(['Seattle Sidewalks (survey)']);
    await expect(page.locator('.merge-page')).toMatchAriaSnapshot();
  });

  // @test e2e: loading this page as a non-owner shows the "only workspace owners can merge"
  //            warning and leaves the Merge button disabled (assert() the button is disabled)
  test('a non-owner sees the warning and a disabled Merge button', async ({ page }) => {
    await stubMergePage(page, { workspace: { role: 'contributor' } });
    await page.goto(MERGE_URL);

    await expect(page.getByText('Only workspace owners can merge workspaces.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Merge/ })).toBeDisabled();
  });

  // @test e2e: a workspace with no eligible merge targets shows the "no existing workspaces
  //            will merge" panel with a link back to the dashboard (playwright snapshot this)
  test('no eligible targets shows the explanation and a way back', async ({ page }) => {
    await stubMergePage(page, { mine: [mergeWorkspaceA] });
    await page.goto(MERGE_URL);

    await expect(page.getByText(/No existing workspaces will merge with/)).toBeVisible();
    // The control is an `<a href>` that bootstrap-vue-next also stamps with
    // `role="button"`, so ARIA reports it as a button. Assert the destination
    // rather than the presence: "a way back" means it actually goes back.
    const back = page.getByRole('button', { name: 'Return to Dashboard' });

    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/dashboard');
    await expect(page.locator('.merge-page')).toMatchAriaSnapshot();
  });

  // Not an outline item: pins the guard in ThreeWayWorkspaceMerger#isEligibleWorkspace.
  // Two workspaces that both lack a dataset id have no shared import, so they are
  // unrelated rather than matching.
  test('a workspace with no dataset id offers no targets', async ({ page }) => {
    await stubMergePage(page, {
      workspace: { tdeiRecordId: null },
      mine: [
        { ...mergeWorkspaceA, tdeiRecordId: null },
        { ...mergeWorkspaceB, tdeiRecordId: null }
      ]
    });
    await page.goto(MERGE_URL);

    await expect(page.getByText(/No existing workspaces will merge with/)).toBeVisible();
  });

  // @test e2e: the project group picker offers only the workspace's own project group, so a
  //            merge cannot relocate data into another tenant (assert() the options list has
  //            exactly one entry)
  test('the project group picker is constrained to the workspace own project group', async ({ page }) => {
    await stubMergePage(page);
    // Registered last so it wins: route precedence is most-recently-registered-first.
    await page.route('**/tdei-user/project-group-roles/**', route =>
      route.fulfill({
        json: [
          ...projectGroups,
          {
            tdei_project_group_id: '99999999-9999-4999-8999-999999999999',
            project_group_name: 'Unrelated Tenant',
            roles: ['poc']
          }
        ]
      })
    );
    await page.goto(MERGE_URL);

    await page.getByLabel('Project Group').click();

    await expect(page.locator('.pg-dropdown li')).toHaveText(['Puget Sound']);
  });

  // @test e2e: entering a title already used in the project group shows the "not available"
  //            hint and leaves Merge disabled (assert() this)
  test('a duplicate title blocks the merge', async ({ page }) => {
    await stubMergePage(page);
    await page.route('**/api.test/workspaces/check', route =>
      route.fulfill({ json: { available: false } })
    );
    await page.goto(MERGE_URL);

    await page.getByLabel('Merged Workspace Title').fill('Taken name');

    await expect(page.getByText(/already exists in this project group/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Merge/ })).toBeDisabled();
  });

  // @test e2e: a failing merge shows an error toast and re-enables the Merge button rather
  //            than failing silently (assert() the toast text)
  test('a failing merge surfaces an error instead of failing silently', async ({ page }) => {
    await stubMergePage(page);

    // merge() reads both workspaces and their common ancestor in parallel and
    // reports whichever request rejects first, so failing every read with the
    // same body is what makes the toast text deterministic.
    const unavailable = { status: 500, json: { detail: 'workspace data unavailable' } };

    await page.route('**/workspaces/*/bbox', route => route.fulfill(unavailable));
    await page.route('**/osm/**', route => route.fulfill(unavailable));

    await page.goto(MERGE_URL);
    await page.getByLabel(/Merge workspace/).selectOption({ index: 0 });

    const mergeButton = page.getByRole('button', { name: /Merge/ });
    await mergeButton.click();

    await expect(page.locator('.Toastify__toast--error'))
      .toContainText('workspace data unavailable');
    await expect(mergeButton).toBeEnabled();
  });

  // @test e2e: the form warns that the merged workspace will not be linked to a TDEI dataset,
  //            and for a GTFS Pathways workspace that it then cannot be exported to TDEI
  //            (assert() the warning text for each type)
  test('the form warns that the merged workspace loses its TDEI dataset link', async ({ page }) => {
    await stubMergePage(page);
    await page.goto(MERGE_URL);

    await expect(page.getByText('will not be linked to a TDEI dataset, so exporting it publishes a new dataset'))
      .toBeVisible();
    await expect(page.getByText('cannot be exported to TDEI')).toHaveCount(0);
  });

  test('the warning tells a GTFS Pathways owner the merge cannot be exported', async ({ page }) => {
    await stubMergePage(page, {
      workspace: { type: 'pathways' },
      mine: [{ ...mergeWorkspaceA, type: 'pathways' }, { ...mergeWorkspaceB, type: 'pathways' }]
    });
    await page.goto(MERGE_URL);

    await expect(page.getByText('cannot be exported to TDEI. Export this data before merging'))
      .toBeVisible();
    await expect(page.getByText('publishes a new dataset')).toHaveCount(0);
  });

  // @test e2e: merging two workspaces with no conflicts commits the merge and navigates to the
  //            new workspace's editor, centred on the merged data (assert() the URL)
  test('a merge with no conflicts commits and opens the new workspace', async ({ page }) => {
    await stubMergePage(page);

    // Both workspaces still hold the import untouched (version 1), so the
    // three-way merge settles everything and reports no conflicts.
    const imported = {
      id: 1,
      type: 'node',
      lat: 47.6,
      lon: -122.35,
      version: 1,
      changeset: 1,
      timestamp: '2026-01-01T00:00:00Z',
      user: 'tester',
      uid: 7,
      tags: {}
    };

    await page.route('**/workspaces/*/bbox', route =>
      route.fulfill({ json: { min_lon: -122.4, min_lat: 47.6, max_lon: -122.3, max_lat: 47.7 } })
    );
    await page.route('**/osm/**/map.json**', route =>
      route.fulfill({ json: { elements: [imported] } })
    );
    await page.route('**/osm/**/changesets.json**', route =>
      route.fulfill({
        json: {
          changesets: [
            { id: 1, created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:01:00Z' }
          ]
        }
      })
    );
    await page.route('**/osm/**/changeset/1/download**', route =>
      route.fulfill({
        contentType: 'application/xml',
        body: `<osmChange version="0.6"><create>
          <node id="1" lat="47.60" lon="-122.35" version="1" changeset="1"
                timestamp="2026-01-01T00:00:00Z" user="tester" uid="7"/>
        </create></osmChange>`
      })
    );

    await page.route('**/api.test/workspaces', route =>
      route.fulfill({ status: 201, json: { workspaceId: 99 } })
    );
    await page.route('**/osm/**/workspaces/99', route => route.fulfill({ status: 200, body: '' }));
    await page.route('**/osm/**/changeset/create**', route =>
      route.fulfill({ status: 200, body: '777' })
    );
    await page.route('**/osm/**/changeset/777/upload**', route =>
      route.fulfill({ status: 200, body: '<diffResult/>' })
    );
    await page.route('**/osm/**/changeset/777/close**', route =>
      route.fulfill({ status: 200, body: '' })
    );

    await page.goto(MERGE_URL);
    await page.getByLabel(/Merge workspace/).selectOption({ index: 0 });
    await page.getByRole('button', { name: /Merge/ }).click();

    // `datatype` decides which editor loads, and without it the Pathways
    // editor loads, so the path alone would not show the right editor opened.
    await expect(page).toHaveURL(/\/workspace\/99\/edit\?datatype=osw/);

    // Without a position the editor opens wherever it was last left, not on
    // the merged data. The only node is at 47.6, -122.35:
    await expect(page).toHaveURL(/#map=16\/47\.6\/-122\.35$/);
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  test('the API calls match the Swagger spec', async ({ page }) => {
    // The title-availability check is not in the vendored spec, so it matches
    // GET /workspaces/{workspace_id} and reports a bogus method violation. The
    // create specs ignore it for the same reason.
    const contract = recordContract(page, { ignoredPaths: ['workspaces/check'] });

    await stubMergePage(page);
    await page.goto(MERGE_URL);
    await expect(page.getByRole('heading', { name: 'Merge Workspace' })).toBeVisible();

    expect(contract.violations()).toEqual([]);
  });
});

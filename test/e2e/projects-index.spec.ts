import { test, expect, seedAuthenticatedSession } from './fixtures';
import {
  aWorkspace,
  projectGroups,
} from '../mocks/fixtures';

const emptyProjects = {
  results: [],
  pagination: {
    page: 1,
    page_size: 10,
    total: 0,
  },
};

test.describe('workspace projects', () => {
  test('finishes navigation and offers retries when API requests fail', async ({ page }) => {
    let workspaceRequests = 0;
    let projectRequests = 0;

    await seedAuthenticatedSession(page);
    await page.route('**/workspaces/1', (route) => {
      workspaceRequests++;

      if (workspaceRequests === 1) {
        return route.abort('internetdisconnected');
      }

      return route.fulfill({ json: aWorkspace });
    });
    await page.route('**/project-group-roles/**', route =>
      route.fulfill({ json: projectGroups }),
    );
    await page.route('**/workspaces/1/tasking/projects?**', (route) => {
      projectRequests++;

      if (projectRequests === 1) {
        return route.abort('internetdisconnected');
      }

      return route.fulfill({ json: emptyProjects });
    });

    await page.goto('/workspace/1/projects');

    await expect(page).toHaveURL(/\/workspace\/1\/projects$/);
    await expect(page.getByRole('heading', { name: 'Unable to load projects' })).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('heading', { name: 'Seattle Sidewalks > Projects' })).toBeVisible();
    const projectsError = page.getByRole('alert').filter({ hasText: 'Unable to load projects.' });
    await expect(projectsError).toBeVisible();

    await projectsError.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByText('No projects match these filters.')).toBeVisible();
    expect(workspaceRequests).toBe(2);
    expect(projectRequests).toBe(2);
  });
});

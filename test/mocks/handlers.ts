import { http, HttpResponse } from 'msw';
import { TEST_API_BASE, myWorkspaces } from './fixtures';

// Default ("happy path") MSW handlers used by the Vitest suite. Individual
// tests can override any of these per-test with `server.use(...)` to simulate
// errors, empty states, etc.
export const handlers = [
  http.get(`${TEST_API_BASE}workspaces/mine`, () => {
    return HttpResponse.json(myWorkspaces);
  })
];

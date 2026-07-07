import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// Start MSW before the suite, reset any per-test overrides between tests, and
// tear it down at the end. `onUnhandledRequest: 'error'` makes an un-stubbed
// network call fail loudly instead of hitting the real backend.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// MSW server used in the node (Vitest) environment. Lifecycle is wired in
// test/setup.ts so every unit test gets a clean handler set.
export const server = setupServer(...handlers);

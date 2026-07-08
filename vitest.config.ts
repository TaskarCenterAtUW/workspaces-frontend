import { fileURLToPath } from 'node:url';
import { defineVitestConfig } from '@nuxt/test-utils/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// Unit tests for `services/` and `util/` default to happy-dom: several modules
// in the dependency graph (e.g. util/xml.ts) construct DOMParser/XMLSerializer
// at import time, which a bare node environment lacks. happy-dom is still fast
// and headless. A component/composable test can opt into the full Nuxt
// environment per-file with a top-of-file comment:
//
//   // @vitest-environment nuxt
//
export default defineVitestConfig({
  resolve: {
    alias: {
      '~': rootDir,
      '@': rootDir
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    // Keep Playwright's *.spec.ts E2E files out of the Vitest run.
    include: ['test/unit/**/*.{test,spec}.ts']
  }
});

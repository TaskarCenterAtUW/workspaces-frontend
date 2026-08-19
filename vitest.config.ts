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
    include: ['test/unit/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      // text -> printed to the CI log; json-summary -> parsed into the GitHub
      // run summary; html -> uploaded as a browsable artifact.
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Scope to the code the unit suite actually exercises. Pages/components are
      // covered by the Playwright e2e suite (not instrumented here), so including
      // them would report a misleadingly low unit-coverage number.
      include: ['services/**', 'util/**']
    }
  }
});

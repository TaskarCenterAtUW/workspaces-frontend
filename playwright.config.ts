import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Dummy API endpoints for E2E. The app's HTTP clients read these at build/load
// time (services/index.ts → import.meta.env.VITE_*). Pointing them at the
// `api.test` host means every API call is interceptable by page.route() and
// can never reach a real backend. See test/e2e/fixtures.ts.
const E2E_ENV = {
  VITE_API_URL: 'http://api.test/',
  VITE_NEW_API_URL: 'http://api.test/',
  VITE_TDEI_API_URL: 'http://api.test/tdei/',
  VITE_TDEI_USER_API_URL: 'http://api.test/tdei-user/',
  VITE_TDEI_REGISTER_URL: 'https://portal.test/register',
  VITE_TDEI_FORGOT_PASSWORD_URL: 'https://portal.test/ForgotPassword',
  VITE_OSM_URL: 'http://api.test/osm/',
  VITE_RAPID_URL: 'http://api.test/rapid/',
  VITE_RAPID3_URL: 'http://api.test/rapid3/',
  VITE_PATHWAYS_EDITOR_URL: 'http://api.test/pathways/',
  VITE_IMAGERY_SCHEMA: 'http://api.test/imagery-schema.json',
  VITE_IMAGERY_EXAMPLE_URL: 'http://api.test/imagery-example',
  VITE_LONG_FORM_QUEST_SCHEMA: 'http://api.test/quest-schema.json',
  VITE_LONG_FORM_QUEST_EXAMPLE_URL: 'http://api.test/quest-example'
};

// Serve a production build (pre-compiled routes) for coverage and CI runs so the
// Nuxt dev server's lazy per-route compilation can't cause cold-start timeouts.
// Plain local `npm run test:e2e` keeps the fast dev server.
const usePreview = !!process.env.CI || !!process.env.COVERAGE;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // In CI: 'github' annotates the Actions log, and 'html' writes the
  // playwright-report/ dir that the CI workflow uploads as an artifact.
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',
  // The Nuxt dev server compiles routes lazily on first hit, so a cold parallel
  // request can take several seconds to render. A roomy expect timeout absorbs
  // that without masking real failures. (Run E2E against `nuxt build && preview`
  // instead if you want production-fast, fully pre-compiled routes.)
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 }
  },
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    // build && preview pre-compiles every route (no lazy dev compile). The
    // VITE_* env is baked at build time, so E2E_ENV must be present for `build`,
    // not just `preview` — webServer.env covers the whole command.
    command: usePreview ? 'npm run build && npm run preview' : 'npm run dev',
    url: baseURL,
    // A fresh, deterministic server for coverage/CI; reuse a running dev server
    // only for plain local iteration.
    reuseExistingServer: !process.env.CI && !process.env.COVERAGE,
    // The production build adds startup time before the server is reachable.
    timeout: usePreview ? 240_000 : 120_000,
    // Forward COVERAGE so nuxt.config.ts loads vite-plugin-istanbul and the build
    // is instrumented. PORT pins nuxt preview to the port baseURL expects.
    env: {
      ...E2E_ENV,
      ENV: 'local',
      PORT: String(PORT),
      ...(process.env.COVERAGE ? { COVERAGE: process.env.COVERAGE } : {})
    }
  }
});

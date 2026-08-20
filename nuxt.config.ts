import istanbul from 'vite-plugin-istanbul';

// Only instrument the client bundle for coverage when COVERAGE is set (the e2e
// coverage run sets it via playwright.config.ts webServer env). Normal dev and
// production builds never load this plugin, so no coverage counters ship.
const coveragePlugins = process.env.COVERAGE
  ? [istanbul({
      include: ['components/**', 'pages/**', 'composables/**', 'services/**', 'util/**', 'middleware/**', 'plugins/**', 'layouts/**', 'app.vue'],
      extension: ['.js', '.ts', '.vue'],
      requireEnv: false,
      // The e2e coverage run serves a production build (nuxt build && preview) so
      // routes are pre-compiled; instrument that build, not just the dev server.
      forceBuildInstrument: true
    })]
  : [];

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@bootstrap-vue-next/nuxt',
    '@nuxt/eslint',
    '@nuxtjs/google-fonts',
    '@sentry/nuxt/module',
  ],
  ssr: false,
  devtools: { enabled: true },
  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'stylesheet', href: 'https://material-icons.github.io/material-icons-font/css/outline.css' },
        { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' },
        { rel: 'stylesheet', href: 'https://unpkg.com/maplibre-gl@5.10.0/dist/maplibre-gl.css' },
      ],
      script: [
        { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' },
        // Leaflet's OSM tile layers are being replaced with OpenFreeMap's vector
        // style; the Leaflet maps render it via this MapLibre GL + binding pair
        // (loaded as globals like Leaflet itself, rather than bundled via npm).
        { src: 'https://unpkg.com/maplibre-gl@5.10.0/dist/maplibre-gl.js' },
        { src: 'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  css: [
    '~/assets/scss/main.scss',
  ],
  sourcemap: { client: 'hidden' },
  devServer: {
    host: '0.0.0.0',
  },
  compatibilityDate: '2024-10-24',
  nitro: {
    // Route every backend the SPA calls through the dev server so requests are
    // same-origin — this avoids CORS when browsing under any hostname. Each
    // client's base URL (VITE_* in .env) must be the matching relative prefix,
    // e.g. VITE_API_URL=/api/v1/, VITE_OSM_URL=/osm/, VITE_TDEI_API_URL=/tdei/v1/.
    // `changeOrigin` makes the upstream see its own Host (needed for TLS/vhosts).
    devProxy: {
      '/api': { target: 'https://api.workspaces-dev.sidewalks.washington.edu/api/', changeOrigin: true },
      '/new-api': { target: 'https://new-api.workspaces-dev.sidewalks.washington.edu/api/', changeOrigin: true },
      '/osm': { target: 'https://osm.workspaces-dev.sidewalks.washington.edu/', changeOrigin: true },
      '/tdei': { target: 'https://api-dev.tdei.us/api/', changeOrigin: true },
      '/tdei-user': { target: 'https://portal-api-dev.tdei.us/api/', changeOrigin: true },

      // Local backend (repo workspaces-backend) instead of the shared dev API:
      // '/api': { target: 'http://localhost:8000/api/', changeOrigin: true },
      // '/osm': { target: 'http://localhost:8000/workspaces/', changeOrigin: true },
    },
  },
  vite: {
    plugins: coveragePlugins,
    server: {
      allowedHosts: [
        '.local',
        '.internal',
        '.sidewalks.washington.edu',
      ],
    },
    optimizeDeps: {
      // Pre-bundle these dependencies to avoid reloads during development:
      include: [
        '@osmcha/maplibre-adiff-viewer',
        '@osmcha/osmchange-parser',
        '@sindresorhus/slugify',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@zip.js/zip.js',
        'ajv', // CJS
        'ajv-formats', // CJS
        'bootstrap-vue-next',
        'bootstrap-vue-next/components/BAlert',
        'bootstrap-vue-next/components/BApp',
        'bootstrap-vue-next/components/BBadge',
        'bootstrap-vue-next/components/BButton',
        'bootstrap-vue-next/components/BCard',
        'bootstrap-vue-next/components/BCollapse',
        'bootstrap-vue-next/components/BContainer',
        'bootstrap-vue-next/components/BDropdown',
        'bootstrap-vue-next/components/BFormInput',
        'bootstrap-vue-next/components/BListGroup',
        'bootstrap-vue-next/components/BModal',
        'bootstrap-vue-next/components/BNavbar',
        'bootstrap-vue-next/components/BPopover',
        'bootstrap-vue-next/components/BTabs',
        'bootstrap-vue-next/composables/useModal',
        'dayjs', // CJS
        'dayjs/plugin/relativeTime', // CJS
        'maplibre-gl', // CJS
        'papaparse', // CJS
        'v-viewer',
        'vue-qrcode',
        'vue3-toastify',
      ],
    },
  },
  eslint: {
    config: {
      stylistic: {
        semi: true,
        commaDangle: 'never',
      },
    },
  },
  googleFonts: {
    families: {
      'Open Sans': [300, 400, 500, 600, 700],
      'Montserrat': [300, 400, 500, 600, 700],
    },
    display: 'swap',
    download: true,
  },
  sentry: {
    org: 'taskar-center-at-uw',
    project: 'workspaces-frontend',
    authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
    debug: (process.env.ENV === 'dev' || process.env.ENV === 'local'),
    // Don't phone home to Sentry's telemetry during CI builds/tests.
    telemetry: !process.env.CI,
  },
});

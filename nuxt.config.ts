// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@bootstrap-vue-next/nuxt',
    '@nuxt/eslint',
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
      ],
      script: [
        { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  css: [
    '~/assets/scss/main.scss',
  ],
  sourcemap: { client: 'hidden' },
  compatibilityDate: '2024-10-24',

  /*
  nitro: {
    // deal with CORS issues during development--not sure this is always required, or required at all?
    devProxy: {
      // use these values when you want to use the existing dev backend
      '/api': 'https://api.workspaces-dev.sidewalks.washington.edu/api/',
      '/workspaces': 'https://osm.workspaces-dev.sidewalks.washington.edu/workspaces/',
    },
  },
  */

  eslint: {
    config: {
      stylistic: true,
    },
  },
  sentry: {
    org: 'taskar-center-at-uw',
    project: 'workspaces-frontend',
    authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
    debug: (process.env.ENV === 'dev' || process.env.ENV === 'local'),
    environment: process.env.ENV || 'unknown',
  },
})

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  sourcemap: { client: 'hidden' },
  devtools: { enabled: true },
  modules: [
    '@bootstrap-vue-next/nuxt',
    '@nuxt/eslint',
    '@sentry/nuxt/module',
  ],
  nitro: {
    // deal with CORS issues during development
    devProxy: {
      '/api': 'http://localhost:8000/api/',
      '/workspaces': 'http://localhost:8000/workspaces/',
    }
  },
  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ],
      link: [
        { rel: 'stylesheet', href: 'https://material-icons.github.io/material-icons-font/css/outline.css' },
        { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' }
      ],
      script: [
        { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' },
      ]
    },
    pageTransition: { name: 'page', mode: 'out-in' }
  },
  css: [
    '~/assets/scss/main.scss'
  ],
  compatibilityDate: '2024-10-24',
  eslint: {
    config: {
      stylistic: true
    }
  },
  sentry: {
    org: 'taskar-center-at-uw',
    project: 'workspaces-frontend',
    authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
    debug: (process.env.ENV === 'dev' || process.env.ENV === 'local'),
    environment: process.env.ENV || 'unknown',
  },
})

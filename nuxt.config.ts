// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  sourcemap: { client: 'hidden' },
  devtools: { enabled: process.env.ENV === "dev" || process.env.ENV === "local" },
  modules: ['@sentry/nuxt/module'],
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
        { src: "https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js" },
        { src: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.min.js" }
      ]
    },
    pageTransition: { name: 'page', mode: 'out-in' }
  },
  sentry: {
    org: 'taskar-center-at-university-of',
    project: 'workspaces',
    authToken: process.env.VITE_SENTRY_AUTH_TOKEN,
    debug: (process.env.ENV === "dev" || process.env.ENV === "local" )
  },
  css: [
    '~/assets/scss/main.scss'
  ],

  compatibilityDate: '2024-10-24',
})
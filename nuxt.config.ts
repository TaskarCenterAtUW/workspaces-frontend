// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
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
        { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' }
      ]
    },
    pageTransition: { name: 'page', mode: 'out-in' }
  },
  css: [
    '~/assets/scss/main.scss'
  ]
})

import { tdeiClient } from '~/services/index'

const ALLOW_ANONYMOUS = new Set([
  '/',
  '/signin',
])

export default defineNuxtRouteMiddleware((to) => {
  if (tdeiClient.auth.ok || ALLOW_ANONYMOUS.has(to.path)) {
    return
  }

  window.rememberRoute = to

  return navigateTo('/signin')
})

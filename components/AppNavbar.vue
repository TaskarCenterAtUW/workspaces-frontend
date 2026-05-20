<template>
  <nav class="app-navbar navbar navbar-expand-md navbar-dark">
    <div class="navContainer">
      <nuxt-link class="navbar-brand" to="/">
        <app-logo />
        <span>TDEI Workspaces</span>
      </nuxt-link>

      <button
        ref="toggleButtonRef"
        class="navbar-toggler mobileMenuIcon d-md-none"
        type="button"
        aria-controls="appNavbarSideMenu"
        :aria-expanded="mobileMenuOpen ? 'true' : 'false'"
        aria-label="Toggle navigation"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <span class="navbar-toggler-icon" />
      </button>

      <div class="navbar-collapse d-none d-md-flex">
        <ul v-show="auth.ok" class="navbar-nav navLinks">
          <li class="nav-item">
            <nuxt-link class="nav-link navLink" to="/">Home</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link navLink" to="/dashboard">Dashboard</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link navLink" to="/workspace/create">Create Workspace</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link navLink" to="/help">Help</nuxt-link>
          </li>
        </ul>

        <div class="rightContainer">
          <nuxt-link v-show="!auth.ok" to="/signin" class="nav-link navLink">Sign In</nuxt-link>

          <template v-if="auth.ok">
            <div class="horizontalLine d-none d-md-block" />

            <b-dropdown
              class="userDropdown"
              placement="bottom-end"
              :variant="null"
              no-caret
            >
              <template #button-content>
                <button class="userProfile">
                  <div>{{ auth.displayName }}</div>
                  <app-icon variant="account_circle" size="32" no-margin />
                </button>
              </template>
              <b-dropdown-item to="/dashboard">
                <app-icon variant="dashboard" />
                Dashboard
              </b-dropdown-item>
              <b-dropdown-item to="/" @click="auth.clear()">
                <app-icon variant="logout" />
                Logout
              </b-dropdown-item>
            </b-dropdown>
          </template>
        </div>
      </div>
    </div>

    <div v-if="mobileMenuOpen && isMobileView" class="sideMenuBackdrop" @click="closeMobileMenu" />

    <aside
      id="appNavbarSideMenu"
      ref="sideMenuRef"
      class="sideMenu"
      :class="{ sideMenuOpen: mobileMenuOpen && isMobileView }"
      aria-label="Navigation menu"
      aria-modal="true"
    >
      <div class="sideMenuHeader">
        <img class="logoSidebar" src="~/assets/img/tdei-logo.png" alt="TDEI Logo" />
        <button class="sideMenuClose" type="button" aria-label="Close menu" @click="closeMobileMenu">
          <app-icon variant="close" size="24" no-margin />
        </button>
      </div>

      <nav class="sideMenuNav">
        <nuxt-link v-if="auth.ok" class="sideMenuLink" to="/" @click="closeMobileMenu">
          <span>Home</span>
        </nuxt-link>
        <nuxt-link v-if="auth.ok" class="sideMenuLink" to="/dashboard" @click="closeMobileMenu">
          <span>Dashboard</span>
        </nuxt-link>
        <nuxt-link v-if="auth.ok" class="sideMenuLink" to="/workspace/create" @click="closeMobileMenu">
          <span>Create Workspace</span>
        </nuxt-link>
        <nuxt-link v-if="auth.ok" class="sideMenuLink" to="/help" @click="closeMobileMenu">
          <span>Help</span>
        </nuxt-link>
        <nuxt-link v-if="!auth.ok" class="sideMenuLink" to="/signin" @click="closeMobileMenu">
          <span>Sign In</span>
        </nuxt-link>
        <div v-if="auth.ok" class="mobileUserMenu">
          <div class="mobileUserName">
            <span>{{ auth.displayName }}</span>
          </div>
        </div>
        <button v-if="auth.ok" class="sideMenuButton" @click="logoutFromMobileMenu">
          <app-icon variant="logout" no-margin />
          <span>Logout</span>
        </button>
      </nav>
    </aside>
  </nav>
</template>

<script setup lang="ts">
import { tdeiClient } from '~/services/index'

const auth = tdeiClient.auth
const mobileMenuOpen = ref(false)
const isMobileView = ref(false)
const toggleButtonRef = ref<HTMLElement | null>(null)
const sideMenuRef = ref<HTMLElement | null>(null)

watch(mobileMenuOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      sideMenuRef.value?.querySelector<HTMLElement>('.sideMenuClose')?.focus()
    })
  } else {
    toggleButtonRef.value?.focus()
  }
})

function onKeydown(e: KeyboardEvent) {
  if (!mobileMenuOpen.value || !isMobileView.value) return

  if (e.key === 'Escape') {
    closeMobileMenu()
    return
  }

  if (e.key === 'Tab') {
    const focusable = Array.from(
      sideMenuRef.value?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

function syncMobileView() {
  if (typeof window === 'undefined') {
    return
  }

  isMobileView.value = window.innerWidth <= 768

  if (!isMobileView.value) {
    mobileMenuOpen.value = false
  }
}

function closeMobileMenu() {
  if (isMobileView.value) {
    mobileMenuOpen.value = false
  }
}

function logoutFromMobileMenu() {
  closeMobileMenu()
  auth.clear()
  navigateTo('/')
}

onMounted(() => {
  syncMobileView()
  window.addEventListener('resize', syncMobileView)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobileView)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style lang="scss">
.app-navbar {
  z-index: 900;
  position: sticky;
  top: 0;
  padding: 0;
  background-color: var(--primary-color);

  .navContainer {
    min-height: 60px;
    background-color: var(--primary-color);
    color: #ffffff;
    display: flex;
    flex-wrap: wrap;
    padding: 0 15px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: none;
  }

  .navbar-brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: #fff;
    font-family: var(--secondary-font-family);
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.1;
    text-decoration: none;
    white-space: nowrap;
    margin-right: 1rem;
  }

  .app-logo {
    height: 44px;
    width: 56px;
    object-fit: contain;
    background-color: #fff;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .mobileMenuIcon {
    padding: 5px 8px;
    border: none;

    &:focus {
      box-shadow: none;
    }

    &:hover {
      background-color: var(--primary-color-dark);
    }
  }

  .navbar-collapse {
    align-items: center;
  }

  .navLinks {
    display: flex;
    align-items: center;
    margin: 0 auto;
  }

  .navLink {
    color: rgba(255, 255, 255, 0.9);
    text-decoration: none;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;

    &:hover,
    &.router-link-active {
      color: #fff;
      background-color: rgba(255, 255, 255, 0.15);
    }
  }

  .rightContainer {
    display: flex;
    align-items: center;
    margin-left: auto;
  }

  .horizontalLine {
    border-right: 1px solid #ffffff80;
    height: 25px;
    margin-right: 1rem;
  }

  .userProfile {
    display: flex;
    align-items: center;
    background-color: transparent;
    border: none;
    padding: 0;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
  }

  .userProfile > div {
    padding-right: 1rem;
    cursor: pointer;
  }

  .userDropdown {
    .dropdown-toggle {
      padding: 0;
      border: none;
      background: transparent;
      box-shadow: none;
    }
  }

  .mobileUserMenu {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 1rem 1.25rem;
    border-top: 1px solid #eeeeee;
  }

  .mobileUserName {
    display: flex;
    align-items: center;
    color: #42526e;
    font-size: 14px;
    font-weight: 600;
  }

  .sideMenuBackdrop {
    position: fixed;
    inset: 0;
    background: rgba(9, 8, 20, 0.45);
    z-index: 950;
  }

  .sideMenu {
    position: fixed;
    top: 0;
    right: 0;
    width: min(360px, 92vw);
    height: 100vh;
    background-color: #ffffff;
    box-shadow: 2px 0 24px rgba(18, 16, 32, 0.2);
    z-index: 960;
    transform: translateX(100%);
    transition: transform 0.22s ease;
    display: flex;
    flex-direction: column;
  }

  .sideMenuOpen {
    transform: translateX(0);
  }

  .sideMenuHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--primary-color);
    padding: 1.2rem 1.75rem;
  }

  .logoSidebar {
    width: 60px;
    background-color: #fff;
    padding: 5px 8px;
    border-radius: 4px;
  }

  .sideMenuClose {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.72);
    padding: 0.25rem;
  }

  .sideMenuNav {
    display: flex;
    flex-direction: column;
    padding: 0;
  }

  .sideMenuLink,
  .sideMenuButton {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    color: #42526e;
    text-decoration: none;
    background: transparent;
    border: none;
    padding: 1.15rem 1.25rem;
    border-radius: 0;
    border-bottom: 1px solid #eeeeee;
    font-size: 14px;
    font-weight: 600;
    text-align: left;

    &:hover {
      color: #42526e;
      background-color: #f5f5f5;
    }
  }

  .sideMenuLink.router-link-active {
    background-color: #f5f5f5;
    font-weight: 700;
  }

  @media only screen and (max-width: 768px) {
    .navbar-brand {
      font-size: 1rem;
    }
  }

  @media only screen and (max-width: 576px) {
    .logoHidden {
      display: none;
    }
  }
}
</style>

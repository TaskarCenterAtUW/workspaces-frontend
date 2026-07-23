<template>
  <nav class="app-navbar navbar navbar-expand-md navbar-dark">
    <div class="nav-container">
      <nuxt-link
        class="navbar-brand"
        to="/"
      >
        <app-logo />
        <span>TDEI Workspaces</span>
      </nuxt-link>

      <b-navbar-toggle
        ref="toggleButtonRef"
        target="app-nav-collapse"
        class="mobile-menu-icon d-md-none"
      />

      <b-collapse
        id="app-nav-collapse"
        v-model="mobileMenuOpen"
        is-nav
        class="app-nav-collapse"
        :inert="!mobileMenuOpen && isMobileView"
      >
        <div class="side-menu-header d-md-none">
          <app-logo class="logo-sidebar" />
          <button
            class="side-menu-close"
            type="button"
            aria-label="Close menu"
            @click="mobileMenuOpen = false"
          >
            <app-icon
              variant="close"
              size="24"
              no-margin
            />
          </button>
        </div>

        <ul
          v-if="auth.ok"
          class="navbar-nav nav-links"
        >
          <li class="nav-item">
            <nuxt-link
              class="nav-link nav-link-item"
              to="/"
              @click="closeOnMobile"
            >Home</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link
              class="nav-link nav-link-item"
              to="/dashboard"
              @click="closeOnMobile"
            >Dashboard</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link
              class="nav-link nav-link-item"
              to="/workspace/create"
              @click="closeOnMobile"
            >Create Workspace</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link
              class="nav-link nav-link-item"
              to="/help"
              @click="closeOnMobile"
            >Help</nuxt-link>
          </li>
        </ul>

        <div
          v-if="auth.ok"
          class="right-container"
        >
          <div class="horizontal-line d-none d-md-block" />

          <!-- Desktop: user dropdown -->
          <b-dropdown
            class="user-dropdown d-none d-md-flex"
            placement="bottom-end"
            :variant="null"
            no-caret
          >
            <template #button-content>
              <button class="user-profile">
                <div>{{ auth.displayName }}</div>
                <app-icon
                  variant="account_circle"
                  size="32"
                  no-margin
                />
              </button>
            </template>
            <b-dropdown-item
              to="/"
              @click="auth.clear()"
            >
              <app-icon variant="logout" />
              Logout
            </b-dropdown-item>
          </b-dropdown>

          <!-- Mobile: user name + logout -->
          <div class="mobile-user-menu d-md-none">
            <div class="mobile-user-name">{{ auth.displayName }}</div>
            <button
              class="side-menu-button"
              @click="logoutFromMobileMenu"
            >
              <app-icon
                variant="logout"
                no-margin
              />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </b-collapse>
    </div>

    <div
      v-if="mobileMenuOpen && isMobileView"
      class="side-menu-backdrop"
      @click="mobileMenuOpen = false"
    />
  </nav>
</template>

<script setup lang="ts">
import { tdeiClient } from '~/services/index'

const auth = tdeiClient.auth
const mobileMenuOpen = ref(false)
const isMobileView = ref(false)
const toggleButtonRef = ref<{ $el: HTMLElement } | null>(null)

watch(mobileMenuOpen, (isOpen) => {
  if (!isOpen) {
    nextTick(() => toggleButtonRef.value?.$el?.focus())
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && mobileMenuOpen.value && isMobileView.value) {
    mobileMenuOpen.value = false
  }
}

function syncMobileView() {
  if (typeof window === 'undefined') return
  isMobileView.value = window.innerWidth < 768
  if (!isMobileView.value) {
    mobileMenuOpen.value = false
  }
}

function closeOnMobile() {
  if (isMobileView.value) {
    mobileMenuOpen.value = false
  }
}

function logoutFromMobileMenu() {
  mobileMenuOpen.value = false
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
@import "~/assets/scss/theme.scss";
.app-navbar {
  z-index: 900;
  position: sticky;
  top: 0;
  padding: 0;
  background-color: var(--bs-primary);

  .nav-container {
    min-height: 60px;
    background-color: var(--bs-primary);
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

  .mobile-menu-icon {
    padding: 5px 8px;
    border: none;

    &:focus {
      box-shadow: none;
    }

    &:hover {
      background-color: var(--brand-accent);
    }
  }

  .nav-links {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }

  .nav-link-item {
    color: rgba(255, 255, 255, 0.9);
    text-decoration: none;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;

    &:hover,
    &.router-link-active {
      color: #fff;
      background-color: rgba(255, 255, 255, 0.15);
    }
  }

  .right-container {
    display: flex;
    align-items: center;
  }

  .horizontal-line {
    border-right: 1px solid #ffffff80;
    height: 25px;
    margin-right: 1rem;
  }

  .user-profile {
    display: flex;
    align-items: center;
    background-color: transparent;
    border: none;
    padding: 0;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .user-profile > div {
    padding-right: 1rem;
    cursor: pointer;
  }

  .user-dropdown {
    .dropdown-toggle {
      padding: 0;
      border: none;
      background: transparent;
      box-shadow: none;
    }
  }

  .side-menu-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(9, 8, 20, 0.45);
    z-index: 950;
  }

  // On mobile, override b-collapse to behave as a side drawer
  @include media-breakpoint-down(md) {
    .app-nav-collapse {
      position: fixed !important;
      top: 0;
      right: 0;
      width: min(360px, 92vw);
      height: 100vh !important;
      background-color: #ffffff;
      box-shadow: 2px 0 24px rgba(18, 16, 32, 0.2);
      z-index: 960;
      display: flex !important;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
      overflow-y: auto;
      transform: translateX(100%);
      transition: transform 0.22s ease;

      &.show {
        transform: translateX(0);
      }

      // Suppress Bootstrap's collapsing height animation
      &.collapsing {
        height: 100vh !important;
        transition: transform 0.22s ease !important;
      }
    }

    .nav-links {
      width: 100%;
      flex: 1 0 auto;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      margin: 0;
    }

    .nav-link-item {
      display: block;
      width: 100%;
      color: #42526e;
      padding: 1.15rem 1.25rem;
      border-radius: 0;
      border-bottom: 1px solid #eeeeee;
      font-weight: 600;

      &:hover {
        color: #42526e;
        background-color: #f5f5f5;
      }

      &.router-link-active {
        color: #42526e;
        background-color: #f5f5f5;
        font-weight: 700;
      }
    }

    .right-container {
      width: 100%;
      margin-top: auto;
      flex-direction: column;
      align-items: stretch;
      margin-left: 0;
    }
  }

  .side-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--bs-primary);
    padding: 1.2rem 1.75rem;
    flex-shrink: 0;
  }

  .logo-sidebar {
    width: 60px;
    background-color: #fff;
    padding: 5px 8px;
    border-radius: 4px;
  }

  .side-menu-close {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.72);
    padding: 0.25rem;
  }

  .mobile-user-menu {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 1rem 1.25rem;
    border-top: 1px solid #eeeeee;
  }

  .mobile-user-name {
    color: #42526e;
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .side-menu-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #42526e;
    background: transparent;
    border: none;
    padding: 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    text-align: left;

    &:hover {
      color: #42526e;
    }
  }

  @include media-breakpoint-down(md) {
    .navbar-brand {
      font-size: 1rem;
    }
  }

  @include media-breakpoint-down(sm) {
    .logoHidden {
      display: none;
    }
  }
}
</style>

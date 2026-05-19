<template>
  <div class="homepage">
    <div class="jumbo">
      <div class="jumbo-content">
        <app-logo />
        <h1 class="display-3 fw-normal">TDEI Workspaces</h1>
        <hr>
        <p class="mt-5">
          TDEI Workspaces is an integrated editing platform for TDEI datasets.
          Workspaces provides tools and APIs for crafting and visualizing
          OpenSidewalks and GTFS Pathways data.
        </p>
        <p class="mb-5">
          <a href="https://transitequity.cs.washington.edu/" target="_blank">
            Learn more about the TDEI
          </a>
        </p>
        <nuxt-link
          :to="auth.ok ? '/dashboard' : '/signin'"
          class="btn tdei-primary-button btn-lg"
        >
          {{ auth.ok ? 'Go to Dashboard' : 'Sign In' }}
        </nuxt-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { tdeiClient } from '~/services/index'

const auth = tdeiClient.auth
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.homepage {
  height: 100%;

  .jumbo {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgb(29, 43, 65);
    background-image: url('@/assets/img/bg.webp');
    background-size: 100% auto;
    background-repeat: no-repeat;
    background-position: center 75%;

    @include media-breakpoint-down(sm) {
      & {
        background-size: auto 100%;
      }
    }
  }

  .jumbo-content {
    width: 100%;
    padding: 3rem;
    margin: 0 auto;
    border-top: 1px solid var(--purple-background-dark);
    border-bottom: 1px solid var(--purple-background-dark);
    background-color: rgba(244, 240, 251, 0.8);
    color: #1f2540;
    text-align: center;

    > * {
      margin-left: auto;
      margin-right: auto;
    }

    hr {
      width: 20%;
      margin: 2rem auto;
    }

    p {
      max-width: 700px;

      > a {
        color: var(--primary-color);
        font-weight: 600;
        text-decoration: none;

        &:hover {
          color: var(--primary-color-dark);
          text-decoration: underline;
        }
      }
    }

    .btn {
      padding: 1rem 3rem;
    }
  }

  .app-logo {
    width: 5rem;
    height: 5rem;
    margin-bottom: 1rem;
  }
}
</style>

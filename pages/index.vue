// Test outline
// @test e2e: an already-authenticated visitor is also shown the hero image with a sign-in link (FIXME?), but the header shows the user is logged in
// @test e2e: an unauthenticated user is shown the hero image with a sign-in link--playwright snapshot this
// @test e2e: that the toolbar doesn't show a username when the user is not logged in, and does when the user is logged in
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json) and that success
//            and error states are handled properly with toasts (playwright snapshot these)
<template>
  <div class="homepage">
    <div class="jumbo">
      <div class="hero-shell">
        <section class="hero-copy">
          <app-logo />
          <h1>TDEI Workspaces</h1>
          <div class="hero-divider" />
          <p>
            TDEI Workspaces is an integrated editing platform for TDEI datasets.
            Workspaces provides tools and APIs for crafting and visualizing
            OpenSidewalks and GTFS Pathways data.
          </p>

          <div class="hero-actions">
            <nuxt-link
              :to="auth.ok ? '/dashboard' : '/signin'"
              class="btn btn-primary hero-primary-action"
            >
              {{ auth.ok ? 'Go to Dashboard' : 'Sign In' }}
            </nuxt-link>

            <a
              class="hero-secondary-link"
              href="https://transitequity.cs.washington.edu/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more about the TDEI
            </a>
          </div>
        </section>
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
  background: var(--purple-background-light);

  .jumbo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: auto;
    position: relative;
    background:
      linear-gradient(90deg, rgba(244, 240, 251, 0.94) 0%, rgba(244, 240, 251, 0.88) 34%, rgba(244, 240, 251, 0.56) 56%, rgba(34, 20, 84, 0.32) 100%),
      url('@/assets/img/bg.webp');
    background-size: 100% auto;
    background-repeat: no-repeat;
    background-position: center 75%;

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 16% 30%, rgba(244, 240, 251, 0.92), rgba(244, 240, 251, 0.42) 38%, transparent 62%),
        linear-gradient(90deg, rgba(244, 240, 251, 0.24), rgba(244, 240, 251, 0.04) 46%, rgba(32, 18, 71, 0.24) 100%);
      pointer-events: none;
    }

    @include media-breakpoint-down(sm) {
      & {
        background-size: auto 100%;
        background-position: center 75%;
      }
    }
  }

  .hero-shell {
    position: relative;
    z-index: 1;
    width: min(100%, 1280px);
    min-height: calc(100vh - 60px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: 0;
    padding: clamp(3rem, 6vw, 5rem) clamp(3rem, 7vw, 6.5rem);
  }

  .hero-copy {
    max-width: 620px;
    color: #1c2551;
  }

  h1 {
    font-family: var(--secondary-font-family);
    font-size: clamp(2.75rem, 5vw, 4.25rem);
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: -0.03em;
    margin: 0;
  }

  .hero-divider {
    width: 3.75rem;
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(90deg, #6c52ff 0%, #8a48ff 100%);
    margin: 2rem 0 2.25rem;
  }

  p {
    max-width: 640px;
    font-size: clamp(1.15rem, 1.4vw, 1.65rem);
    line-height: 1.68;
    color: #434b6b;
    margin: 0;
  }

  .hero-actions {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-top: 3rem;
  }

  .hero-primary-action {
    min-height: 3.8rem;
    padding: 0 2rem !important;
    font-size: 1.05rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 14px 30px rgba($primary, 0.2);
  }

  .hero-secondary-link {
    color: var(--bs-primary);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.14em;

    &:hover {
      color: var(--brand-accent);
    }
  }

  .app-logo {
    width: 5.25rem;
    height: 5.25rem;
    margin-bottom: 1.5rem;
    filter: drop-shadow(0 10px 18px rgba(109, 81, 255, 0.18));
  }

  @include media-breakpoint-down(lg) {
    .hero-shell {
      padding-top: 3rem;
      padding-bottom: 3rem;
    }
  }

  @include media-breakpoint-down(md) {
    .jumbo {
      background:
        linear-gradient(90deg, rgba(244, 240, 251, 0.98) 0%, rgba(244, 240, 251, 0.94) 52%, rgba(244, 240, 251, 0.72) 72%, rgba(34, 20, 84, 0.24) 100%),
        url('@/assets/img/bg.webp');
      background-size: auto 100%;
      background-position: 60% center;

      &::before {
        background:
          linear-gradient(180deg, rgba(244, 240, 251, 0.08), rgba(244, 240, 251, 0.02)),
          radial-gradient(circle at 10% 24%, rgba(244, 240, 251, 0.98), rgba(244, 240, 251, 0.64) 44%, transparent 74%);
      }
    }

    .hero-shell {
      min-height: auto;
      padding: 1.5rem 1rem 2.5rem;
    }

    h1 {
      font-size: clamp(2.15rem, 9vw, 3rem);
      line-height: 1.02;
    }

    .hero-divider {
      margin: 1.4rem 0 1.5rem;
    }

    p {
      max-width: 30rem;
      font-size: 0.98rem;
      line-height: 1.72;
      color: #3f4767;
    }

    .hero-actions {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
      margin-top: 2rem;
    }

    .hero-primary-action {
      width: 100%;
      max-width: 320px;
    }
  }

  @include media-breakpoint-down(sm) {
    .app-logo {
      width: 4.4rem;
      height: 4.4rem;
      margin-bottom: 1rem;
    }

    .hero-shell {
      padding: 1.25rem 1rem 2.25rem;
    }

    .hero-copy {
      max-width: 27rem;
    }

    .hero-primary-action {
      min-height: 4rem;
      max-width: none;
      width: 100%;
    }
  }
}
</style>

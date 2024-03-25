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
        <nuxt-link to="/signin" class="btn btn-primary btn-lg">Sign In</nuxt-link>
      </div>
    </div>
  </div>
</template>

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
    border-top: 1px solid lighten(rgba(29, 43, 65, 0.5), 30%);
    border-bottom: 1px solid lighten(rgba(29, 43, 65, 0.5), 30%);
    background-color: rgba(29, 43, 65, 0.85);
    color: white;
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
        color: lighten($primary, 30%);
        text-decoration: none;
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

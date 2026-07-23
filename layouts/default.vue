<template>
  <div id="defaultLayout">
    <nuxt-loading-indicator
      :height="5"
      :throttle="0"
      color="linear-gradient(90deg, var(--purple-background-light) 0%, var(--tdei-blue) 38%, var(--tdei-green) 70%, var(--tdei-cyan) 100%)"
    />
    <header>
      <app-navbar />
    </header>

    <main role="main">
      <slot />
    </main>
  </div>
</template>

<style lang="scss">
@import "assets/scss/theme.scss";

#defaultLayout {
  width: 100%;
  height: 100%;

  main {
    height: calc(100% - $navbar-height);
  }
}
</style>

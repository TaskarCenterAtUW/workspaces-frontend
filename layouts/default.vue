<template>
  <div id="defaultLayout">
    <nuxt-loading-indicator />
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

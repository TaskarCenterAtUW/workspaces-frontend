// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      'vue/singleline-html-element-content-newline': 'off',
      '@stylistic/semi': 'off',
      '@stylistic/brace-style': 'off',
      '@stylistic/comma-dangle': 'off'
    }
  }
)

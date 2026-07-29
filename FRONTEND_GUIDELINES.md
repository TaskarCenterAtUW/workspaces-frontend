# Frontend Development Guidelines & Best Practices

This document serves as the source of truth for our Vue.js and Nuxt frontend architecture. It consolidates our design system constraints, TypeScript standards, accessibility requirements, and performance rules to ensure consistency, maintainability, and quality across the codebase.

## 1. Vue & Nuxt Core Patterns

* **Derive State, Don't Calculate in Templates:** Always use `computed` for derived state rather than calling methods directly from the template.
* **Smart DOM Rendering:** Use `v-if` to completely remove heavy, conditionally unused components from the DOM. Reserve `v-show` strictly for elements that toggle frequently to avoid remounting costs.
* **Respect One-Way Data Flow:** Never mutate props directly. Either emit an event to the parent or initialize a local `ref` from the prop.
* **Clean Up After Yourself:** Use `onBeforeUnmount` to clear all side effects (event listeners, timers, observers, abort controllers).
* **Nuxt-Specific Routing:** Always use Nuxt's native `navigateTo()` for programmatic navigation rather than `router.push()`.

## 2. Component Design & TypeScript

* **Single Responsibility Principle:** If a component handles data fetching, rendering, *and* complex user interaction, split it up.
* **Keep Logic Out of UI:** Business logic (API calls, data transforms) belongs in the `services` layer or composables, not inline within `<script setup>`. Extract repeated logic (shared by 2+ components) into `composables`.
* **Strict Typing:**
  * Avoid using `type: Object` for `defineProps`; use explicit interfaces or inline types.
  * Explicitly type `ref` and `computed` values when inference is too broad (e.g., `ref<string | null>(null)`).
  * Define explicit return types on service functions to establish clear contracts.
  * Avoid `any`—if you are fighting the type system, update the type definitions. Validate data shapes at the API boundary, not within the UI components.

## 3. Styling Ecosystem (Bootstrap & SCSS)

* **Bootstrap First:** Use standard framework components (e.g., `<b-collapse>`, `<b-navbar-toggle>`) instead of reimplementing behavior—you get ARIA for free. Use Bootstrap spacing utilities (`mt-3`, `px-2`) before writing custom CSS, and use Bootstrap variants (`btn-primary`, `variant="link"`) over custom button classes.
* **Design Fidelity Without One-Off CSS:** Treat the approved design as the visual specification, but implement it through the existing theme, spacing scale, and shared components. Pixel matching at one viewport must not break responsiveness, browser zoom, long content, accessibility, or component reuse.
* **Variable Management:**
  * Import `bootstrap/scss/functions` first, then override Bootstrap Sass variables (like `$primary` or `$btn-font-weight`) before importing `bootstrap/scss/variables` and the remaining Bootstrap modules.
  * Any component `<style lang="scss">` using Sass variables/mixins must `@import "~/assets/scss/theme.scss"`.
  * Use semantic theme names such as `$text-primary`, `$text-secondary`, `$surface-card`, `$border-subtle`, and `$status-success-text`. Do not duplicate their resolved hex values in components.
  * Add shared tokens for colors, gradients, borders, radii, shadows, and spacing when a value is reused or represents a design-system concept.
  * Do not change a global token or utility class to satisfy one page. Global changes require a visual audit of their major consumers; page-specific differences belong in a scoped class or an explicit component variant.
  * Use lowercase hex values consistently.
* **Typography and Spacing:**
  * Convert design-tool pixel typography to `rem` using the application's 16px root size (for example, 14px becomes `0.875rem`, 16px becomes `1rem`, and 20px becomes `1.25rem`).
  * Define font size, weight, and line height together, and use the established font-family hierarchy rather than replacing fonts for an isolated screen.
  * Use Bootstrap spacing utilities or the project spacing scale before introducing a new spacing value.
  * Do not use negative margins to correct alignment. Fix the parent `gap`, padding, grid alignment, or component structure.
  * Use unitless `0`, not `0px`. A `1px` value is acceptable for borders and optical separators, and fixed pixel dimensions are acceptable for icons when required by the icon specification; typography must still use `rem`/`em`.
* **Layout and Stacking:**
  * Prefer normal document flow, Flexbox, and Grid over absolute positioning. Reserve absolute positioning for intentional overlays or anchored decorative elements with a documented containing block.
  * Do not use arbitrary stacking values such as `z-index: 9999`. Use Bootstrap's z-index variables or a documented application layer scale.
  * Avoid `!important`. Resolve selector ownership, layout structure, or the shared component API first.
  * Build full-page workflows with an appropriate Nuxt layout instead of covering the application with an absolutely positioned element.
  * Avoid page-level `:deep()` overrides when a reusable component prop or variant can express the design.
* **CSS Quality Strictness:**
  * Use `<style scoped>` for all components unless there is a documented reason not to.
  * Use **kebab-case** for CSS classes.
  * Use `rem`/`em` for font sizes (never `px`).
  * Eliminate magic numbers; use Sass variables (like `$navbar-height`) and name the intent. Use Bootstrap's `$box-shadow` instead of hardcoded values.
  * Use Bootstrap breakpoint mixins (`@include media-breakpoint-down/up(sm/md/lg)`); never invent custom breakpoints.
* **Cleanup:** Delete dead CSS, commented-out declarations, redundant properties, temporary overrides, and unused selectors before opening a PR. Search for usages of every class you're keeping, use `:last-child` instead of equivalent complex selectors, and only load the Google Font weights actually used.

## 4. Accessibility (A11y) & UX

* **Semantic Interactions:** Never use `<div @click>` or `<span @click>` for interactive elements. Always use `<button>` or `<a>`.
* **Form & Image Context:** Every form input must have a `<label>` (explicit `for`/`id` pair) or `aria-label`—never rely on placeholders alone. Decorative images must have `alt=""`.
* **Icons and Visual States:**
  * Use the shared icon component whenever possible. State-dependent SVGs must use `currentColor`; an SVG rendered through `<img>` cannot inherit the control's CSS text color.
  * An icon-only button must have an accessible name. A decorative icon accompanying an existing text label must not add a duplicate accessible name.
  * Validate default, hover, `focus-visible`, active/selected, disabled, loading, error, and empty states. Do not remove focus indicators to match a screenshot.
* **Dynamic Accessibility:**
  * Ensure modals and dialogs trap focus while open and return focus to the trigger element when closed.
  * Announce dynamic content changes (loading states, errors) using `aria-live` or visually-hidden status regions.
* **Visual Clarity:** Verify foreground/background contrast meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text) using a tool like WebAIM Contrast Checker.
* **Don't Break Built-in Features:** Never accidentally remove sticky/focus-management behavior that was explicitly requested—grep for `position: sticky`, `focus()`, `aria-*` before deleting blocks.
* **DRY Templates:** Define nav links / repeated content in one place only; never duplicate across mobile/desktop branches. Don't add shortcuts in secondary menus if the link already exists in the main nav.

## 5. Pixel-Perfect Review and Responsive Validation

* **Reference Conditions:** Record the approved design's viewport size and compare the implementation at that exact size. Use a screenshot overlay or visual-diff tool instead of relying only on side-by-side inspection.
* **Responsive Coverage:** Test changed screens at minimum at 320px, 375px, 768px, 1024px, and the approved desktop width. These are validation viewports, not new CSS breakpoints; continue using Bootstrap breakpoint mixins in the implementation.
* **Content Resilience:** Test empty values, loading and error states, maximum-length names, rich text, translated content, and realistic data volume. Check for clipping, horizontal scrolling, overlapping controls, and layout shifts.
* **Typography at Breakpoints:** Responsive typography should normally remain the same or decrease on smaller screens. Any increase at a smaller breakpoint must be intentional and documented.
* **Zoom and Contrast:** Verify changed screens at 200% browser zoom and confirm WCAG AA contrast for every new foreground/background combination.
* **PR Evidence:** Include before-and-after screenshots at the reference desktop size and at least one mobile size. Run lint, typecheck, and relevant component tests after styling changes.

## 6. Performance & Bundling

* **Code-Splitting:** Prefix heavy or rarely used components with `Lazy` (e.g., `<LazyMapComponent />`) so Nuxt splits them automatically.
* **Dynamic Imports:** Import large third-party libraries (map renderers, chart libraries, PDF generators) dynamically using `import()` to keep the initial bundle small.
* **Vite Optimization:** Whenever you introduce a new heavy third-party component, add it to `vite.optimizeDeps.include` in `nuxt.config.ts` to prevent dev-server reload thrashing.

## 7. Security & Git Hygiene

* **Sanitize Inputs:** Never use `v-html` with user or API data. If absolutely necessary, sanitize it with DOMPurify first.
* **Protect Secrets:** Do not log tokens, passwords, or PII to the console. Never commit `.env` files with real secrets; `.env.example` with placeholders is fine.
* **Repository Cleanliness:**
  * Always commit `package-lock.json` alongside `package.json` changes.
  * Squash "fix lint" or "oops" commits before merging to keep history readable.

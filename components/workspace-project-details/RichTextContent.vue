<!-- All HTML rendered by this component is sanitized with DOMPurify below. -->
<!-- eslint-disable vue/no-v-html -->
<template>
  <!--
    Renders sanitized rich-text HTML from the API (e.g. project descriptions/instructions).
    All HTML is passed through DOMPurify before being bound with v-html, which strips any
    XSS-risky tags/attributes while preserving safe formatting like <p>, <ul>, <a>, <strong>.

    Never remove or bypass the DOMPurify call — the `html` prop can contain raw API data.
  -->
  <div
    class="project-detail-rich-text"
    v-html="safeHtml"
  />
</template>

<script setup lang="ts">
import DOMPurify from 'dompurify';

interface Props {
  /** Raw HTML string, typically coming from an API response or a WYSIWYG editor. */
  html: string;
}

const props = defineProps<Props>();

const safeHtml = computed(() =>
  DOMPurify.sanitize(props.html, { USE_PROFILES: { html: true } })
);
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-rich-text {
  overflow-x: auto;
  color: #5a607b;
  font-family: var(--primary-font-family);
  font-size: 1.1rem;
  line-height: 1.9;
}

.project-detail-rich-text:deep(h3) {
  margin: 0 0 0.9rem;
  color: #1a1e3d;
  font-family: var(--secondary-font-family);
  font-size: 1.18rem;
  font-weight: 700;
  line-height: 1.4;
}

.project-detail-rich-text:deep(p),
.project-detail-rich-text:deep(ul),
.project-detail-rich-text:deep(ol) {
  margin: 0 0 1.4rem;
}

.project-detail-rich-text:deep(ul),
.project-detail-rich-text:deep(ol) {
  padding-left: 1.25rem;
}

.project-detail-rich-text:deep(li + li) {
  margin-top: 0.35rem;
}

.project-detail-rich-text:deep(blockquote) {
  margin: 0 0 1.4rem;
  padding: 0.75rem 1rem;
  color: #5a607b;
  background-color: rgba($primary, 0.04);
  border-left: 3px solid rgba($primary, 0.22);
}

.project-detail-rich-text:deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.project-detail-rich-text:deep(table) {
  width: 100%;
  margin: 0 0 1.4rem;
  border-collapse: collapse;
}

.project-detail-rich-text:deep(th),
.project-detail-rich-text:deep(td) {
  min-width: 4rem;
  padding: 0.55rem 0.7rem;
  text-align: left;
  vertical-align: top;
  border: 1px solid rgba($text-navy, 0.16);
}

.project-detail-rich-text:deep(th) {
  color: #1a1e3d;
  font-weight: 700;
  background-color: rgba($primary, 0.06);
}

.project-detail-rich-text:deep(th p:last-child),
.project-detail-rich-text:deep(td p:last-child) {
  margin-bottom: 0;
}

.project-detail-rich-text:deep(a) {
  color: #5578d9;
  text-decoration: none;
}

.project-detail-rich-text:deep(a:hover) {
  text-decoration: underline;
}
</style>

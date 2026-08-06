import DOMPurify from 'dompurify';

const RICH_TEXT_SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true }
} as const;

/** Sanitizes editor and API-provided rich text before it is rendered or submitted. */
export function sanitizeRichTextHtml(html: string): string {
  if (!html.trim()) {
    return '';
  }

  return DOMPurify.sanitize(html, RICH_TEXT_SANITIZE_OPTIONS);
}

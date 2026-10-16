import { gtfsValueLabel } from '~/services/gtfs-value-labels';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

/** Class of the label element added next to a coded value. */
export const VALUE_LABEL_CLASS = 'gtfs-value-label';

/**
 * Adds, updates or removes the label next to one raw tag editor row's value,
 * e.g. "Elevator" beside `pathway_mode = 5`. The value input itself is left
 * alone so editing still works on the raw code.
 */
export function labelTagRow(row: Element, key: string, value: unknown) {
  const wrap = row.querySelector('.value-wrap');
  if (!wrap) return;

  const label = gtfsValueLabel(key, value);
  let span = wrap.querySelector<HTMLElement>(`.${VALUE_LABEL_CLASS}`);
  if (!label) {
    span?.remove();
    return;
  }
  if (!span) {
    span = document.createElement('span');
    span.className = VALUE_LABEL_CLASS;
    span.setAttribute('aria-hidden', 'true'); // the input's title carries it for assistive tech
    wrap.appendChild(span);
  }
  span.textContent = label;
  wrap.querySelector('input.value')?.setAttribute('title', `${String(value)}: ${label}`);
}

let installed = false;

/**
 * Labels coded GTFS values (pathway_mode, location_type, ...) in Rapid's raw
 * tag editor, by wrapping its render: after Rapid draws the tag rows, each row
 * gets a label for its value. Applies to every Rapid 3 editor on the page, so
 * it's only installed for pathways workspaces (whose edit page reloads to
 * switch datatype, see pages/workspace/[id]/edit.vue).
 */
export function installTagValueLabels() {
  const RawTagEditor = Rapid?.UiSectionRawTagEditor;
  if (installed || !RawTagEditor?.prototype?.renderDisclosureContent) return;
  installed = true;

  const render = RawTagEditor.prototype.renderDisclosureContent;
  RawTagEditor.prototype.renderDisclosureContent = function (this: unknown, $wrap: any, ...rest: unknown[]) {
    const result = render.call(this, $wrap, ...rest);
    $wrap.selectAll('.tag-list li.tag-row').each(function (this: Element, d: { key: string; value: unknown }) {
      labelTagRow(this, d?.key ?? '', d?.value);
    });
    return result;
  };
}

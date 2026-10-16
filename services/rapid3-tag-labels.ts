import { GTFS_VALUE_LABELS, gtfsValueLabel } from '~/services/gtfs-value-labels';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

/** Class of the label element added next to a coded value. */
export const VALUE_LABEL_CLASS = 'gtfs-value-label';
/** Class of the label shown after a code in the value dropdown. */
export const OPTION_LABEL_CLASS = 'gtfs-value-option-label';

/** A value suggestion for Rapid's combobox: the code, shown with its meaning. */
export interface ValueSuggestion {
  value: string;
  title: string;
  display: ($option: any) => void;
  /** Marks suggestions from these lists, so a single one still opens the dropdown. */
  gtfsChoice: true;
}

/** Combo fields whose dropdown lists defined values (see installSingleChoiceDropdowns). */
const CHOICE_FIELD_CLASSES = new Set(['combo-level_id', 'combo-parent_station']);

/**
 * Dropdown suggestions for a coded GTFS key (e.g. pathway_mode: "1 Walkway",
 * "2 Stairs", ...), or undefined for other keys. Picking one enters the code.
 */
export function gtfsValueSuggestions(key: string): ValueSuggestion[] | undefined {
  const labels = GTFS_VALUE_LABELS[key.trim()];
  return labels ? labeledSuggestions(Object.entries(labels).map(([value, label]) => ({ value, label }))) : undefined;
}

/** Dropdown suggestions for values with labels, each shown as the value then its label. */
export function labeledSuggestions(choices: { value: string; label: string }[]): ValueSuggestion[] {
  return choices.map(({ value, label }) => ({
    value,
    gtfsChoice: true as const,
    title: `${value}: ${label}`,
    // A display function (not HTML), so labels are set as text.
    display: ($option: any) => {
      $option.text(value);
      $option.append('span').attr('class', OPTION_LABEL_CLASS).text(label);
    }
  }));
}

/**
 * Makes value dropdowns list GTFS codes, with their meanings, for coded keys,
 * and the workspace's defined values for reference keys (`choicesFor`, e.g.
 * levels for level_id). Both the raw tag editor's value dropdown and combo
 * fields without fixed options ask Rapid's taginfo service for suggestions,
 * so its `values` lookup is wrapped; other keys still go to taginfo.
 */
export function installTagValueSuggestions(
  context: any,
  choicesFor?: (key: string) => { value: string; label: string }[] | undefined
) {
  const taginfo = context?.services?.taginfo;
  if (!taginfo?.values || taginfo.__gtfsValueSuggestions) return;
  taginfo.__gtfsValueSuggestions = true;

  const values = taginfo.values.bind(taginfo);
  taginfo.values = (params: { key?: string }, callback: (err: unknown, data?: unknown[]) => void) => {
    const key = params?.key ?? '';
    const choices = choicesFor?.(key);
    const suggestions = gtfsValueSuggestions(key) ?? (choices ? labeledSuggestions(choices) : undefined);
    if (suggestions) {
      callback(null, suggestions);
    } else {
      values(params, callback);
    }
  };
}

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

/**
 * Lets the level_id / parent_station dropdowns (and tag editor dropdowns
 * listing our choices) open with a single choice. Rapid's combobox stays
 * hidden with fewer than 2 suggestions, so a workspace with one station or one
 * level would offer nothing, and those fields are read-only. Wraps the
 * combobox render to lower that minimum to 1 for just these dropdowns.
 */
export function installSingleChoiceDropdowns() {
  const proto = Rapid?.UiCombobox?.prototype;
  if (!proto?._render || proto.__gtfsSingleChoice) return;
  proto.__gtfsSingleChoice = true;

  const render = proto._render;
  proto._render = function (this: any, ...args: unknown[]) {
    const ours = CHOICE_FIELD_CLASSES.has(this._klass)
      || (this._suggestions?.length > 0 && this._suggestions.every((s: any) => s?.gtfsChoice));
    if (!ours) return render.apply(this, args);

    const minItems = this._minItems;
    this._minItems = Math.min(minItems, 1);
    try {
      return render.apply(this, args);
    } finally {
      this._minItems = minItems;
    }
  };
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

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
export function labeledSuggestions(choices: { value: string; label: string; description?: string }[]): ValueSuggestion[] {
  return choices.map(({ value, label, description }) => {
    const text = description ?? label;
    return {
      value,
      gtfsChoice: true as const,
      title: `${value}: ${text}`,
      // A display function (not HTML), so labels are set as text.
      display: ($option: any) => {
        $option.text(value);
        $option.append('span').attr('class', OPTION_LABEL_CLASS).text(text);
      }
    };
  });
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
  taginfo.values = (params: { key?: string; query?: string }, callback: (err: unknown, data?: unknown[]) => void) => {
    const key = params?.key ?? '';
    const choices = matchingChoices(choicesFor?.(key), params?.query);
    const suggestions = gtfsValueSuggestions(key) ?? (choices ? labeledSuggestions(choices) : undefined);
    if (suggestions) {
      callback(null, suggestions);
    } else {
      values(params, callback);
    }
  };
}

/**
 * The choices whose value, label or description contains what's been typed
 * (ignoring case), so typing "j02" narrows a long level list to J02's levels,
 * and "van dorn" to that station's. All of them when nothing's typed.
 */
export function matchingChoices<T extends { value: string; label: string; description?: string }>(
  choices: T[] | undefined,
  query?: string
): T[] | undefined {
  const q = query?.trim().toLowerCase();
  if (!choices || !q) return choices;
  return choices.filter(({ value, label, description }) =>
    [value, label, description ?? ''].some(text => text.toLowerCase().includes(q)));
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
 * level (or typing that narrows the list to one match) would offer nothing.
 * Wraps the combobox render to lower that minimum to 1 for just these dropdowns.
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

/**
 * Shows each choice's description (e.g. a level's name and stations) beside
 * its value in the Fields section's combo dropdowns too. Those build their
 * options from Rapid's option strings (our "Name (ID)" labels), not from the
 * suggestions' own display, so this wraps the combo field's taginfo lookup to
 * restyle the options it returns. The value the field shows once picked is
 * unchanged. Combo fields are created as the editor draws them, after this is
 * installed, so wrapping the class reaches them all. Installed once per page.
 * @param choicesFor - the defined choices for a key, if any (see installTagValueSuggestions)
 */
export function installComboDescriptions(
  choicesFor: (key: string) => { value: string; label: string; description?: string }[] | undefined
) {
  const proto = Rapid?.UiFieldCombo?.prototype;
  if (!proto?._setTaginfoValues || proto.__gtfsComboDescriptions) return;
  proto.__gtfsComboDescriptions = true;

  const setTaginfoValues = proto._setTaginfoValues;
  proto._setTaginfoValues = function (this: any, q: string, callback?: (data: any[]) => void) {
    return setTaginfoValues.call(this, q, (data: any[]) => {
      describeComboItems(data, choicesFor(this.key ?? ''));
      callback?.(data);
    });
  };
}

/**
 * Restyles combo items (in place) for choices with a description: the value,
 * then the description beside it, as the raw tag editor's dropdown shows them.
 */
export function describeComboItems(
  items: { key: string; display?: unknown; title?: string }[] | undefined,
  choices: { value: string; description?: string }[] | undefined
) {
  if (!items || !choices) return;
  const descriptions = new Map(choices.filter(c => c.description).map(c => [c.value, c.description!]));
  for (const item of items) {
    const description = descriptions.get(item.key);
    if (!description) continue;
    item.title = `${item.key}: ${description}`;
    item.display = ($option: any) => {
      $option.text(item.key);
      $option.append('span').attr('class', OPTION_LABEL_CLASS).text(description);
    };
  }
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

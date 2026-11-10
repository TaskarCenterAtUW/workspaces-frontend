import { afterEach, describe, expect, it, vi } from 'vitest';
import { GTFS_VALUE_LABELS, gtfsValueLabel } from '~/services/gtfs-value-labels';
import {
  describeComboItems,
  gtfsValueSuggestions,
  installTagValueSuggestions,
  labelTagRow,
  OPTION_LABEL_CLASS,
  VALUE_LABEL_CLASS
} from '~/services/rapid3-tag-labels';
import pathwaysSchema from '~/services/rapid3-pathways-schema.json';

// Labels for coded GTFS values, shown next to raw tag values in Rapid 3's tag
// editor for pathways workspaces.

describe('gtfsValueLabel', () => {
  it('labels coded values from the GTFS reference', () => {
    expect(gtfsValueLabel('pathway_mode', '5')).toBe('Elevator');
    expect(gtfsValueLabel('location_type', '2')).toBe('Entrance / Exit');
    expect(gtfsValueLabel('is_bidirectional', ' 0 ')).toBe('Unidirectional (from -> to only)');
  });

  it('leaves unknown keys and values unlabeled', () => {
    expect(gtfsValueLabel('pathway_mode', '9')).toBeUndefined();
    expect(gtfsValueLabel('stop_name', '1')).toBeUndefined();
    expect(gtfsValueLabel('pathway_mode', ['1', '2'])).toBeUndefined(); // multi-selection
  });

  it('covers every pathway_mode and location_type the schema presets use', () => {
    const presets = Object.values(pathwaysSchema.scopes[0]!.presets) as ({ tags?: Record<string, string> } | null)[];
    for (const tags of presets.map(preset => preset?.tags ?? {})) {
      for (const key of ['pathway_mode', 'location_type'] as const) {
        if (tags[key] !== undefined) expect(gtfsValueLabel(key, tags[key]), `${key}=${tags[key]}`).toBeTruthy();
      }
    }
  });

  it('matches the schema fields\' option labels', () => {
    const fields = pathwaysSchema.scopes[0]!.fields as Record<string, { strings?: { options?: Record<string, string> } }>;
    for (const key of ['is_bidirectional', 'wheelchair_boarding']) {
      expect(fields[key]!.strings!.options, key).toEqual(GTFS_VALUE_LABELS[key]);
    }
  });
});

describe('tag editor value labels', () => {
  /** A row shaped like Rapid's raw tag editor's: li.tag-row > .value-wrap > input.value */
  function tagRow(value: string) {
    const row = document.createElement('li');
    row.className = 'tag-row';
    row.innerHTML = `<div class="value-wrap"><input class="value" value="${value}"></div>`;
    return row;
  }
  const labelOf = (row: Element) => row.querySelector(`.${VALUE_LABEL_CLASS}`)?.textContent;

  it('adds a label next to a coded value and describes it on the input', () => {
    const row = tagRow('5');
    labelTagRow(row, 'pathway_mode', '5');

    expect(labelOf(row)).toBe('Elevator');
    expect(row.querySelector('input.value')!.getAttribute('title')).toBe('5: Elevator');
    expect((row.querySelector('input.value') as HTMLInputElement).value).toBe('5');
  });

  it('updates the label in place and removes it when the value has none', () => {
    const row = tagRow('5');
    labelTagRow(row, 'pathway_mode', '5');
    labelTagRow(row, 'pathway_mode', '2');
    expect(row.querySelectorAll(`.${VALUE_LABEL_CLASS}`)).toHaveLength(1);
    expect(labelOf(row)).toBe('Stairs');

    labelTagRow(row, 'pathway_mode', 'elevator');
    expect(labelOf(row)).toBeUndefined();
  });

  describe('installTagValueLabels', () => {
    afterEach(() => {
      delete (globalThis as any).Rapid;
      vi.resetModules();
    });

    it('labels rows after Rapid renders the raw tag editor, once', async () => {
      const rows = [
        { el: tagRow('5'), d: { key: 'pathway_mode', value: '5' } },
        { el: tagRow('Platform A'), d: { key: 'stop_name', value: 'Platform A' } }
      ];
      const render = vi.fn(() => 'rendered');
      class UiSectionRawTagEditor {
        renderDisclosureContent(..._args: unknown[]) {
          return render();
        }
      }
      (globalThis as any).Rapid = { UiSectionRawTagEditor };
      const $wrap = {
        selectAll: (selector: string) => ({
          each: (fn: (this: Element, d: unknown) => void) => {
            expect(selector).toBe('.tag-list li.tag-row');
            rows.forEach(({ el, d }) => fn.call(el, d));
          }
        })
      };

      vi.resetModules();
      const { installTagValueLabels } = await import('~/services/rapid3-tag-labels');
      installTagValueLabels();
      installTagValueLabels(); // second install is a no-op

      const editor = Object.create(UiSectionRawTagEditor.prototype);
      expect(editor.renderDisclosureContent($wrap)).toBe('rendered');
      expect(render).toHaveBeenCalledTimes(1);
      expect(rows.map(({ el }) => labelOf(el))).toEqual(['Elevator', undefined]);
    });
  });
});

describe('tag editor value dropdown', () => {
  it('suggests every code for a coded key, each shown with its meaning', () => {
    const suggestions = gtfsValueSuggestions('pathway_mode')!;
    expect(suggestions.map(s => [s.value, s.title])).toEqual([
      ['1', '1: Walkway'], ['2', '2: Stairs'], ['3', '3: Moving Sidewalk'], ['4', '4: Escalator'],
      ['5', '5: Elevator'], ['6', '6: Fare Gate'], ['7', '7: Exit Gate']
    ]);

    // Rapid calls display() with a d3 selection of the option element.
    const option = document.createElement('div');
    const select = (el: Element): any => ({
      text: (t: string) => {
        el.textContent = t;
        return select(el);
      },
      append: (tag: string) => select(el.appendChild(document.createElement(tag))),
      attr: (name: string, v: string) => {
        el.setAttribute(name, v);
        return select(el);
      }
    });
    suggestions[4]!.display(select(option));
    expect(option.firstChild!.textContent).toBe('5');
    expect(option.querySelector(`.${OPTION_LABEL_CLASS}`)!.textContent).toBe('Elevator');
  });

  it('leaves other keys alone', () => {
    expect(gtfsValueSuggestions('stop_name')).toBeUndefined();
  });

  it('answers coded keys from the GTFS labels and passes other keys to taginfo', () => {
    const values = vi.fn((_params: unknown, callback: (err: unknown, data?: unknown[]) => void) => callback(null, [{ value: 'yes' }]));
    const context = { services: { taginfo: { values } } };
    installTagValueSuggestions(context);
    installTagValueSuggestions(context); // second install is a no-op

    const coded = vi.fn();
    (context.services.taginfo.values as any)({ key: 'is_bidirectional', query: '' }, coded);
    expect(coded.mock.calls[0]![1].map((s: { value: string }) => s.value)).toEqual(['0', '1']);
    expect(values).not.toHaveBeenCalled();

    const other = vi.fn();
    (context.services.taginfo.values as any)({ key: 'surface', query: '' }, other);
    expect(values).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledWith(null, [{ value: 'yes' }]);
  });

  it('answers reference keys with the defined choices, labeled', () => {
    const values = vi.fn();
    const context = { services: { taginfo: { values } } };
    const choicesFor = vi.fn((key: string) => (key === 'level_id' ? [{ value: 'L1', label: 'Concourse (L1)' }] : undefined));
    installTagValueSuggestions(context, choicesFor);

    const callback = vi.fn();
    (context.services.taginfo.values as any)({ key: 'level_id', query: '' }, callback);
    expect(callback.mock.calls[0]![1].map((s: { value: string; title: string }) => [s.value, s.title]))
      .toEqual([['L1', 'L1: Concourse (L1)']]);

    // Coded keys still get the GTFS labels; other keys still go to taginfo.
    (context.services.taginfo.values as any)({ key: 'pathway_mode', query: '' }, callback);
    expect(callback.mock.calls[1]![1]).toHaveLength(7);
    (context.services.taginfo.values as any)({ key: 'surface', query: '' }, callback);
    expect(values).toHaveBeenCalledTimes(1);
  });

  it('narrows reference choices to those matching what\'s typed, by ID or name', () => {
    const values = vi.fn();
    const context = { services: { taginfo: { values } } };
    installTagValueSuggestions(context, () => [
      { value: 'J02_L0', label: 'Street (J02_L0)', description: 'Street · Van Dorn St' },
      { value: 'J02_L1', label: 'Mezzanine (J02_L1)' },
      { value: 'N01_L0', label: 'Street (N01_L0)' }
    ]);
    const typed = (query: string) => {
      const callback = vi.fn();
      (context.services.taginfo.values as any)({ key: 'level_id', query }, callback);
      return callback.mock.calls[0]![1].map((s: { value: string }) => s.value);
    };

    expect(typed('j02')).toEqual(['J02_L0', 'J02_L1']);
    expect(typed('van dorn')).toEqual(['J02_L0']); // by station, from the description
    expect(typed('mezz')).toEqual(['J02_L1']);
    expect(typed('')).toEqual(['J02_L0', 'J02_L1', 'N01_L0']);
    expect(typed('zzz')).toEqual([]);
    expect(values).not.toHaveBeenCalled();
  });

  it('shows a choice\'s description beside its value in the dropdown, if it has one', () => {
    const values = vi.fn();
    const context = { services: { taginfo: { values } } };
    installTagValueSuggestions(context, () => [
      { value: 'J02_L0', label: 'J02_L0', description: 'Van Dorn St' },
      { value: 'P1', label: 'Platform 1 (P1)' }
    ]);
    const callback = vi.fn();
    (context.services.taginfo.values as any)({ key: 'level_id', query: '' }, callback);
    expect(callback.mock.calls[0]![1].map((s: { title: string }) => s.title))
      .toEqual(['J02_L0: Van Dorn St', 'P1: Platform 1 (P1)']);
  });

  it('offers no choices (rather than taginfo\'s) when nothing is defined yet', () => {
    const values = vi.fn();
    const context = { services: { taginfo: { values } } };
    installTagValueSuggestions(context, () => []);

    const callback = vi.fn();
    (context.services.taginfo.values as any)({ key: 'parent_station', query: '' }, callback);

    expect(callback).toHaveBeenCalledWith(null, []);
    expect(values).not.toHaveBeenCalled();
  });
});

describe('installSingleChoiceDropdowns', () => {
  afterEach(() => {
    delete (globalThis as any).Rapid;
    vi.resetModules();
  });

  it('opens our dropdowns with one choice; other dropdowns keep Rapid\'s minimum of 2', async () => {
    const seenMinimums: number[] = [];
    class UiCombobox {
      _klass?: string;
      _suggestions: unknown[] = [];
      _minItems = 2;
      _render() {
        seenMinimums.push(this._minItems);
      }
    }
    (globalThis as any).Rapid = { UiCombobox };

    vi.resetModules();
    const { installSingleChoiceDropdowns, labeledSuggestions } = await import('~/services/rapid3-tag-labels');
    installSingleChoiceDropdowns();
    installSingleChoiceDropdowns(); // no double wrap

    const combo = (klass: string | undefined, suggestions: unknown[]) =>
      Object.assign(new UiCombobox(), { _klass: klass, _suggestions: suggestions });

    combo('combo-parent_station', [{ value: 'CENTRAL' }])._render(); // our field
    combo('combo-level_id', [])._render();
    combo('tag-value', labeledSuggestions([{ value: 'L1', label: 'Concourse (L1)' }]))._render(); // our list in the tag editor
    combo('tag-value', [{ value: 'asphalt' }])._render(); // taginfo's
    combo('combo-surface', [{ value: 'asphalt' }])._render(); // another field

    expect(seenMinimums).toEqual([1, 1, 1, 2, 2]);
    // The minimum is restored afterwards.
    const field = combo('combo-parent_station', []);
    field._render();
    expect(field._minItems).toBe(2);
  });
});

describe('level descriptions in the Fields section\'s combo dropdowns', () => {
  afterEach(() => {
    delete (globalThis as any).Rapid;
    vi.resetModules();
  });

  /** A fake d3 option: records its text and the label span appended to it. */
  function fakeOption() {
    const option = { text: '', spans: [] as { cls: string; text: string }[] };
    const $option = {
      text: (value: string) => {
        option.text = value;
        return $option;
      },
      append: () => {
        const span = { cls: '', text: '' };
        option.spans.push(span);
        const $span = {
          attr: (_: string, value: string) => {
            span.cls = value;
            return $span;
          },
          text: (value: string) => {
            span.text = value;
            return $span;
          }
        };
        return $span;
      }
    };
    return { option, $option };
  }

  it('shows each choice\'s description beside its value, keeping the picked label', () => {
    const items = [
      { key: 'J02_L0', value: 'J02_L0', display: 'J02_L0', title: 'J02_L0' },
      { key: 'L1', value: 'Concourse (L1)', display: 'Concourse (L1)', title: 'Concourse (L1)' },
      { key: 'OTHER', value: 'OTHER', display: 'OTHER', title: 'OTHER' }
    ];
    describeComboItems(items, [
      { value: 'J02_L0', description: 'Van Dorn St' },
      { value: 'L1', description: 'Concourse · Central' },
      { value: 'OTHER' } // no description: left as Rapid drew it
    ]);

    const { option, $option } = fakeOption();
    (items[0]!.display as unknown as (o: unknown) => void)($option);
    expect(option).toEqual({ text: 'J02_L0', spans: [{ cls: OPTION_LABEL_CLASS, text: 'Van Dorn St' }] });
    expect(items[1]!.title).toBe('L1: Concourse · Central');
    expect(items[1]!.value).toBe('Concourse (L1)'); // what the field shows once picked
    expect(items[2]!.display).toBe('OTHER');
    describeComboItems(undefined, []);
    describeComboItems(items, undefined);
  });

  it('wraps the combo field\'s lookup, reaching fields created later (which bind it), once', async () => {
    const fetched: unknown[][] = [];
    class UiFieldCombo {
      key: string;
      constructor(key: string) {
        this.key = key;
        this._setTaginfoValues = this._setTaginfoValues.bind(this); // as Rapid does
      }

      _setTaginfoValues(_q: string, callback?: (data: unknown[]) => void) {
        const data = [{ key: 'L1', value: 'Concourse (L1)', display: 'Concourse (L1)' }];
        fetched.push(data);
        callback?.(data);
      }
    }
    (globalThis as any).Rapid = { UiFieldCombo };
    const { installComboDescriptions } = await import('~/services/rapid3-tag-labels');
    const choicesFor = vi.fn((key: string) => (key === 'level_id' ? [{ value: 'L1', label: 'Concourse (L1)', description: 'Central' }] : undefined));

    installComboDescriptions(choicesFor);
    installComboDescriptions(choicesFor); // no double wrap
    const callback = vi.fn();
    new UiFieldCombo('level_id')._setTaginfoValues('', callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]![0][0].title).toBe('L1: Central');
    expect(typeof callback.mock.calls[0]![0][0].display).toBe('function');

    new UiFieldCombo('surface')._setTaginfoValues('', callback);
    expect(callback.mock.calls[1]![0][0].display).toBe('Concourse (L1)'); // other fields untouched
    expect(choicesFor).toHaveBeenCalledTimes(2);
  });
});

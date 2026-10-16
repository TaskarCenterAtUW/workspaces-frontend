import { afterEach, describe, expect, it, vi } from 'vitest';
import { GTFS_VALUE_LABELS, gtfsValueLabel } from '~/services/gtfs-value-labels';
import {
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
});

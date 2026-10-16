import { describe, expect, it } from 'vitest';
import pathwaysSchema from '~/services/rapid3-pathways-schema.json';

// The GTFS Pathways schema Rapid 3 merges for pathways workspaces
// (services/rapid3.ts #preStart). Rapid silently drops references it can't
// resolve, so a typo here shows up only as a missing field or preset in the
// editor; these checks catch that at test time instead.

// Columns from the GTFS reference (gtfs.org/documentation/schedule/reference)
// that an editor can set as tags. stop_lat/stop_lon come from the geometry, and
// pathways' from_stop_id/to_stop_id from the way's endpoints.
const STOPS_COLUMNS = new Set([
  'stop_id', 'stop_code', 'stop_name', 'tts_stop_name', 'stop_desc', 'zone_id',
  'stop_url', 'location_type', 'parent_station', 'stop_timezone',
  'wheelchair_boarding', 'level_id', 'platform_code', 'stop_access'
]);
const PATHWAYS_COLUMNS = new Set([
  'pathway_id', 'pathway_mode', 'is_bidirectional', 'length', 'traversal_time',
  'stair_count', 'max_slope', 'min_width', 'signposted_as', 'reversed_signposted_as'
]);

type SchemaField = { key: string; type: string; options?: string[]; strings?: { options?: Record<string, string> } };

const [scope] = pathwaysSchema.scopes;
const fields = scope!.fields as Record<string, SchemaField>;
const presets = scope!.presets as Record<string, {
  fields?: string[];
  moreFields?: string[];
  geometry: string[];
  tags?: Record<string, string>;
} | null>;
const categories = scope!.categories as Record<string, { members: string[]; name: string } | null>;
const defaults = scope!.defaults as Record<string, string[]>;

describe('Rapid 3 pathways schema', () => {
  it('is a single osm-scope asset with an id Rapid can merge once', () => {
    expect(pathwaysSchema.assetID).toBe('tdei-pathways-schema');
    expect(pathwaysSchema.scopes).toHaveLength(1);
    expect(scope!.scope).toBe('osm');
  });

  it('deletes the OSM presets and categories before adding its own', () => {
    expect(Object.keys(presets)[0]).toBe('*');
    expect(presets['*']).toBeNull();
    expect(Object.keys(categories)[0]).toBe('*');
    expect(categories['*']).toBeNull();
  });

  it('only references fields it defines', () => {
    for (const [id, preset] of Object.entries(presets)) {
      if (!preset) continue;
      for (const fieldID of [...(preset.fields ?? []), ...(preset.moreFields ?? [])]) {
        expect(fields, `${id} -> ${fieldID}`).toHaveProperty([fieldID]);
      }
    }
  });

  it('only lists existing presets in categories and defaults', () => {
    const items = new Set([...Object.keys(presets), ...Object.keys(categories)].filter(k => k !== '*'));
    for (const [id, category] of Object.entries(categories)) {
      if (!category) continue;
      expect(category.name, id).toBeTruthy();
      for (const member of category.members) {
        expect(items.has(member), `${id} -> ${member}`).toBe(true);
      }
    }
    for (const [geometry, ids] of Object.entries(defaults)) {
      for (const id of ids) {
        expect(items.has(id), `${geometry} -> ${id}`).toBe(true);
      }
    }
  });

  it('gives every pathway and stop preset identifying tags', () => {
    for (const [id, preset] of Object.entries(presets)) {
      if (!preset) continue;
      expect(Object.keys(preset.tags ?? {}).length, id).toBeGreaterThan(0);
    }
  });

  describe('GTFS conformance', () => {
    const stopPresets = Object.entries(presets).filter(([, p]) => p?.tags?.location_type !== undefined);
    const pathwayPresets = Object.entries(presets).filter(([, p]) => p?.tags?.pathway_mode !== undefined);

    it('has one preset per location_type and pathway_mode value', () => {
      expect(stopPresets.map(([, p]) => p!.tags!.location_type).sort()).toEqual(['0', '1', '2', '3', '4']);
      expect(pathwayPresets.map(([, p]) => p!.tags!.pathway_mode).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    });

    it('only tags stops with stops.txt columns', () => {
      for (const [id, preset] of stopPresets) {
        for (const fieldID of [...(preset!.fields ?? []), ...(preset!.moreFields ?? [])]) {
          expect(STOPS_COLUMNS.has(fields[fieldID]!.key), `${id} -> ${fields[fieldID]!.key}`).toBe(true);
        }
      }
    });

    it('only tags pathways with pathways.txt columns', () => {
      for (const [id, preset] of pathwayPresets) {
        for (const fieldID of [...(preset!.fields ?? []), ...(preset!.moreFields ?? [])]) {
          expect(PATHWAYS_COLUMNS.has(fields[fieldID]!.key), `${id} -> ${fields[fieldID]!.key}`).toBe(true);
        }
      }
    });

    it('offers only GTFS enum values, each with a label', () => {
      const enums: Record<string, string[]> = {
        is_bidirectional: ['0', '1'],
        wheelchair_boarding: ['0', '1', '2']
      };
      for (const [fieldID, values] of Object.entries(enums)) {
        expect([...fields[fieldID]!.options!].sort(), fieldID).toEqual(values);
        expect(Object.keys(fields[fieldID]!.strings!.options!).sort(), fieldID).toEqual(values);
      }
    });

    it('treats ID references as free text', () => {
      for (const fieldID of ['level_id', 'parent_station', 'zone_id']) {
        expect(fields[fieldID]!.type, fieldID).toBe('text');
        expect(fields[fieldID]!.options, fieldID).toBeUndefined();
      }
    });

    it('keeps exit gates unidirectional', () => {
      expect(presets['pathway/exit_gate']!.tags!.is_bidirectional).toBe('0');
    });

    it('lets stops that end a pathway match as vertices', () => {
      for (const id of ['platform', 'entrance_exit', 'node', 'boarding_area']) {
        expect(presets[id]!.geometry, id).toContain('vertex');
      }
    });
  });
});

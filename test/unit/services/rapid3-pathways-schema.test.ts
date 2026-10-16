import { describe, expect, it } from 'vitest';
import pathwaysSchema from '~/services/rapid3-pathways-schema.json';

// The GTFS Pathways schema Rapid 3 merges for pathways workspaces
// (services/rapid3.ts #preStart). Rapid silently drops references it can't
// resolve, so a typo here shows up only as a missing field or preset in the
// editor; these checks catch that at test time instead.

const [scope] = pathwaysSchema.scopes;
const fields = scope!.fields as Record<string, unknown>;
const presets = scope!.presets as Record<string, { fields?: string[]; moreFields?: string[]; tags?: object } | null>;
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
});

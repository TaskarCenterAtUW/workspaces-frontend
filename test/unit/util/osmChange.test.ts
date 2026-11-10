import { describe, expect, it } from 'vitest';

import { osmNode, osmRelation, osmWay } from '../../mocks/osm-elements';

import { OsmChangeBuilder } from '~/util/osmChange';

/** Pulls the elements out of one osmChange section, in document order. */
function section(xml: string, name: 'create' | 'modify' | 'delete') {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const block = doc.getElementsByTagName(name)[0]!;

  return Array.from(block.children).map((element) => {
    const children = Array.from(element.children);

    return {
      tag: element.tagName.toLowerCase(),
      id: element.getAttribute('id'),
      version: element.getAttribute('version'),
      changeset: element.getAttribute('changeset'),
      refs: children
        .filter(child => ['nd', 'member'].includes(child.tagName.toLowerCase()))
        .map(child => child.getAttribute('ref')),
      tags: Object.fromEntries(
        children
          .filter(child => child.tagName.toLowerCase() === 'tag')
          .map(child => [child.getAttribute('k'), child.getAttribute('v')])
      )
    };
  });
}

describe('OsmChangeBuilder placeholder IDs', () => {
  it('gives every created element a negative placeholder, whatever its version', () => {
    // The API rejects the whole changeset when a <create> carries a positive
    // ID, and an element's version in its source workspace says nothing about
    // whether it exists in the target.
    const builder = new OsmChangeBuilder(77);

    builder.create(osmNode(500));
    builder.create(osmNode(501, { version: 4 }));

    expect(section(builder.serializeXml(), 'create').map(e => e.id))
      .toEqual(['-1', '-2']);
  });

  it('numbers placeholders independently per element type', () => {
    const builder = new OsmChangeBuilder(77);

    builder.create(osmNode(1));
    builder.create(osmWay(1, [1]));
    builder.create(osmRelation(1, [{ type: 'way', ref: 1, role: '' }]));

    expect(section(builder.serializeXml(), 'create').map(e => [e.tag, e.id]))
      .toEqual([['node', '-1'], ['way', '-1'], ['relation', '-1']]);
  });

  it('repoints way node refs at the placeholders assigned to those nodes', () => {
    const builder = new OsmChangeBuilder(77);

    builder.create(osmNode(500, { version: 3 }));
    builder.create(osmNode(501, { version: 3 }));
    builder.create(osmWay(900, [500, 501], { version: 2 }));

    expect(section(builder.serializeXml(), 'create')[2]!.refs).toEqual(['-1', '-2']);
  });

  it('repoints relation member refs, including references to other relations', () => {
    const builder = new OsmChangeBuilder(77);

    builder.create(osmNode(10));
    builder.create(osmWay(20, [10]));
    builder.create(osmRelation(30, [{ type: 'way', ref: 20, role: 'outer' }]));
    builder.create(osmRelation(31, [
      { type: 'node', ref: 10, role: '' },
      { type: 'relation', ref: 30, role: 'sub' }
    ]));

    const created = section(builder.serializeXml(), 'create');

    expect(created[2]!.refs).toEqual(['-1']);
    expect(created[3]!.refs).toEqual(['-1', '-1']);
  });

  it('throws, naming the referrer, rather than emitting a ref it cannot resolve', () => {
    // Falling back to the original ID here produces a reference the server
    // cannot resolve, and the upload fails partway through with a message that
    // points at the server instead of at the changeset being built.
    const builder = new OsmChangeBuilder(77);

    expect(() => builder.create(osmWay(900, [12345], { version: 2 })))
      .toThrow(/way 900 references node 12345/);
  });
});

describe('OsmChangeBuilder element serialization', () => {
  it('writes lat and lon as separate attributes', () => {
    const builder = new OsmChangeBuilder(77);
    builder.create(osmNode(1));

    const xml = builder.serializeXml();

    expect(xml).toMatch(/lat="47\.6"/);
    expect(xml).toMatch(/lon="-122\.3"/);
  });

  it('stamps every element with the changeset it was built for', () => {
    const builder = new OsmChangeBuilder(77);
    builder.create(osmNode(1));

    expect(section(builder.serializeXml(), 'create')[0]!.changeset).toBe('77');
  });

  it('omits version on create and carries it on modify and delete', () => {
    // Version is the optimistic-concurrency check for an element that already
    // exists. A created element has no previous version to check against.
    const builder = new OsmChangeBuilder(77);

    builder.create(osmNode(1));
    builder.modify(osmNode(2, { version: 5 }));
    builder.delete(osmNode(3, { version: 9 }));

    const xml = builder.serializeXml();

    expect(section(xml, 'create')[0]!.version).toBeNull();
    expect(section(xml, 'modify')[0]!.version).toBe('5');
    expect(section(xml, 'delete')[0]!.version).toBe('9');
  });

  it('keeps the original ID for modify and delete', () => {
    const builder = new OsmChangeBuilder(77);

    builder.modify(osmNode(42, { version: 5 }));
    builder.delete(osmNode(43, { version: 9 }));

    const xml = builder.serializeXml();

    expect(section(xml, 'modify')[0]!.id).toBe('42');
    expect(section(xml, 'delete')[0]!.id).toBe('43');
  });

  it('escapes XML metacharacters in tag keys and values', () => {
    const builder = new OsmChangeBuilder(77);

    builder.create(osmNode(1, {
      tags: { 'name': 'A & <B> "C"', 'evil"/><relation id="9': 'x' }
    }));

    const xml = builder.serializeXml();

    expect(xml).not.toMatch(/<relation id="9"/);
    expect(section(xml, 'create')[0]!.tags).toEqual({
      'name': 'A & <B> "C"',
      'evil"/><relation id="9': 'x'
    });
  });

  it('drops a tag with no value instead of writing the string "undefined"', () => {
    const builder = new OsmChangeBuilder(77);

    builder.create(osmNode(1, {
      tags: { surface: undefined as unknown as string, highway: 'footway' }
    }));

    expect(section(builder.serializeXml(), 'create')[0]!.tags)
      .toEqual({ highway: 'footway' });
  });

  it('produces a well-formed document with no elements', () => {
    const xml = new OsmChangeBuilder(77).serializeXml();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(section(xml, 'create')).toEqual([]);
  });
});

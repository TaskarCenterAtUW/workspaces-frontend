import * as xml from '~/util/xml';

import type { OsmChangeActionType, OsmElement, OsmElementType } from '~/types/osm';

const OSC_TEMPLATE = '<osmChange version="0.6"><create /><modify /><delete /></osmChange>';

export class OsmChangeBuilder {
  readonly #doc: XMLDocument;
  readonly #createNode: ChildNode;
  readonly #modifyNode: ChildNode;
  readonly #deleteNode: ChildNode;
  readonly #changesetId: number;

  readonly #idLookup: Record<OsmElementType, Map<number, number>> = {
    node: new Map(),
    way: new Map(),
    relation: new Map()
  };

  readonly #placeholderSequence: Record<OsmElementType, number> = {
    node: -1,
    way: -1,
    relation: -1
  };

  constructor(changesetId: number) {
    this.#doc = xml.parse(OSC_TEMPLATE);

    const osmChange = this.#doc.firstChild!;

    this.#createNode = osmChange.childNodes[0]!;
    this.#modifyNode = osmChange.childNodes[1]!;
    this.#deleteNode = osmChange.childNodes[2]!;
    this.#changesetId = changesetId;
  }

  create(element: OsmElement) {
    this.#createNode.appendChild(this.#element2Xml(element, 'create'));
  }

  modify(element: OsmElement) {
    this.#modifyNode.appendChild(this.#element2Xml(element, 'modify'));
  }

  delete(element: OsmElement) {
    this.#deleteNode.appendChild(this.#element2Xml(element, 'delete'));
  }

  serializeXml(): string {
    return xml.serialize(this.#doc);
  }

  #element2Xml(element: OsmElement, action: OsmChangeActionType): Element {
    const feature = xml.makeNode(this.#doc, element.type, {
      id: this.#getId(element, action),
      changeset: this.#changesetId
    });

    // The API uses "version" for optimistic concurrency on an element that
    // already exists. A created element has no previous version to check:
    //
    if (action !== 'create') {
      feature.setAttribute('version', element.version.toString());
    }

    if (element.type === 'node') {
      feature.setAttribute('lat', element.lat.toString());
      feature.setAttribute('lon', element.lon.toString());
    } else if (element.type === 'way') {
      for (const ref of element.nodes) {
        feature.appendChild(xml.makeNode(this.#doc, 'nd', {
          ref: this.#getIdFor('node', ref, element)
        }));
      }
    } else if (element.type === 'relation') {
      for (const member of element.members) {
        feature.appendChild(xml.makeNode(this.#doc, 'member', {
          ref: this.#getIdFor(member.type, member.ref, element),
          type: member.type,
          role: member.role
        }));
      }
    }

    // A for...in loop here could pollute this by walking the prototype chain:
    //
    for (const [key, value] of Object.entries(element.tags ?? { })) {
      // A tag with no value is a tag the caller meant to drop. Serializing it
      // would write the string "undefined" into the dataset:
      //
      if (value === undefined) {
        continue;
      }

      feature.appendChild(xml.makeNode(this.#doc, 'tag', { k: key, v: value }));
    }

    return feature;
  }

  #getId(element: OsmElement, action: OsmChangeActionType): number {
    const id = action === 'create'
      ? this.#placeholderSequence[element.type]--
      : element.id;

    this.#idLookup[element.type].set(element.id, id);

    return id;
  }

  #getIdFor(type: OsmElementType, id: number, referrer: OsmElement): number {
    const placeholder = this.#idLookup[type].get(id);

    if (placeholder === undefined) {
      // Emitting the original ID here would produce a reference the server
      // cannot resolve, and the upload would fail partway through with a
      // message that points at the server rather than at this builder:
      //
      throw new Error(
        `${referrer.type} ${referrer.id} references ${type} ${id}, `
        + 'which is not part of this changeset'
      );
    }

    return placeholder;
  }
}


const xmlParser = new DOMParser();
const xmlSerializer = new XMLSerializer();

export function parse(input: string): XMLDocument {
  return xmlParser.parseFromString(input, 'application/xml');
}

export function serialize(input: XMLDocument): string {
  return xmlSerializer.serializeToString(input);
}

export function makeNode(doc: XMLDocument, tag: string, attrs: object): Element {
  const node = doc.createElement(tag);

  for (const prop in attrs) {
    node.setAttribute(prop, attrs[prop]);
  }

  return node;
}

export function pullAttributesByName(input: string, attributeName: string, elementName: string): Array<string> {
  const doc = parse(input);
  const elements = doc.getElementsByTagName(elementName);
  const attributes = [];
  var curAttribute;

  for (let i = 0; i < elements.length; i++) {
    curAttribute = elements[i].getAttribute(attributeName);
    if (curAttribute) {
      attributes.push(curAttribute);
    }
  }

  return attributes;
}
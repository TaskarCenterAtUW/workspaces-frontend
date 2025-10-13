
const xmlParser = new DOMParser();
const xmlSerializer = new XMLSerializer();

export function isMimeXml(mimeType: string): boolean {
  return mimeType === 'text/xml'
    || mimeType === 'application/xml'
    || mimeType.startsWith('application/') && mimeType.endsWith('+xml');
}

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

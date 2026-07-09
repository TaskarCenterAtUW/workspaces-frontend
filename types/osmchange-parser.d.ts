declare module '@osmcha/osmchange-parser' {
  import type { OsmChange } from './osm';

  // The parser is async (built on the streaming `sax` parser); it resolves once
  // parsing completes. Typing it as a Promise prevents callers from using the
  // result without awaiting — doing so yields a Promise that JSON-stringifies to
  // "{}" and whose `create`/`modify`/`delete` reads are silently undefined.
  export default function parseOsmChangeXml(xmlString: string): Promise<OsmChange>;
}

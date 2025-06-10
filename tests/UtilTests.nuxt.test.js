// @vitest-environment nuxt
import { test } from 'vitest'
import { pullAttributesByName } from '../util/xml.js'

test('XML pullAttributesByName test', () => {
    const xmlString = `<example><item id="4">Howdy</item><item id="5">There</from></example>`;
    
    const attributeList = pullAttributesByName(xmlString, 'item', 'id');
    expect(attributeList).toEqual(['4', '5']);

    const missingAttributeList = pullAttributesByName(xmlString, 'item', 'missing');
    expect(missingAttributeList).toEqual([]);
})
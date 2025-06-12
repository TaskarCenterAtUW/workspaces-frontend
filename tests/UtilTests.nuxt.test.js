// @vitest-environment nuxt
import { expect, test } from 'vitest'
import { pullAttributesByName } from '~/util/xml'

test('XML pullAttributesByName test', () => {
    const xmlString = `<example><item id="4">Howdy</item><item id="5">There</from></example>`;
    
    const attributeList = pullAttributesByName(xmlString, 'id', 'item');
    expect(attributeList).toEqual(['4', '5']);

    const missingAttributeList = pullAttributesByName(xmlString, 'missing', 'id');
    expect(missingAttributeList).toEqual([]);
})
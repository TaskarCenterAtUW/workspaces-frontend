import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import {
  getDatasetArchiveWarning,
  inspectDatasetArchive
} from '~/services/import/file';

async function createArchive(files: Record<string, string>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter());

  for (const [filename, contents] of Object.entries(files)) {
    await writer.add(filename, new TextReader(contents));
  }

  return await writer.close();
}

describe('dataset archive inspection', () => {
  it('detects metadata.json from entry names without reading entry contents', async () => {
    const inspection = await inspectDatasetArchive(await createArchive({
      'export/metadata.json': '{}',
      'export/dataset.zip': 'nested archive'
    }));

    expect(inspection.hasMetadata).toBe(true);
    expect(getDatasetArchiveWarning(inspection, 'osw')).toContain('direct TDEI dataset download');
  });

  it('accepts a Pathways archive containing txt files', async () => {
    const inspection = await inspectDatasetArchive(await createArchive({
      'google_transit/stops.txt': 'stop_id,stop_name'
    }));

    expect(getDatasetArchiveWarning(inspection, 'pathways')).toBeNull();
  });

  it('accepts an OpenSidewalks archive containing geojson files', async () => {
    const inspection = await inspectDatasetArchive(await createArchive({
      'network.geojson': '{"type":"FeatureCollection","features":[]}'
    }));

    expect(getDatasetArchiveWarning(inspection, 'osw')).toBeNull();
  });

  it('warns when the archive does not match the selected dataset type', async () => {
    const inspection = await inspectDatasetArchive(await createArchive({
      'stops.txt': 'stop_id,stop_name'
    }));

    expect(getDatasetArchiveWarning(inspection, 'osw')).toContain('.geojson');
  });

  it('rejects a file that is not a valid ZIP archive', async () => {
    await expect(inspectDatasetArchive(new Blob(['not a zip']))).rejects.toThrow();
  });
});

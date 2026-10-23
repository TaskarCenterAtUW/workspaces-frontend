import { describe, expect, it, vi } from 'vitest';

import { TdeiExporter, TdeiExporterContext } from '~/services/export/tdei';
import { aWorkspace } from '../../mocks/fixtures';

import type { OsmApiClient } from '~/services/osm';
import type { TdeiClient } from '~/services/tdei';
import type { Workspace } from '~/types/workspaces';

// The fixture is shaped like the API response, which sends null for fields
// the client type declares optional:
const workspace = {
  ...aWorkspace,
  type: 'osw',
  tdeiServiceId: 'service-1'
} as unknown as Workspace;

function makeExporter(bbox: unknown) {
  const osmClient = {
    getWorkspaceBbox: vi.fn().mockResolvedValue(bbox),
    // Stops the export at the first step past the checks, so a test can tell
    // whether it got that far without stubbing the whole upload:
    exportWorkspaceXml: vi.fn().mockRejectedValue(new Error('reached the export'))
  };
  const tdeiClient = {
    convertDataset: vi.fn(),
    uploadOswDataset: vi.fn()
  };
  const exporter = new TdeiExporter(
    tdeiClient as unknown as TdeiClient,
    osmClient as unknown as OsmApiClient,
    new TdeiExporterContext()
  );

  return { exporter, osmClient, tdeiClient };
}

describe('TdeiExporter.upload', () => {
  it('refuses a workspace with no bounding box before exporting anything', async () => {
    const { exporter, osmClient, tdeiClient } = makeExporter(undefined);

    await exporter.upload(workspace, { } as never);

    expect(exporter.context.error).toContain('holds no data, so there is nothing to export');
    expect(osmClient.exportWorkspaceXml).not.toHaveBeenCalled();
    expect(tdeiClient.convertDataset).not.toHaveBeenCalled();
    expect(tdeiClient.uploadOswDataset).not.toHaveBeenCalled();
  });

  it('reuses the bounding box it checked as the dataset area', async () => {
    const { exporter, osmClient } = makeExporter({
      min_lon: -122.4,
      min_lat: 47.6,
      max_lon: -122.2,
      max_lat: 47.8
    });
    const metadata: Record<string, unknown> = { };

    await exporter.upload(workspace, metadata as never);

    expect(osmClient.getWorkspaceBbox).toHaveBeenCalledTimes(1);
    expect(osmClient.exportWorkspaceXml).toHaveBeenCalledWith(workspace.id);
    expect(exporter.context.error).not.toContain('holds no data');
    expect(metadata.dataset_area).toMatchObject({ type: 'FeatureCollection' });
  });

  it('keeps a dataset area the user already supplied', async () => {
    const { exporter } = makeExporter({ min_lon: 1, min_lat: 2, max_lon: 3, max_lat: 4 });
    const area = { type: 'FeatureCollection', features: [] };
    const metadata: Record<string, unknown> = { dataset_area: area };

    await exporter.upload(workspace, metadata as never);

    expect(metadata.dataset_area).toBe(area);
  });
});

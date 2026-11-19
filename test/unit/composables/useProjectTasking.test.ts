// @vitest-environment nuxt

import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Polygon } from 'geojson';
import type {
  ProjectWizardAreaFeature,
  ProjectWizardGeneratedTaskFeatureCollection
} from '~/types/project-wizard';

const { generateProjectTasks, saveProjectTasks } = vi.hoisted(() => ({
  generateProjectTasks: vi.fn(),
  saveProjectTasks: vi.fn()
}));

vi.mock('~/services/index', () => ({
  projectWizardClient: { generateProjectTasks, saveProjectTasks }
}));

const { useProjectTasking } = await import('~/composables/useProjectTasking');
const { createProjectWizardTaskAoiSignature } = await import('~/services/project-wizard-tasks');

const METERS_PER_DEGREE_LATITUDE = 111_195.08;

function square(lon: number, lat: number, sideMeters: number): Polygon {
  const dLat = sideMeters / METERS_PER_DEGREE_LATITUDE;
  const dLon = sideMeters / (METERS_PER_DEGREE_LATITUDE * Math.cos(lat * Math.PI / 180));

  return {
    type: 'Polygon',
    coordinates: [[[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]]]
  };
}

const aoi: ProjectWizardAreaFeature = {
  type: 'Feature',
  geometry: square(-122.3, 47.6, 2000),
  properties: {}
} as ProjectWizardAreaFeature;

const taskGrid: ProjectWizardGeneratedTaskFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: square(-122.3, 47.6, 670), properties: { id: 'big' } },
    { type: 'Feature', geometry: square(-122.29, 47.6, 20), properties: { id: 'sliver' } }
  ]
};

function setup() {
  generateProjectTasks.mockResolvedValue({
    aoiSignature: createProjectWizardTaskAoiSignature(aoi),
    approximateTaskAreaSquareKilometers: 0.45,
    generatedAt: '2026-11-19T00:00:00Z',
    requestedTaskAreaSquareKilometers: 0.45,
    taskGrid,
    totalTasks: 2
  });
  saveProjectTasks.mockResolvedValue({ taskCount: 1, taskGrid });

  return useProjectTasking({ aoi: ref(aoi), projectId: ref('42'), workspaceId: 1 });
}

describe('useProjectTasking small tasks', () => {
  beforeEach(() => {
    generateProjectTasks.mockReset();
    saveProjectTasks.mockReset();
  });

  it('counts small tasks and removes them from the save by default', async () => {
    const tasking = setup();
    await tasking.generateTasks();

    expect(tasking.smallTaskCount.value).toBe(1);
    expect(tasking.discardSmallTasks.value).toBe(true);
    expect(tasking.taskCountToSave.value).toBe(1);

    await tasking.saveTasks();

    const savedGrid = saveProjectTasks.mock.calls[0]![2] as ProjectWizardGeneratedTaskFeatureCollection;
    expect(savedGrid.features.map(feature => feature.properties?.id)).toEqual(['big']);
  });

  it('saves every task when the user keeps the small ones', async () => {
    const tasking = setup();
    await tasking.generateTasks();
    tasking.discardSmallTasks.value = false;

    expect(tasking.taskCountToSave.value).toBe(2);

    await tasking.saveTasks();

    const savedGrid = saveProjectTasks.mock.calls[0]![2] as ProjectWizardGeneratedTaskFeatureCollection;
    expect(savedGrid.features.map(feature => feature.properties?.id)).toEqual(['big', 'sliver']);
  });

  it('flags small tasks on the map grid without changing the saved features', async () => {
    const tasking = setup();
    await tasking.generateTasks();

    const flags = tasking.generatedTaskGridForDisplay.value!.features.map(feature => feature.properties?.smallTask);
    expect(flags).toEqual([undefined, true]);
    expect(taskGrid.features[1]!.properties).toEqual({ id: 'sliver' });
  });

  it('goes back to removing small tasks after generating again', async () => {
    const tasking = setup();
    await tasking.generateTasks();
    tasking.discardSmallTasks.value = false;
    await tasking.generateTasks();

    expect(tasking.discardSmallTasks.value).toBe(true);
  });
});

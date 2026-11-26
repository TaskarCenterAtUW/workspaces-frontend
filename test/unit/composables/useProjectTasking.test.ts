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
    { type: 'Feature', geometry: square(-122.29, 47.6, 20), properties: { id: 'sliver' } },
    { type: 'Feature', geometry: square(-122.28, 47.6, 30), properties: { id: 'sliver-2' } }
  ]
};

function setup() {
  generateProjectTasks.mockResolvedValue({
    aoiSignature: createProjectWizardTaskAoiSignature(aoi),
    approximateTaskAreaSquareKilometers: 0.45,
    generatedAt: '2026-11-19T00:00:00Z',
    requestedTaskAreaSquareKilometers: 0.45,
    taskGrid,
    totalTasks: 3
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

    expect(tasking.smallTaskCount.value).toBe(2);
    expect(tasking.keptSmallTaskCount.value).toBe(0);
    expect(tasking.taskCountToSave.value).toBe(1);

    await tasking.saveTasks();

    const savedGrid = saveProjectTasks.mock.calls[0]![2] as ProjectWizardGeneratedTaskFeatureCollection;
    expect(savedGrid.features.map(feature => feature.properties?.id)).toEqual(['big']);
  });

  it('saves only the individual small-task exceptions selected by the user', async () => {
    const tasking = setup();
    await tasking.generateTasks();
    tasking.setSmallTaskKept(1, true);

    expect(tasking.keptSmallTaskCount.value).toBe(1);
    expect(tasking.taskCountToSave.value).toBe(2);

    await tasking.saveTasks();

    const savedGrid = saveProjectTasks.mock.calls[0]![2] as ProjectWizardGeneratedTaskFeatureCollection;
    expect(savedGrid.features.map(feature => feature.properties?.id)).toEqual(['big', 'sliver-2']);
  });

  it('flags small tasks on the map grid without changing the saved features', async () => {
    const tasking = setup();
    await tasking.generateTasks();

    const flags = tasking.generatedTaskGridForDisplay.value!.features.map(feature => feature.properties?.smallTask);
    const indexes = tasking.generatedTaskGridForDisplay.value!.features.map(feature => feature.properties?.smallTaskIndex);
    const kept = tasking.generatedTaskGridForDisplay.value!.features.map(feature => feature.properties?.smallTaskKept);
    expect(flags).toEqual([undefined, true, true]);
    expect(indexes).toEqual([undefined, 0, 1]);
    expect(kept).toEqual([undefined, false, false]);
    expect(taskGrid.features[1]!.properties).toEqual({ id: 'sliver' });
    expect(taskGrid.features[2]!.properties).toEqual({ id: 'sliver-2' });
  });

  it('clears kept exceptions after generating again', async () => {
    const tasking = setup();
    await tasking.generateTasks();
    tasking.setSmallTaskKept(0, true);
    await tasking.generateTasks();

    expect(tasking.keptSmallTaskCount.value).toBe(0);
  });
});

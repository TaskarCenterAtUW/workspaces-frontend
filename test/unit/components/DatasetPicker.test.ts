// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import DatasetPicker from '~/components/DatasetPicker.vue';
import type { TdeiDatasetSummary } from '~/types/tdei';

const mockGetAvailableDatasetsByName = vi.fn();
const mockLoadCapabilities = vi.fn();

vi.mock('~/services/index', () => ({
  tdeiClient: {
    clone: () => ({
      getAvailableDatasetsByName: mockGetAvailableDatasetsByName
    })
  }
}));

vi.mock('~/composables/useUserCapabilities', () => ({
  useUserCapabilities: () => ({
    canCreateInProjectGroup: () => true,
    getEligibleProjectGroupsForType: () => [{ tdei_project_group_id: 'pg-1', name: 'Test PG', roles: ['poc'] }],
    load: mockLoadCapabilities
  })
}));

const SAMPLE_DATASETS: TdeiDatasetSummary[] = [
  {
    id: 'dataset-1',
    name: 'Downtown Sidewalks',
    version: '1.0',
    raw: {
      tdei_dataset_id: 'dataset-1',
      status: 'Publish',
      data_type: 'osw',
      is_released: true,
      project_group: {
        tdei_project_group_id: 'pg-1',
        name: 'Test PG'
      },
      metadata: {
        dataset_detail: {
          name: 'Downtown Sidewalks',
          version: '1.0',
          collected_by: 'tester',
          collection_date: '2026-01-01',
          data_source: 'InHouse',
          schema_version: 'v0.2'
        }
      }
    }
  }
];

describe('DatasetPicker', () => {
  it('loads and displays available datasets on focus', async () => {
    mockGetAvailableDatasetsByName.mockResolvedValueOnce(SAMPLE_DATASETS);

    const wrapper = await mountSuspended(DatasetPicker, {
      props: {
        id: 'test-dataset-picker',
        modelValue: null
      }
    });

    const input = wrapper.find('input');
    await input.trigger('focus');

    expect(mockGetAvailableDatasetsByName).toHaveBeenCalledWith('', 1, 10);
    const options = wrapper.findAll('li[role="option"]');
    expect(options.length).toBe(1);
    expect(options[0]!.text()).toContain('Downtown Sidewalks (version 1.0)');
  });

  it('allows clearing selection and reloads default datasets', async () => {
    mockGetAvailableDatasetsByName.mockResolvedValue(SAMPLE_DATASETS);

    const wrapper = await mountSuspended(DatasetPicker, {
      props: {
        id: 'test-dataset-picker',
        modelValue: 'dataset-1',
        selectedDataset: SAMPLE_DATASETS[0]
      }
    });

    expect(wrapper.find('input').element.value).toBe('Downtown Sidewalks (version 1.0)');
    const clearBtn = wrapper.find('.dataset-clear-button');
    expect(clearBtn.exists()).toBe(true);

    await clearBtn.trigger('click');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null]);
    expect(mockGetAvailableDatasetsByName).toHaveBeenCalledWith('', 1, 10);
  });

  it('recovers and reloads datasets when focus returns after empty search result', async () => {
    mockGetAvailableDatasetsByName
      .mockResolvedValueOnce(SAMPLE_DATASETS)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(SAMPLE_DATASETS);

    const wrapper = await mountSuspended(DatasetPicker, {
      props: {
        id: 'test-dataset-picker',
        modelValue: null
      }
    });

    const input = wrapper.find('input');
    await input.trigger('focus');

    // Simulate blur without selection after invalid query
    await wrapper.find('.dataset-picker').trigger('focusout');

    // Re-focusing should reload the full list
    await input.trigger('focus');
    expect(mockGetAvailableDatasetsByName).toHaveBeenCalledWith('', 1, 10);
  });
});

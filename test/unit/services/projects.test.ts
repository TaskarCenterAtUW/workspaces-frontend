import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { WorkspaceProjectsClient } from '~/services/projects';
import { server } from '../../mocks/server';
import { TEST_API_BASE } from '../../mocks/fixtures';

import type { TdeiClient } from '~/services/tdei';
import type { WorkspaceProjectTaskApiItem } from '~/types/projects';

const tdeiClient = {
  sendProtectedRequest: async (
    request: (accessToken: string) => Promise<Response>
  ) => await request('test-access-token'),
  auth: { complete: false, accessToken: '' },
} as unknown as TdeiClient;

function makeClient() {
  return new WorkspaceProjectsClient(TEST_API_BASE, tdeiClient);
}

function makeTask(taskNumber: number): WorkspaceProjectTaskApiItem {
  return {
    id: 13_563 + taskNumber,
    task_number: taskNumber,
    status: 'to_map',
    geometry: {
      type: 'Polygon',
      coordinates: [],
    },
    area_sqkm: 0.001,
    lock: null,
    last_mapper: null,
    created_at: '2026-07-23T09:07:38.988772Z',
    updated_at: '2026-07-23T09:07:38.989055Z',
  };
}

describe('WorkspaceProjectsClient.getWorkspaceProjectTasks', () => {
  it('uses the maximum supported API page size', async () => {
    const allTasks = Array.from({ length: 450 }, (_, index) => makeTask(index + 1));
    let requestedPage = '';
    let requestedPageSize = '';

    server.use(
      http.get(`${TEST_API_BASE}workspaces/1763/tasking/projects/39/tasks`, ({ request }) => {
        const url = new URL(request.url);

        requestedPage = url.searchParams.get('page') ?? '';
        requestedPageSize = url.searchParams.get('page_size') ?? '';

        return HttpResponse.json({
          tasks: allTasks,
          pagination: {
            page: 1,
            page_size: 1000,
            total: allTasks.length,
          },
        });
      }),
    );

    const tasks = await makeClient().getWorkspaceProjectTasks(1763, 39);

    expect(requestedPage).toBe('1');
    expect(requestedPageSize).toBe('1000');
    expect(tasks).toHaveLength(450);
    expect(tasks[0]).toMatchObject({ id: '13564', label: 'Task #1', taskNumber: 1 });
    expect(tasks[449]).toMatchObject({ id: '14013', label: 'Task #450', taskNumber: 450 });
  });

  it('fetches and combines every API page when a project has more than 1000 tasks', async () => {
    const allTasks = Array.from({ length: 1250 }, (_, index) => makeTask(index + 1));
    const requestedPages: string[] = [];

    server.use(
      http.get(`${TEST_API_BASE}workspaces/1763/tasking/projects/39/tasks`, ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page'));
        const pageSize = Number(url.searchParams.get('page_size'));
        const pageStart = (page - 1) * pageSize;

        requestedPages.push(url.searchParams.get('page') ?? '');

        return HttpResponse.json({
          tasks: allTasks.slice(pageStart, pageStart + pageSize),
          pagination: {
            page,
            page_size: pageSize,
            total: allTasks.length,
          },
        });
      }),
    );

    const tasks = await makeClient().getWorkspaceProjectTasks(1763, 39);

    expect(requestedPages).toEqual(['1', '2']);
    expect(tasks).toHaveLength(1250);
    expect(tasks[0]?.taskNumber).toBe(1);
    expect(tasks[1249]?.taskNumber).toBe(1250);
  });
});

describe('WorkspaceProjectsClient.getWorkspaceProjectTaskDetail', () => {
  it('normalizes task feedback returned by the detail endpoint', async () => {
    server.use(
      http.get(
        `${TEST_API_BASE}workspaces/1764/tasking/projects/46/tasks/9`,
        () => HttpResponse.json({
          ...makeTask(9),
          feedback: [{
            reason_category: 'incomplete_mapping',
            notes: 'Complete the missing crossings.',
            created_at: '2026-08-06T10:45:34.533Z',
            created_by_user_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            created_by_user_name: 'Ada Lovelace',
          }],
        }),
      ),
    );

    const task = await makeClient().getWorkspaceProjectTaskDetail(1764, 46, 9);

    expect(task.feedback).toEqual([{
      reasonCategory: 'incomplete_mapping',
      notes: 'Complete the missing crossings.',
      createdAt: new Date('2026-08-06T10:45:34.533Z'),
      createdByUserId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      createdByUserName: 'Ada Lovelace',
    }]);
  });
});

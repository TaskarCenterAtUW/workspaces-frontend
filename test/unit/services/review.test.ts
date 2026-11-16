import { describe, expect, it, vi } from 'vitest';
import {
  CHANGESET_LIST_LIMIT,
  ReviewList,
  ReviewListFilter,
  endOfDateInput,
  listContributors,
  startOfDateInput,
  toDateInputValue,
} from '~/services/review';

import type { ChangesetManager } from '~/services/changesets';
import type { OsmApiClient } from '~/services/osm';
import type { TdeiClient } from '~/services/tdei';
import type { WorkspacesClient } from '~/services/workspaces';
import type { OsmChangeset, OsmNote } from '~/types/osm';
import type { User, WorkspaceTeam } from '~/types/workspaces';

function changeset(id: number, uid: number, user: string, createdAt: string): OsmChangeset {
  return {
    id,
    uid,
    user,
    created_at: new Date(createdAt),
    tags: { comment: `changeset ${id}` },
  } as unknown as OsmChangeset;
}

function member(id: number, displayName: string): User {
  return { id, auth_uid: `auth-${id}`, email: `${id}@example.com`, display_name: displayName };
}

function note(uid?: number): OsmNote {
  return {
    id: 10,
    status: 'open',
    lat: 0,
    lon: 0,
    created_at: new Date('2026-06-05T10:00:00'),
    comments: [{
      action: 'opened',
      date: new Date('2026-06-05T10:00:00'),
      user: uid === undefined ? undefined : `mapper_${uid}`,
      uid,
      text: 'note',
      html: '<p>note</p>',
    }],
  };
}

const changesets = [
  changeset(1, 7, 'mapper_jane', '2026-06-01T10:00:00'),
  changeset(2, 8, 'mapper_bob', '2026-06-05T10:00:00'),
  changeset(3, 9, 'mapper_cy', '2026-06-10T23:30:00'),
  changeset(4, 7, 'mapper_jane', '2026-06-15T10:00:00'),
];

const teams: WorkspaceTeam[] = [
  { id: 1, name: 'North', member_count: 2 },
  { id: 2, name: 'South', member_count: 2 },
];

const teamMembers: Record<number, User[]> = {
  1: [member(7, 'Jane D.'), member(8, 'Bob B.')],
  2: [member(8, 'Bob B.'), member(42, 'No changesets')],
};

function makeList(overrides: Partial<Record<'getTeams' | 'getTeamMembers', unknown>> = {}) {
  const osmClient = {
    listChangesets: vi.fn().mockResolvedValue(changesets),
    getNotes: vi.fn().mockResolvedValue([]),
  } as unknown as OsmApiClient;
  const workspacesClient = {
    getWorkspace: vi.fn().mockResolvedValue({ id: 1, tdeiRecordId: null }),
    getFixmes: vi.fn().mockResolvedValue([]),
    getTeams: vi.fn().mockResolvedValue(teams),
    getTeamMembers: vi.fn((_id: number, teamId: number) => Promise.resolve(teamMembers[teamId] ?? [])),
    ...overrides,
  } as unknown as WorkspacesClient;

  const list = new ReviewList(
    {} as ChangesetManager,
    osmClient,
    {} as TdeiClient,
    workspacesClient,
    1,
  );

  return { list, osmClient, workspacesClient };
}

function changesetFilter(): ReviewListFilter {
  const filter = new ReviewListFilter();
  filter.includeFeedback = false;
  filter.includeNotes = false;
  filter.includeFixmes = false;
  return filter;
}

function ids(list: ReviewList): number[] {
  return list.items.map(item => item.id).sort((a, b) => a - b);
}

describe('date input helpers', () => {
  it('round-trips a local date', () => {
    expect(toDateInputValue(startOfDateInput('2026-06-05'))).toBe('2026-06-05');
    expect(toDateInputValue(undefined)).toBe('');
  });

  it('starts and ends a day in local time', () => {
    expect(startOfDateInput('2026-06-05')).toEqual(new Date(2026, 5, 5));
    expect(endOfDateInput('2026-06-05')).toEqual(new Date(2026, 5, 5, 23, 59, 59, 999));
  });

  it('treats an empty or malformed value as no bound', () => {
    expect(startOfDateInput('')).toBeUndefined();
    expect(endOfDateInput('June 5')).toBeUndefined();
  });
});

describe('listContributors', () => {
  it('lists each uid once, sorted by name', () => {
    expect(listContributors(changesets)).toEqual([
      { uid: 8, user: 'mapper_bob' },
      { uid: 9, user: 'mapper_cy' },
      { uid: 7, user: 'mapper_jane' },
    ]);
  });
});

describe('ReviewListFilter', () => {
  it('flags a From date after the To date', () => {
    const filter = new ReviewListFilter();
    filter.startDate = startOfDateInput('2026-06-10');
    filter.endDate = endOfDateInput('2026-06-09');
    expect(filter.hasDateRangeError).toBe(true);

    filter.endDate = endOfDateInput('2026-06-10');
    expect(filter.hasDateRangeError).toBe(false);
  });

  it('matches contributors by uid, not by name', () => {
    const filter = new ReviewListFilter();
    filter.contributorId = 7;
    expect(filter.testChangeset(changeset(1, 7, 'renamed', '2026-06-01T10:00:00'))).toBe(true);
    expect(filter.testChangeset(changeset(2, 8, 'mapper_jane', '2026-06-01T10:00:00'))).toBe(false);
  });

  it('shows no changesets for a team filter whose members are unresolved', () => {
    const filter = new ReviewListFilter();
    filter.teamIds = [1];
    expect(filter.testChangeset(changesets[0]!)).toBe(false);
  });

  it('matches notes by contributor and team member uid', () => {
    const filter = new ReviewListFilter();
    filter.contributorId = 7;
    filter.teamIds = [1];
    const teamMemberIds = new Set([7, 8]);

    expect(filter.testNote(note(7), teamMemberIds)).toBe(true);
    expect(filter.testNote(note(9), teamMemberIds)).toBe(false);
    expect(filter.testNote(note(), teamMemberIds)).toBe(false);
  });
});

describe('ReviewList changeset filters', () => {
  it('shows every changeset with no filters set', async () => {
    const { list, osmClient } = makeList();
    await list.refresh(changesetFilter());
    expect(ids(list)).toEqual([1, 2, 3, 4]);
    expect(osmClient.listChangesets).toHaveBeenCalledWith(1, {
      from: undefined,
      to: undefined,
      limit: CHANGESET_LIST_LIMIT,
    });
  });

  it('filters by a date range that includes both end days', async () => {
    const { list, osmClient } = makeList();
    const filter = changesetFilter();
    filter.startDate = startOfDateInput('2026-06-05');
    filter.endDate = endOfDateInput('2026-06-10');
    await list.refresh(filter);
    expect(ids(list)).toEqual([2, 3]);
    expect(osmClient.listChangesets).toHaveBeenCalledWith(1, {
      from: new Date('2026-06-05T00:00:00Z'),
      to: new Date('2026-06-10T23:59:59Z'),
      limit: CHANGESET_LIST_LIMIT,
    });
  });

  it('filters by only a From or only a To date', async () => {
    const { list } = makeList();
    const filter = changesetFilter();
    filter.startDate = startOfDateInput('2026-06-10');
    await list.refresh(filter);
    expect(ids(list)).toEqual([3, 4]);

    filter.startDate = undefined;
    filter.endDate = endOfDateInput('2026-06-04');
    await list.refresh(filter);
    expect(ids(list)).toEqual([1]);
  });

  it('filters by one contributor', async () => {
    const { list, osmClient } = makeList();
    const filter = changesetFilter();
    filter.contributorId = 7;
    await list.refresh(filter);
    expect(ids(list)).toEqual([1, 4]);
    expect(osmClient.listChangesets).toHaveBeenLastCalledWith(1, {
      from: undefined,
      to: undefined,
      limit: CHANGESET_LIST_LIMIT,
      user: 7,
    });

    filter.contributorId = 9;
    await list.refresh(filter);
    expect(ids(list)).toEqual([3]);
    expect(osmClient.listChangesets).toHaveBeenCalledWith(1, expect.objectContaining({ user: 9 }));
  });

  it('keeps listing every contributor while filtered by one', async () => {
    const { list } = makeList();
    const filter = changesetFilter();
    filter.contributorId = 9;
    await list.refresh(filter);
    expect(list.contributors.map(c => c.uid)).toEqual([8, 9, 7]);
  });

  it('filters by a team, matching member id to changeset uid', async () => {
    const { list, workspacesClient } = makeList();
    const filter = changesetFilter();
    filter.teamIds = [1];
    await list.refresh(filter);
    expect(ids(list)).toEqual([1, 2, 4]);
    expect(workspacesClient.getTeamMembers).toHaveBeenCalledWith(1, 1);
  });

  it('combines the members of several teams', async () => {
    const { list, workspacesClient } = makeList();
    const filter = changesetFilter();
    filter.teamIds = [2];
    await list.refresh(filter);
    expect(ids(list)).toEqual([2]);

    filter.teamIds = [1, 2];
    await list.refresh(filter);
    expect(ids(list)).toEqual([1, 2, 4]);
    expect(workspacesClient.getTeamMembers).toHaveBeenCalledWith(1, 2);
  });

  it('applies date, contributor and team filters together', async () => {
    const { list } = makeList();
    const filter = changesetFilter();
    filter.teamIds = [1];
    filter.contributorId = 7;
    filter.startDate = startOfDateInput('2026-06-10');
    await list.refresh(filter);
    expect(ids(list)).toEqual([4]);
  });

  it('fetches no team members when no team is selected', async () => {
    const { list, workspacesClient } = makeList();
    await list.refresh(changesetFilter());
    expect(workspacesClient.getTeamMembers).not.toHaveBeenCalled();
  });

  it('does not fetch feedback or fixmes while an OSM filter is active', async () => {
    const { list, osmClient, workspacesClient } = makeList();
    const filter = new ReviewListFilter();
    filter.teamIds = [1];

    await list.refresh(filter);

    expect(workspacesClient.getFixmes).not.toHaveBeenCalled();
    expect(osmClient.getNotes).toHaveBeenCalledWith(1, false, {
      from: undefined,
      to: undefined,
      user: undefined,
    });
  });

  it('loads the workspace teams once', async () => {
    const { list, workspacesClient } = makeList();
    await list.refresh(changesetFilter());
    await list.refresh(changesetFilter());
    expect(list.teams).toEqual(teams);
    expect(workspacesClient.getTeams).toHaveBeenCalledTimes(1);
  });

  it('still lists changesets when the teams cannot be loaded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { list } = makeList({ getTeams: vi.fn().mockRejectedValue(new Error('403')) });
    await list.refresh(changesetFilter());
    expect(ids(list)).toEqual([1, 2, 3, 4]);
    expect(list.teams).toEqual([]);
  });
});

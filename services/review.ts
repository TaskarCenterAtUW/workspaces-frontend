import type { ChangesetManager } from '~/services/changesets';
import type { OsmApiClient } from '~/services/osm';
import type { TdeiClient } from '~/services/tdei';
import type { WorkspacesClient } from '~/services/workspaces';
import type { OsmChange, OsmChangeset, OsmFixme, OsmNote } from '~/types/osm';
import type { TdeiFeedback } from '~/types/tdei';
import type { Workspace, WorkspaceTeam } from '~/types/workspaces';

export const $CHANGESET = Symbol('changeset');
export const $FEEDBACK = Symbol('feedback');
export const $NOTE = Symbol('note');
export const $FIXME = Symbol('fixme');

/**
 * The most changesets the OSM API returns from one list call. Review filters
 * apply within these, so they can't find older changesets (see AB#3776).
 */
export const CHANGESET_LIST_LIMIT = 100;

export type ReviewItemData = OsmChangeset | OsmNote | TdeiFeedback | OsmFixme;

export class ReviewListItem {
  readonly type: symbol;
  readonly key: symbol;
  readonly data: ReviewItemData;

  loadingChangeset: boolean = false;
  oscPromise?: Promise<OsmChange>;

  constructor(type: symbol, data: ReviewItemData) {
    this.type = type;
    this.key = Symbol();
    this.data = data;
  }

  get id(): number {
    return this.data.id;
  }

  get isChangeset(): boolean {
    return this.type === $CHANGESET;
  }

  get isFeedback(): boolean {
    return this.type === $FEEDBACK;
  }

  get isNote(): boolean {
    return this.type === $NOTE;
  }

  get isFixme(): boolean {
    return this.type === $FIXME;
  }

  /** For a fixme: its element as the editor names it, e.g. "n5" or "w20". */
  get elementRef(): string | undefined {
    if (!this.isFixme) {
      return undefined;
    }
    const fixme = this.data as OsmFixme;
    return `${fixme.type[0]}${fixme.id}`;
  }

  get isResolved(): boolean {
    switch (this.type) {
      case $CHANGESET:
        return !!(this.data as OsmChangeset).tags?.reviewed_by;
      case $FEEDBACK:
        return (this.data as TdeiFeedback).status !== 'open';
      case $NOTE:
        return (this.data as OsmNote).status !== 'open';
    }

    // A fixme is open while its tag is there; removing the tag resolves it.
    return false;
  }

  get needsReview(): boolean {
    return this.isChangeset && (this.data as OsmChangeset).tags?.review_requested === 'yes';
  }

  get displayType(): string {
    switch (this.type) {
      case $CHANGESET:
        return 'Changeset';
      case $FEEDBACK:
        return 'Feedback';
      case $NOTE:
        return 'Note';
      case $FIXME:
        return 'Fixme';
    }

    return 'Unknown';
  }

  get title(): string | undefined {
    switch (this.type) {
      case $CHANGESET:
        return (this.data as OsmChangeset).tags?.comment || '(no comment)';
      case $FEEDBACK:
        return (this.data as TdeiFeedback).feedback_text;
      case $NOTE:
        return (this.data as OsmNote).comments[0]?.text;
      case $FIXME:
        return (this.data as OsmFixme).note;
    }

    return undefined;
  }

  get displayName(): string {
    switch (this.type) {
      case $CHANGESET:
        return (this.data as OsmChangeset).user;
      case $FEEDBACK:
        return (this.data as TdeiFeedback).customer_email;
      case $NOTE:
        return (this.data as OsmNote).comments[0]?.user ?? 'Anonymous';
      case $FIXME: {
        // The element it's on: its name if it has one, e.g. "Platform A", else "way 20".
        const fixme = this.data as OsmFixme;
        const name = fixme.tags.name || fixme.tags.stop_name || fixme.tags.level_name;
        return name ? `${name} (${fixme.type})` : `${fixme.type} ${fixme.id}`;
      }
    }

    return 'Unknown';
  }

  get feedbackOverdue(): boolean {
    return this.isFeedback
      && (this.data as TdeiFeedback).status === 'open'
      && (this.data as TdeiFeedback).due_date < new Date();
  }

  get hasComments(): boolean {
    return this.commentCount > 0;
  }

  get commentCount(): number {
    switch (this.type) {
      case $CHANGESET:
        return (this.data as OsmChangeset).comments_count;
      case $NOTE:
        return (this.data as OsmNote).comments.length - 1;
    }

    return 0;
  }

  get badgeClass(): string {
    switch (this.type) {
      case $CHANGESET:
        return this.needsReview ? 'bg-warning text-dark' : 'bg-dark';
      case $FEEDBACK:
        return 'bg-danger';
      case $NOTE:
        return 'bg-info';
      case $FIXME:
        return 'bg-primary';
    }

    return 'bg-secondary';
  }

  get badgeIcon(): string {
    switch (this.type) {
      case $CHANGESET:
        return 'commit';
      case $FIXME:
        return 'flag';
    }

    return 'chat_bubble';
  }

  get changesetCounts() {
    return {
      create: (this.data as OsmChangeset).osmChange?.create?.length ?? 0,
      modify: (this.data as OsmChangeset).osmChange?.modify?.length ?? 0,
      delete: (this.data as OsmChangeset).osmChange?.delete?.length ?? 0,
    };
  }

  async awaitOsmChange(promise: Promise<OsmChange>): Promise<void> {
    this.loadingChangeset = true;
    this.oscPromise = promise;

    try {
      (this.data as OsmChangeset).osmChange = await promise;
    }
    finally {
      // Do not keep retrying a request that has already finished or failed.
      this.loadingChangeset = false;
      this.oscPromise = undefined;
    }
  }
}

export class ReviewListFilter {
  includeChangesets: boolean = true;
  includeFeedback: boolean = true;
  includeNotes: boolean = true;
  includeFixmes: boolean = true;
  includeResolved: boolean = false;
  includeNeedsReview: boolean = false;
  startDate: Date | undefined;
  endDate: Date | undefined;
  text: string | undefined;
  /** OSM uids of the contributors whose changesets to show; empty shows all. */
  contributorIds: number[] = [];
  /** Workspace teams whose members' changesets to show; empty shows all. */
  teamIds: number[] = [];

  get hasDateRangeError(): boolean {
    return !!(this.startDate && this.endDate && this.startDate > this.endDate);
  }

  testDates(item: ReviewItemData): boolean {
    if (this.startDate && item.created_at < this.startDate) {
      return false;
    }
    if (this.endDate && item.created_at > this.endDate) {
      return false;
    }

    return true;
  }

  /**
   * @param teamMemberIds the OSM uids of the members of the selected teams,
   *   which ReviewList resolves from `teamIds` before filtering.
   */
  testChangeset(changeset: OsmChangeset, teamMemberIds?: ReadonlySet<number>) {
    if (!this.testDates(changeset)) {
      return false;
    }
    if (this.contributorIds.length && !this.contributorIds.includes(changeset.uid)) {
      return false;
    }
    if (this.teamIds.length && !teamMemberIds?.has(changeset.uid)) {
      return false;
    }
    if (this.text && !changeset.tags?.comment?.includes(this.text)) {
      return false;
    }
    if (!this.includeResolved && changeset.tags?.reviewed_by) {
      return false;
    }
    if (this.includeNeedsReview && changeset.tags?.review_requested !== 'yes') {
      return false;
    }

    return true;
  }

  testFeedback(feedback: TdeiFeedback) {
    if (!this.testDates(feedback)) {
      return false;
    }
    if (this.text && !feedback.feedback_text.includes(this.text)) {
      return false;
    }
    if (!this.includeResolved && feedback.status !== 'open') {
      return false;
    }

    return true;
  }

  testNote(note: OsmNote) {
    if (!this.testDates(note)) {
      return false;
    }
    if (this.text && !note.comments[0]?.text.includes(this.text)) {
      return false;
    }

    return true;
  }

  testFixme(fixme: OsmFixme) {
    if (!this.testDates(fixme)) {
      return false;
    }
    if (this.text && !fixme.note.includes(this.text)) {
      return false;
    }

    return true;
  }
}

/** "YYYY-MM-DD" for a date input, in local time. */
export function toDateInputValue(date: Date | undefined): string {
  if (!date) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local start of the day a date input names, or undefined when empty. */
export function startOfDateInput(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : undefined;
}

/** The local end of the day a date input names, so the range includes that day. */
export function endOfDateInput(value: string): Date | undefined {
  const start = startOfDateInput(value);
  return start
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999)
    : undefined;
}

export interface ReviewContributor {
  uid: number;
  user: string;
}

/** The distinct contributors of some changesets, sorted by name. */
export function listContributors(changesets: OsmChangeset[]): ReviewContributor[] {
  const byUid = new Map<number, ReviewContributor>();
  for (const { uid, user } of changesets) {
    if (!byUid.has(uid)) {
      byUid.set(uid, { uid, user });
    }
  }

  return [...byUid.values()]
    .sort((a, b) => a.user.localeCompare(b.user) || a.uid - b.uid);
}

function compareCreatedAtDesc(a: ReviewListItem, b: ReviewListItem) {
  return b.data.created_at.getTime() - a.data.created_at.getTime();
}

export class ReviewList {
  readonly #changesets: ChangesetManager;
  readonly #osmClient: OsmApiClient;
  readonly #tdeiClient: TdeiClient;
  readonly #workspacesClient: WorkspacesClient;

  readonly workspaceId: number;
  readonly items: ReviewListItem[] = [];
  /** Everyone with a changeset in the last list fetched, to filter by. */
  readonly contributors: ReviewContributor[] = [];
  /** The workspace's teams, to filter by. */
  readonly teams: WorkspaceTeam[] = [];

  workspace?: Workspace;
  #teamsLoaded = false;

  constructor(
    changesets: ChangesetManager,
    osmClient: OsmApiClient,
    tdeiClient: TdeiClient,
    workspacesClient: WorkspacesClient,
    workspaceId: number,
  ) {
    this.#changesets = changesets;
    this.#osmClient = osmClient;
    this.#tdeiClient = tdeiClient;
    this.#workspacesClient = workspacesClient;
    this.workspaceId = workspaceId;
  }

  async refresh(filter: ReviewListFilter) {
    this.items.length = 0;
    const [[changesets, feedback, notes, fixmes], teamMemberIds] = await Promise.all([
      this.#fetchLists(filter),
      this.#fetchTeamMemberIds(filter.teamIds),
      this.#loadTeams(),
    ]);

    // From every changeset fetched, so a contributor stays selectable while filtered.
    this.contributors.splice(0, this.contributors.length, ...listContributors(changesets));

    for (const changeset of changesets) {
      if (filter.testChangeset(changeset, teamMemberIds)) {
        this.items.push(new ReviewListItem($CHANGESET, changeset));
      }
    }

    for (const submission of feedback) {
      if (filter.testFeedback(submission)) {
        this.items.push(new ReviewListItem($FEEDBACK, submission));
      }
    }

    for (const note of notes) {
      if (filter.testNote(note)) {
        this.items.push(new ReviewListItem($NOTE, note));
      }
    }

    for (const fixme of fixmes) {
      if (filter.testFixme(fixme)) {
        this.items.push(new ReviewListItem($FIXME, fixme));
      }
    }

    this.items.sort(compareCreatedAtDesc);
  }

  async loadOsmChange(item: ReviewListItem) {
    if (!item.isChangeset) {
      return;
    }

    const changeset = item.data as OsmChangeset;
    try {
      await item.awaitOsmChange(this.#changesets.getOsc(this.workspaceId, changeset));
    }
    catch (error: unknown) {
      console.warn('Could not preload the changeset details.', error);
    }
  }

  async #loadTeams() {
    if (this.#teamsLoaded) {
      return;
    }

    try {
      const teams = await this.#workspacesClient.getTeams(this.workspaceId);
      this.teams.splice(0, this.teams.length, ...teams);
      this.#teamsLoaded = true;
    }
    catch (error: unknown) {
      // The list still works without team filtering; try again next refresh.
      console.warn('Could not load the workspace teams.', error);
    }
  }

  /** The OSM uids of everyone on the given teams. */
  async #fetchTeamMemberIds(teamIds: number[]): Promise<Set<number>> {
    const memberLists = await Promise.all(
      teamIds.map(teamId => this.#workspacesClient.getTeamMembers(this.workspaceId, teamId))
    );

    // Team members are users in the OSM DB, so their id is the changeset's uid.
    return new Set(memberLists.flat().map(member => member.id));
  }

  async #fetchLists(filter: ReviewListFilter) {
    const changesetPromise = filter.includeChangesets
      ? this.#osmClient.listChangesets(this.workspaceId)
      : Promise.resolve([]);
    const notePromise = filter.includeNotes
      ? this.#osmClient.getNotes(this.workspaceId, filter.includeResolved)
      : Promise.resolve([]);
    const fixmePromise = filter.includeFixmes
      ? this.#workspacesClient.getFixmes(this.workspaceId)
      : Promise.resolve([]);

    if (!this.workspace) {
      this.workspace = await this.#workspacesClient.getWorkspace(this.workspaceId);
    }

    const feedbackPromise = filter.includeFeedback && this.workspace?.tdeiRecordId
      ? this.#tdeiClient.getDatasetFeedback(this.workspace.tdeiRecordId, filter.includeResolved)
      : Promise.resolve([]);

    return await Promise.all([
      changesetPromise,
      feedbackPromise,
      notePromise,
      fixmePromise,
    ]);
  }
}

export class ReviewManager {
  readonly #changesets: ChangesetManager;
  readonly #osmClient: OsmApiClient;
  readonly #tdeiClient: TdeiClient;
  readonly #workspacesClient: WorkspacesClient;

  constructor(
    changesets: ChangesetManager,
    osmClient: OsmApiClient,
    tdeiClient: TdeiClient,
    workspacesClient: WorkspacesClient,
  ) {
    this.#changesets = changesets;
    this.#osmClient = osmClient;
    this.#tdeiClient = tdeiClient;
    this.#workspacesClient = workspacesClient;
  }

  getList(workspaceId: number): ReviewList {
    return new ReviewList(
      this.#changesets,
      this.#osmClient,
      this.#tdeiClient,
      this.#workspacesClient,
      workspaceId,
    );
  }

  getFilter(): ReviewListFilter {
    // TODO: enable saving/loading filters
    return new ReviewListFilter();
  }
}

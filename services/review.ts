import type { ChangesetManager } from '~/services/changesets';
import type { OsmApiClient } from '~/services/osm';
import type { TdeiClient } from '~/services/tdei';
import type { WorkspacesClient } from '~/services/workspaces';
import type { OsmChange, OsmChangeset, OsmNote } from '~/types/osm';
import type { TdeiFeedback } from '~/types/tdei';
import type { Workspace } from '~/types/workspaces';

export const $CHANGESET = Symbol('changeset');
export const $FEEDBACK = Symbol('feedback');
export const $NOTE = Symbol('note');

export type ReviewItemData = OsmChangeset | OsmNote | TdeiFeedback;

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

  get isResolved(): boolean {
    switch (this.type) {
      case $FEEDBACK:
        return (this.data as TdeiFeedback).status !== 'open';
      case $NOTE:
        return (this.data as OsmNote).status !== 'open';
    }

    return false;
  }

  get displayType(): string {
    switch (this.type) {
      case $CHANGESET:
        return 'Changeset';
      case $FEEDBACK:
        return 'Feedback';
      case $NOTE:
        return 'Note';
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
        return 'bg-dark';
      case $FEEDBACK:
        return 'bg-danger';
      case $NOTE:
        return 'bg-info';
    }

    return 'bg-secondary';
  }

  get badgeIcon(): string {
    return this.type === $CHANGESET ? 'commit' : 'chat_bubble';
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
    (this.data as OsmChangeset).osmChange = await promise;
    this.loadingChangeset = false;
  }
}

export class ReviewListFilter {
  includeChangesets: boolean = true;
  includeFeedback: boolean = true;
  includeNotes: boolean = true;
  includeResolved: boolean = false;
  startDate: Date | undefined;
  endDate: Date | undefined;
  text: string | undefined;

  testDates(item: ReviewItemData): boolean {
    if (this.startDate && item.created_at < this.startDate) {
      return false;
    }
    if (this.endDate && item.created_at > this.endDate) {
      return false;
    }

    return true;
  }

  testChangeset(changeset: OsmChangeset) {
    if (!this.testDates(changeset)) {
      return false;
    }
    if (this.text && !changeset.tags?.comment?.includes(this.text)) {
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

  workspace?: Workspace;

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
    const [changesets, feedback, notes] = await this.#fetchLists(filter);

    for (const changeset of changesets) {
      if (filter.testChangeset(changeset)) {
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

    this.items.sort(compareCreatedAtDesc);
  }

  async loadOsmChange(item: ReviewListItem) {
    if (!item.isChangeset) {
      return;
    }

    const changeset = item.data as OsmChangeset;
    item.awaitOsmChange(this.#changesets.getOsc(this.workspaceId, changeset));
  }

  async #fetchLists(filter: ReviewListFilter) {
    const changesetPromise = filter.includeChangesets
      ? this.#osmClient.listChangesets(this.workspaceId)
      : Promise.resolve([]);
    const notePromise = filter.includeNotes
      ? this.#osmClient.getNotes(this.workspaceId, filter.includeResolved)
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

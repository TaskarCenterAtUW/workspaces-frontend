import type { ChangesetManager } from '~/services/changesets';
import type { OsmApiClient } from '~/services/osm';
import type { TdeiClient } from '~/services/tdei';
import type { WorkspacesClient } from '~/services/workspaces';
import type { OsmChange, OsmChangeset, OsmFixme, OsmNote } from '~/types/osm';
import type { TdeiFeedback } from '~/types/tdei';
import type { Workspace } from '~/types/workspaces';

export const $CHANGESET = Symbol('changeset');
export const $FEEDBACK = Symbol('feedback');
export const $NOTE = Symbol('note');
export const $FIXME = Symbol('fixme');

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
    const [changesets, feedback, notes, fixmes] = await this.#fetchLists(filter);

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

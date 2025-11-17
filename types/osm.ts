
export type OsmElementType = 'node' | 'way' | 'relation';
export type OsmTags = Record<string, string>;
export type OsmRelationRef = { type: OsmElementType, ref: number, role: string};

interface BaseElement {
  id: number;
  visible?: boolean;
  version: number;
  changeset: number;
  timestamp: Date;
  user: string;
  uid: number;
  type: OsmElementType;
  tags: OsmTags;
};

export interface OsmNode extends BaseElement {
  type: 'node';
  lat: number;
  lon: number;
};

export interface OsmWay extends BaseElement {
  type: 'way';
  nodes: Array<number>;
};

export interface OsmRelation extends BaseElement {
  type: 'relation';
  members: Array<OsmRelationRef>;
};

export type OsmElement = OsmNode | OsmWay | OsmRelation;

export const OSMCHANGE_ACTION_TYPES = ['create', 'modify', 'delete'] as const;
type OsmChangeActionTypeTuple = typeof OSMCHANGE_ACTION_TYPES;
export type OsmChangeActionType = OsmChangeActionTypeTuple[number];

export type OsmChange = {
  [K in OsmChangeActionType]: Array<OsmElement> | undefined;
};

export interface OsmChangesetComment {
  id: number;
  text: string;
  visible: boolean;
  user: string;
  uid: string;
  date: Date;
};

export interface OsmChangeset {
  id: number;
  created_at: Date;
  closed_at: Date;
  open: boolean;
  user: string;
  uid: number;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  comments_count: number;
  changes_count: number;
  tags: OsmTags;
  comments?: Array<OsmChangesetComment>;
  osmChange: OsmChange; // Workspaces only
};

export type OsmNoteStatus = 'open' | 'closed';
export type OsmNoteAction = 'opened' | 'closed' | 'commented' | 'reopened';

export interface OsmNoteComment {
  action: OsmNoteAction;
  date: Date;
  user?: string;
  uid?: number;
  text: string;
  html: string;
}

export interface OsmNote {
  id: number;
  status: OsmNoteStatus;
  lat: number;
  lon: number;
  created_at: Date;
  comments: Array<OsmNoteComment>;
}
